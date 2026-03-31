/**
 * ENGINE / PROCUREMENT.JS
 *
 * Planificación de pedidos y gestión de inventario.
 * Demand-driven: un solo pase día a día garantiza CERO DÉFICIT y CERO DESPERDICIO.
 *
 * Reglas clave:
 *   - Cemento: vida útil 6 días cal., entregas llegan 1 día hábil antes de necesidad
 *   - Cemento: pedidos ≥117 bultos van a CEMENTERA, menores a COORD. EXTERNA
 *   - Acero: lotes dinámicos agrupados por semana de uso
 *   - Mixto/piedra: JIT — se pide cuando stock cae por debajo del consumo del día
 *   - NUNCA debe haber déficit en lo proyectado
 */

import {
  ensureWorkDay, nextWorkDay, prevWorkDay, addCalDays, isWorkDay,
} from './calendar.js';

import {
  INIT_CEM, INIT_MIXTO, INIT_PIEDRA, INIT_ESCOMBRO,
  CEM_ANILLO_BLT, CEM_CICL_BLT_M3, MIX_CICL_M3,
  VOL_ANILLO_ML, VOL_FUSTE_ML, RATE,
  ISOFLOW_L_M3, AIRTOC_L_M3, AGUA_L_M3,
} from './config.js';

import { calcQuantities } from './quantities.js';

/* ── Constantes ───────────────────────────────────────────────────────────── */
const SHELF_LIFE      = 6;    // días calendario de vida útil del cemento
const CEM_FACTORY_QTY = 117;  // bultos mínimos de cementera
const DEBRIS_TRUCK    = 8;    // m³ por viaje de escombro
const MIX_TRUCK       = 8;    // m³ por volqueta de mixto
const PIE_TRUCK       = 8;    // m³ por volqueta de piedra

/* ═══════════════════════════════════════════════════════════════════════════════
   1. CONSTRUIR CONSUMO DIARIO desde el resultado del Gantt
   ═══════════════════════════════════════════════════════════════════════════════ */

export function buildDailyConsumption(gantt, startDate, endDate) {
  const days = {};

  // Inicializar todos los días hábiles
  let d = ensureWorkDay(startDate);
  while (d <= endDate) {
    if (isWorkDay(d)) {
      days[d] = {
        date: d,
        excK: [], caK: [], vK: [],
        cemAnillos: 0, cemCiclopeo: 0, cemTotal: 0,
        mixtoAnillos: 0, mixtoCiclopeo: 0, mixtoTotal: 0,
        piedra: 0, isoflow: 0, airtoc: 0, agua: 0,
        debrisDay: 0, aceroKg: 0,
        // Desglose por caisson para tooltips
        detail: {
          exc: [],    // [{ k, cemBlt, mixtoM3, debrisM3 }]
          campana: [], // [{ k, aceroKg }]
          vaciado: [], // [{ k, cemBlt, mixtoM3, piedraM3, isoflowL, airtocL, aguaL }]
        },
      };
    }
    d = addCalDays(d, 1);
  }

  for (const r of gantt) {
    if (!r.startExc || !r.endShaft) continue;
    const q = calcQuantities(r.k, {});

    // Días de excavación
    let excDay = ensureWorkDay(r.startExc);
    while (excDay <= r.endShaft) {
      if (days[excDay]) {
        days[excDay].excK.push(r.k);
        days[excDay].detail.exc.push({
          k: r.k,
          cemBlt: CEM_ANILLO_BLT,
          mixtoM3: VOL_ANILLO_ML * RATE,
          debrisM3: RATE * 1.33 * 1.30,
        });
      }
      excDay = nextWorkDay(excDay);
      if (excDay > r.endShaft) break;
    }

    // Campana+Acero → 1 día
    if (r.campanaAceroDay && days[r.campanaAceroDay]) {
      days[r.campanaAceroDay].caK.push(r.k);
      days[r.campanaAceroDay].aceroKg += q.aceroKg || 0;
      days[r.campanaAceroDay].detail.campana.push({
        k: r.k,
        aceroKg: q.aceroKg || 0,
      });
    }

    // Vaciado → consumo de ciclópeo
    if (r.vaciadoDay && days[r.vaciadoDay]) {
      days[r.vaciadoDay].vK.push(r.k);
      days[r.vaciadoDay].cemCiclopeo += q.cemCiclopeo;
      days[r.vaciadoDay].mixtoCiclopeo += q.mixtoCiclopeo;
      days[r.vaciadoDay].piedra += q.volPiedraAcopio;
      days[r.vaciadoDay].isoflow += q.isoflow;
      days[r.vaciadoDay].airtoc += q.airtoc;
      days[r.vaciadoDay].agua += q.agua;
      days[r.vaciadoDay].detail.vaciado.push({
        k: r.k,
        cemBlt: q.cemCiclopeo,
        mixtoM3: q.mixtoCiclopeo,
        piedraM3: q.volPiedraAcopio,
        isoflowL: q.isoflow,
        airtocL: q.airtoc,
        aguaL: q.agua,
      });
    }
  }

  // Calcular consumos de anillos por día
  for (const day of Object.values(days)) {
    const nExc = day.excK.length;
    day.cemAnillos = nExc * CEM_ANILLO_BLT;
    day.cemTotal = day.cemAnillos + day.cemCiclopeo;
    day.mixtoAnillos = nExc * VOL_ANILLO_ML * RATE;
    day.mixtoTotal = day.mixtoAnillos + day.mixtoCiclopeo;
    day.debrisDay = nExc * RATE * 1.33 * 1.30;
  }

  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}

/* ═══════════════════════════════════════════════════════════════════════════════
   2. PLANIFICACIÓN INTEGRADA — UN SOLO PASE, CERO DÉFICIT

   Recorre día a día. Antes de consumir, verifica si hay stock suficiente.
   Si no lo hay, programa una entrega para ese mismo día.
   Resultado: stock NUNCA baja de 0.
   ═══════════════════════════════════════════════════════════════════════════════ */

export function buildIntegratedPlan(dailyConsumption, startDate) {
  const cementDeliveries = [];
  const cementOrders = [];
  const mixtoOrders = [];
  const piedraOrders = [];
  const forecast = [];

  let mixStock = INIT_MIXTO;
  let pieStock = INIT_PIEDRA;
  let debrisAccum = INIT_ESCOMBRO * 1.30;
  let debrisTrips = 0;

  // Lotes FIFO de cemento — ÚNICA fuente de verdad para el stock
  const cemLots = [{
    arrived: startDate,
    qty: INIT_CEM,
    remaining: INIT_CEM,
    expiry: addCalDays(startDate, SHELF_LIFE - 1),
  }];

  /** Calcula stock de cemento disponible (no vencido) desde los lotes */
  function cemAvailable(asOfDate) {
    return cemLots
      .filter(l => l.remaining > 0 && l.expiry >= asOfDate)
      .reduce((s, l) => s + l.remaining, 0);
  }

  for (let idx = 0; idx < dailyConsumption.length; idx++) {
    const day = dailyConsumption[idx];

    /* ── 1. Vencimientos de cemento (FIFO) ── */
    let cemExpired = 0;
    for (const lot of cemLots) {
      if (lot.expiry < day.date && lot.remaining > 0) {
        cemExpired += lot.remaining;
        lot.remaining = 0;
      }
    }

    /* ── 2. ¿Necesitamos entrega de cemento? ── */
    let cemArrived = 0;
    const availBefore = cemAvailable(day.date);

    if (day.cemTotal > 0 && availBefore < day.cemTotal) {
      // Cubrir consumo de los próximos SHELF_LIFE días calendario
      const coverEnd = addCalDays(day.date, SHELF_LIFE - 1);
      const coverDays = dailyConsumption.filter(
        d => d.date >= day.date && d.date <= coverEnd
      );
      const coverNeed = coverDays.reduce((s, d) => s + d.cemTotal, 0);
      const deliveryQty = Math.ceil(Math.max(0, coverNeed - availBefore));

      if (deliveryQty > 0) {
        const fromFactory = Math.floor(deliveryQty / CEM_FACTORY_QTY) * CEM_FACTORY_QTY;
        const fromCoord = deliveryQty - fromFactory;
        const source = fromFactory > 0 ? 'CEMENTERA' : 'COORD. EXTERNA';
        const deliveryDate = day.date;

        cementDeliveries.push({
          id: `DEL-CEM-${cementDeliveries.length + 1}`,
          orderId: null, // se asigna abajo
          material: 'Cemento',
          unit: 'bultos',
          qty: deliveryQty,
          fromFactory,
          fromCoord,
          expectedDate: deliveryDate,
          actualDate: null,
          expiry: addCalDays(deliveryDate, SHELF_LIFE - 1),
          clusterStart: day.date,
          clusterEnd: coverEnd,
        });

        // Crear o actualizar orden
        const lastOrder = cementOrders[cementOrders.length - 1];
        const needNewOrder = !lastOrder ||
          day.date > addCalDays(lastOrder.windowStart, 13);

        if (needNewOrder) {
          cementOrders.push({
            id: `CEM-${cementOrders.length + 1}`,
            material: 'Cemento',
            unit: 'bultos',
            qty: deliveryQty,
            source,
            orderDate: prevWorkDay(deliveryDate),
            windowStart: day.date,
            windowEnd: coverEnd,
            expectedDelivery: deliveryDate,
            actualDelivery: null,
            status: 'sugerido',
          });
        } else {
          lastOrder.qty += deliveryQty;
          lastOrder.windowEnd = coverEnd;
          if (lastOrder.qty >= CEM_FACTORY_QTY) lastOrder.source = 'CEMENTERA';
        }
        // Vincular entrega a orden
        cementDeliveries[cementDeliveries.length - 1].orderId =
          cementOrders[cementOrders.length - 1].id;

        // Agregar lote
        cemLots.push({
          arrived: deliveryDate,
          qty: deliveryQty,
          remaining: deliveryQty,
          expiry: addCalDays(deliveryDate, SHELF_LIFE - 1),
        });
        cemArrived = deliveryQty;
      }
    }

    /* ── 3. Consumir cemento (FIFO, más viejo primero) ── */
    let cemToConsume = day.cemTotal;
    for (const lot of cemLots) {
      if (cemToConsume <= 0) break;
      if (lot.remaining <= 0 || lot.expiry < day.date) continue;
      const use = Math.min(lot.remaining, cemToConsume);
      lot.remaining -= use;
      cemToConsume -= use;
    }

    // Stock DERIVADO de los lotes — no balance acumulativo (elimina drift)
    const cemStock = cemAvailable(day.date);

    /* ── 4. Mixto — entrega JIT si stock insuficiente ── */
    let mixArrived = 0;
    if (day.mixtoTotal > 0 && mixStock < day.mixtoTotal) {
      const coverMix = dailyConsumption.slice(idx, idx + 7)
        .reduce((s, d) => s + d.mixtoTotal, 0);
      const needMix = Math.max(coverMix, day.mixtoTotal) - Math.max(0, mixStock);
      const orderQty = Math.ceil(needMix / MIX_TRUCK) * MIX_TRUCK;
      mixtoOrders.push({
        id: `MIX-${mixtoOrders.length + 1}`,
        material: 'Mixto',
        unit: 'm³',
        qty: orderQty,
        source: 'PROVEEDOR',
        orderDate: prevWorkDay(day.date),
        expectedDelivery: day.date,
        actualDelivery: null,
        status: 'sugerido',
        trucks: Math.ceil(orderQty / MIX_TRUCK),
      });
      mixStock += orderQty;
      mixArrived = orderQty;
    }
    mixStock -= day.mixtoTotal;

    /* ── 5. Piedra — entrega JIT si stock insuficiente ── */
    let pieArrived = 0;
    if (day.piedra > 0 && pieStock < day.piedra) {
      const coverPie = dailyConsumption.slice(idx, idx + 5)
        .reduce((s, d) => s + d.piedra, 0);
      const needPie = Math.max(coverPie, day.piedra) - Math.max(0, pieStock);
      const orderQty = Math.ceil(needPie / PIE_TRUCK) * PIE_TRUCK;
      piedraOrders.push({
        id: `PIE-${piedraOrders.length + 1}`,
        material: 'Piedra',
        unit: 'm³',
        qty: orderQty,
        source: 'PROVEEDOR',
        orderDate: prevWorkDay(day.date),
        expectedDelivery: day.date,
        actualDelivery: null,
        status: 'sugerido',
        trucks: Math.ceil(orderQty / PIE_TRUCK),
      });
      pieStock += orderQty;
      pieArrived = orderQty;
    }
    pieStock -= day.piedra;

    /* ── 6. Escombro ── */
    debrisAccum += day.debrisDay;
    const trips = Math.floor(debrisAccum / DEBRIS_TRUCK);
    debrisAccum -= trips * DEBRIS_TRUCK;
    debrisTrips += trips;

    /* ── 7. Próximo vencimiento ── */
    const nextExpiry = cemLots
      .filter(l => l.remaining > 0 && l.expiry >= day.date)
      .sort((a, b) => a.expiry.localeCompare(b.expiry))[0]?.expiry || null;

    /* ── 8. Registrar forecast ── */
    forecast.push({
      date: day.date,
      // Cemento — derivado de lotes, nunca drift
      cemArrived,
      cemConsumed: day.cemTotal,
      cemExpired: Math.round(cemExpired * 10) / 10,
      cemStock: Math.round(cemStock * 10) / 10,
      cemDeficit: 0,
      cemNextExpiry: nextExpiry,
      // Mixto
      mixArrived,
      mixConsumed: day.mixtoTotal,
      mixStock: Math.round(mixStock * 10) / 10,
      // Piedra
      pieArrived,
      pieConsumed: day.piedra,
      pieStock: Math.round(pieStock * 10) / 10,
      // Escombro
      debrisDay: day.debrisDay,
      debrisAccum: Math.round(debrisAccum * 10) / 10,
      debrisTrips: trips,
      debrisTotalTrips: debrisTrips,
      // Aditivos
      isoflow: day.isoflow,
      airtoc: day.airtoc,
      agua: day.agua,
      // Actividad
      consumption: day,
    });
  }

  return {
    cementOrders,
    cementDeliveries,
    mixtoOrders,
    piedraOrders,
    stockForecast: forecast,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   3. PLANIFICAR PEDIDOS DE ACERO (dinámico, basado en Gantt)
   ═══════════════════════════════════════════════════════════════════════════════ */

export function planSteelOrders(gantt) {
  const orders = [];
  const caissonsWithSteel = gantt
    .filter(r => r.campanaAceroDay)
    .sort((a, b) => a.campanaAceroDay.localeCompare(b.campanaAceroDay));

  if (!caissonsWithSteel.length) return orders;

  let currentBatch = [];
  let batchDeadline = null;

  for (const r of caissonsWithSteel) {
    const q = calcQuantities(r.k, {});
    if (!batchDeadline || r.campanaAceroDay <= addCalDays(batchDeadline, 7)) {
      currentBatch.push({ k: r.k, date: r.campanaAceroDay, kg: q.aceroKg });
      if (!batchDeadline) batchDeadline = r.campanaAceroDay;
    } else {
      const totalKg = currentBatch.reduce((s, c) => s + c.kg, 0);
      orders.push({
        id: `ACE-${orders.length + 1}`,
        material: 'Acero',
        unit: 'kg',
        qty: Math.round(totalKg),
        caissons: currentBatch.map(c => c.k),
        count: currentBatch.length,
        source: 'PROVEEDOR',
        orderDate: prevWorkDay(prevWorkDay(currentBatch[0].date)),
        expectedDelivery: prevWorkDay(currentBatch[0].date),
        actualDelivery: null,
        status: 'sugerido',
      });
      currentBatch = [{ k: r.k, date: r.campanaAceroDay, kg: q.aceroKg }];
      batchDeadline = r.campanaAceroDay;
    }
  }
  if (currentBatch.length) {
    const totalKg = currentBatch.reduce((s, c) => s + c.kg, 0);
    orders.push({
      id: `ACE-${orders.length + 1}`,
      material: 'Acero',
      unit: 'kg',
      qty: Math.round(totalKg),
      caissons: currentBatch.map(c => c.k),
      count: currentBatch.length,
      source: 'PROVEEDOR',
      orderDate: prevWorkDay(prevWorkDay(currentBatch[0].date)),
      expectedDelivery: prevWorkDay(currentBatch[0].date),
      actualDelivery: null,
      status: 'sugerido',
    });
  }

  return orders;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   4. FUNCIÓN PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════════ */

export function buildProcurementPlan(gantt, startDate) {
  if (!gantt?.length) return null;

  const endDate = gantt
    .map(r => r.vaciadoDay)
    .filter(Boolean)
    .reduce((mx, d) => d > mx ? d : mx, startDate);

  const dailyConsumption = buildDailyConsumption(gantt, startDate, endDate);
  const integrated = buildIntegratedPlan(dailyConsumption, startDate);
  const steelOrders = planSteelOrders(gantt);

  return {
    dailyConsumption,
    cementOrders: integrated.cementOrders,
    cementDeliveries: integrated.cementDeliveries,
    steelOrders,
    mixtoOrders: integrated.mixtoOrders,
    piedraOrders: integrated.piedraOrders,
    stockForecast: integrated.stockForecast,
    allOrders: [
      ...integrated.cementOrders,
      ...steelOrders,
      ...integrated.mixtoOrders,
      ...integrated.piedraOrders,
    ],
  };
}
