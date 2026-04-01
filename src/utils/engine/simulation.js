/**
 * ENGINE / SIMULATION.JS
 *
 * runSimulation(caissonsData, startDateStr, cuadrillas?, options?)
 *
 * Fases:
 *   1 — Excavación de TODOS los fustes (N cuadrillas en paralelo)
 *   2 — Campana + Acero + Vaciado (1 instalación de castillo por día)
 *   CPM — Ruta crítica por Holgura Total
 *
 * Cambios clave vs versión anterior:
 *   - NO hay caissons "bloqueados por roca" hardcodeados — solo incidencias reales
 *   - NO hay restricciones de lotes de acero (STEEL1/STEEL2) — se eliminan
 *   - NO hay asignación inicial hardcodeada — se asigna según estado real + SEQUENCE
 *   - Mantiene: 1 sola instalación de castillo (acero) por día
 *
 * options:
 *   weatherFactor        {number}  Factor climático global (default 1.0)
 *   performanceFactors   {Object}  { [pairId]: factor } externos
 *   today                {string}  Fecha ref. YYYY-MM-DD
 *   incidencias          {Array|Set|null} IDs de caissons bloqueados por incidencias reales
 *   monteCarlo           {number}  Número de corridas MC (0 = desactivado)
 */

import {
  SEQUENCE, SACRIFICE_3, SACRIFICE_15,
  BASELINE_CURRENT_EXC, BASELINE_CURRENT_TOTAL,
  RATE,
} from './config.js';

import {
  nextWorkDay, ensureWorkDay, addWorkDays, addCalDays,
  dateMax, workDaysBetween, parseDate, prevWorkDay,
  isWorkDay,
} from './calendar.js';

import {
  calcExcDays, totalDepth, shaftDepth, remainingShaft, buildQuantitiesMap,
} from './quantities.js';

/* ─────────────────────────────────────────────────────────────────────────────
   UTILIDADES INTERNAS
   ───────────────────────────────────────────────────────────────────────────── */

function earliestPair(pairAvail) {
  return Object.entries(pairAvail).reduce(
    (best, [p, d]) => (d < pairAvail[best] ? p : best),
    Object.keys(pairAvail)[0]
  );
}

/**
 * Encuentra el primer día hábil >= dateStr donde el día calendario
 * siguiente también sea hábil. Necesario para campana→vaciado:
 * campana día N, vaciado día N+1 calendario — si N+1 no es hábil,
 * la campana colapsa. Avanza hasta encontrar un par válido.
 */
function ensurePairSlot(dateStr) {
  let d = ensureWorkDay(dateStr);
  while (!isWorkDay(addCalDays(d, 1))) d = nextWorkDay(addCalDays(d, 1));
  return d;
}

function buildPairSchedules(gantt, pairIds) {
  const schedules = Object.fromEntries(pairIds.map(id => [id, []]));
  for (const r of gantt) {
    if (r.pair && schedules[r.pair] !== undefined) {
      schedules[r.pair].push({ k: r.k, startExc: r.startExc, endShaft: r.endShaft });
    }
  }
  for (const p of pairIds) {
    schedules[p].sort((a, b) => (a.startExc < b.startExc ? -1 : 1));
  }
  return schedules;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FUNCIÓN PRINCIPAL
   ───────────────────────────────────────────────────────────────────────────── */

export function runSimulation(
  caissonsData,
  startDateStr,
  cuadrillas = [],
  {
    incidencias          = null,
    weatherFactor        = 1.0,
    performanceFactors   = {},
    today                = null,
    monteCarlo           = 0,
  } = {}
) {

  /* ══════════════════════════════════════════════════════════════════════════
     0. CUADRILLAS / PAREJAS
     ══════════════════════════════════════════════════════════════════════════ */

  const excCuadrillas = Array.isArray(cuadrillas)
    ? cuadrillas.filter(q => q.especialidad === 'Excavación' && q.activa === true)
    : [];

  const useRealPairs = excCuadrillas.length > 0;

  const pairIds = useRealPairs
    ? excCuadrillas.map(q => q.id)
    : ['A', 'B', 'C', 'D'];

  const pairNames = useRealPairs
    ? Object.fromEntries(excCuadrillas.map(q => [q.id, q.nombre]))
    : { A: 'Pareja A', B: 'Pareja B', C: 'Pareja C', D: 'Pareja D' };

  /* ══════════════════════════════════════════════════════════════════════════
     BLOQUEADOS — SOLO POR INCIDENCIAS REALES (ya no hay hardcodeados)
     ══════════════════════════════════════════════════════════════════════════ */

  let effectiveBlocked = new Set();
  if (incidencias != null) {
    if (incidencias instanceof Set) {
      effectiveBlocked = new Set([...incidencias].map(Number));
    } else if (Array.isArray(incidencias)) {
      effectiveBlocked = new Set(
        incidencias.map(i => Number(typeof i === 'object' ? (i.k ?? i.id ?? i) : i))
      );
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     1. ESTADO ACTUAL — datos reales de la obra
     ══════════════════════════════════════════════════════════════════════════ */

  const currentExc   = { ...BASELINE_CURRENT_EXC };
  const currentTotal = { ...BASELINE_CURRENT_TOTAL };

  if (Array.isArray(caissonsData) && caissonsData.length > 0) {
    for (const c of caissonsData) {
      if (typeof c.exc === 'number' && c.exc > 0) currentExc[c.k] = c.exc;
      if (typeof c.pTR === 'number' && c.pTR > 0 && Math.abs(c.pTR - 7.58) > 0.01)
        currentTotal[c.k] = c.pTR;
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     2. INICIO + CANTIDADES
     ══════════════════════════════════════════════════════════════════════════ */

  const START = ensureWorkDay(startDateStr);
  const quantities = buildQuantitiesMap(currentTotal);

  /* Factor combinado de excDays por pareja */
  const excDaysForPair = (k, pid) => Math.ceil(
    calcExcDays(k, currentExc, currentTotal) * weatherFactor * (performanceFactors[pid] ?? 1.0)
  );

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 1 — Excavación de TODOS los fustes

     Sin asignación inicial hardcodeada.
     Recorre SEQUENCE en orden, salta los bloqueados por incidencia.
     Cada caisson se asigna a la pareja que primero esté libre.
     Si un caisson ya tiene excavación completa (excDays=0), se registra
     pero NO consume tiempo de la pareja.
     ══════════════════════════════════════════════════════════════════════════ */

  const pairAvail = Object.fromEntries(pairIds.map(id => [id, START]));
  const shaftInfo = {};
  const results   = {};

  // Todos los caissons que no estén bloqueados por incidencia, en orden SEQUENCE
  const execOrder = SEQUENCE.filter(k => !effectiveBlocked.has(k));

  for (const k of execOrder) {
    const pid   = earliestPair(pairAvail);
    const n     = excDaysForPair(k, pid);
    const sd    = ensureWorkDay(pairAvail[pid]);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;

    shaftInfo[k] = { pid, start: sd, end: endSh, days: n };

    // Solo consume tiempo de la pareja si hay excavación pendiente
    pairAvail[pid] = n > 0 ? nextWorkDay(endSh) : sd;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 2 — Campana + Acero (castillo) + Vaciado

     Restricción: solo 1 instalación de castillo por día (aceroFree).
     NO hay restricción de lotes de acero — el acero está disponible siempre.

     Orden: por fecha de fin de excavación (quien termina primero, primero
     recibe campana+acero+vaciado).

     Campana+Acero = 1 día hábil.
     Vaciado = día calendario siguiente (por riesgo de colapso de campana).
     ensurePairSlot: campana solo cae donde mañana (calendario) sea hábil.
     ══════════════════════════════════════════════════════════════════════════ */

  let aceroFree = START; // cuello de botella global: 1 castillo/día

  // Separar caissons ya terminados (excDays=0) y pendientes
  const alreadyDone = [];
  const pendingExc  = [];

  for (const [kStr, si] of Object.entries(shaftInfo)) {
    const k = Number(kStr);
    if (si.days === 0) {
      alreadyDone.push([k, si]);
    } else {
      pendingExc.push([k, si]);
    }
  }

  // Caissons ya terminados de excavar: registrar sin campana/vaciado por ahora
  for (const [k, si] of alreadyDone) {
    results[k] = {
      pair: si.pid, pairName: pairNames[si.pid] ?? si.pid,
      startExc: si.start, endShaft: si.end,
      campanaAceroDay: null, vaciadoDay: null,
      excDays: 0,
      terraplen: false,
      totalDepth: totalDepth(k, currentTotal),
      shaft: shaftDepth(k, currentTotal),
      remaining: 0,
      loteAcero: null,
      isBlocked: false,
      isSacrifice3: SACRIFICE_3.has(k),
      isSacrifice15: SACRIFICE_15.has(k),
      quantities: quantities[k],
    };
  }

  // Ordenar pendientes por fecha de fin de excavación, luego por orden en SEQUENCE
  pendingExc.sort((a, b) => {
    if (a[1].end !== b[1].end) return a[1].end < b[1].end ? -1 : 1;
    return SEQUENCE.indexOf(a[0]) - SEQUENCE.indexOf(b[0]);
  });

  // También programar los ya terminados para campana+vaciado (van primero porque ya están listos)
  const allForCampana = [
    ...alreadyDone.sort((a, b) => SEQUENCE.indexOf(a[0]) - SEQUENCE.indexOf(b[0])),
    ...pendingExc,
  ];

  for (const [k, si] of allForCampana) {
    // Fecha más temprana para campana: día hábil después de terminar excavación
    const caEarliest = si.days > 0 ? nextWorkDay(si.end) : ensureWorkDay(si.start);

    // Respetar cuello de botella de acero (1 castillo/día)
    const caRaw = dateMax(ensureWorkDay(caEarliest), ensureWorkDay(aceroFree));

    // ensurePairSlot: campana solo en día donde mañana calendario sea hábil
    const ca = ensurePairSlot(caRaw);
    aceroFree = nextWorkDay(ca);

    // Vaciado = día calendario siguiente (riesgo de colapso de campana)
    const vd = addCalDays(ca, 1);

    const isSac = SACRIFICE_3.has(k) || SACRIFICE_15.has(k);
    results[k] = {
      pair: si.pid, pairName: pairNames[si.pid] ?? si.pid,
      startExc: si.start, endShaft: si.end,
      campanaAceroDay: ca, vaciadoDay: vd,
      excDays: si.days,
      terraplen: isSac && (currentExc[k] ?? 0) === 0,
      totalDepth: totalDepth(k, currentTotal),
      shaft: shaftDepth(k, currentTotal),
      remaining: remainingShaft(k, currentExc, currentTotal),
      loteAcero: null,
      isBlocked: effectiveBlocked.has(k),
      isSacrifice3: SACRIFICE_3.has(k),
      isSacrifice15: SACRIFICE_15.has(k),
      quantities: quantities[k],
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 3 — Caissons bloqueados por incidencia

     Se programan AL FINAL. No tienen restricción especial de compresor —
     simplemente esperan a que la incidencia se resuelva manualmente.
     Se les asigna la pareja más temprana disponible.
     ══════════════════════════════════════════════════════════════════════════ */

  const blockedKs = [...effectiveBlocked]
    .filter(k => SEQUENCE.includes(k))
    .sort((a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b));

  for (const k of blockedKs) {
    const pid   = earliestPair(pairAvail);
    const n     = excDaysForPair(k, pid);
    const sd    = ensureWorkDay(pairAvail[pid]);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    pairAvail[pid] = n > 0 ? nextWorkDay(endSh) : sd;

    // Campana + Vaciado
    const caEarliest = n > 0 ? nextWorkDay(endSh) : ensureWorkDay(sd);
    const caRaw = dateMax(ensureWorkDay(caEarliest), ensureWorkDay(aceroFree));
    const ca = ensurePairSlot(caRaw);
    aceroFree = nextWorkDay(ca);
    const vd = addCalDays(ca, 1);

    const isSac = SACRIFICE_3.has(k) || SACRIFICE_15.has(k);
    results[k] = {
      pair: pid, pairName: pairNames[pid] ?? pid,
      startExc: sd, endShaft: endSh,
      campanaAceroDay: ca, vaciadoDay: vd,
      excDays: n,
      terraplen: isSac && (currentExc[k] ?? 0) === 0,
      totalDepth: totalDepth(k, currentTotal),
      shaft: shaftDepth(k, currentTotal),
      remaining: remainingShaft(k, currentExc, currentTotal),
      loteAcero: null,
      isBlocked: true,
      isSacrifice3: SACRIFICE_3.has(k),
      isSacrifice15: SACRIFICE_15.has(k),
      quantities: quantities[k],
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     GANTT + RESUMEN
     ══════════════════════════════════════════════════════════════════════════ */

  const ganttRaw = SEQUENCE.map(k => ({ k, ...results[k] }));

  const allVaciadoDates = ganttRaw.map(r => r.vaciadoDay).filter(Boolean);
  const projectedEnd    = allVaciadoDates.length > 0
    ? allVaciadoDates.reduce((mx, d) => (d > mx ? d : mx), START)
    : START;

  const startD        = parseDate(START);
  const endD          = parseDate(projectedEnd);
  const totalCalDays  = Math.round((endD - startD) / (1000 * 60 * 60 * 24));
  const totalWorkDays = workDaysBetween(START, projectedEnd);

  /* ══════════════════════════════════════════════════════════════════════════
     CPM — Holgura Total (Total Float)
     TF(k) = (workDaysBetween(vaciadoDay_k, projectedEnd) − 1) − countAfter(k)
     TF ≤ 0 → ruta crítica.
     ══════════════════════════════════════════════════════════════════════════ */

  const sortedByVac = [...ganttRaw]
    .filter(r => r.vaciadoDay)
    .sort((a, b) => a.vaciadoDay.localeCompare(b.vaciadoDay) || a.k - b.k);

  const tfMap = {};
  for (let i = 0; i < sortedByVac.length; i++) {
    const { k, vaciadoDay } = sortedByVac[i];
    const wdToEnd    = workDaysBetween(vaciadoDay, projectedEnd) - 1;
    const countAfter = sortedByVac.length - 1 - i;
    tfMap[k] = wdToEnd - countAfter;
  }

  const criticalPath = Object.entries(tfMap)
    .filter(([, tf]) => tf <= 0)
    .map(([k]) => Number(k));

  /* Añadir totalFloat y floatEndDate a cada fila del Gantt */
  const gantt = ganttRaw.map(r => {
    const tf = tfMap[r.k] ?? 0;
    return {
      ...r,
      totalFloat:   tf,
      floatEndDate: (tf > 0 && r.vaciadoDay) ? addWorkDays(r.vaciadoDay, tf) : null,
    };
  });

  /* ══════════════════════════════════════════════════════════════════════════
     RETORNO
     ══════════════════════════════════════════════════════════════════════════ */

  return {
    gantt,
    summary: {
      startDate:        START,
      projectedEndDate: projectedEnd,
      totalCalDays,
      totalWorkDays,
      caissonCount:     gantt.length,
      pairCount:        pairIds.length,
    },
    criticalPath,
    pairSchedules:    buildPairSchedules(gantt, pairIds),
    pairNames,
    pairPerformance:  performanceFactors,
  };
}
