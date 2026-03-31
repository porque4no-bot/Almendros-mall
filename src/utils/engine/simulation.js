/**
 * ENGINE / SIMULATION.JS
 *
 * runSimulation(caissonsData, startDateStr, cuadrillas?, options?)
 *
 * Fases:
 *   1 — Excavación fustes normales (N cuadrillas)
 *   2 — Campana + Acero + Vaciado (normales)
 *   3 — Bloqueados por roca: compresor Regla A (14 d) + Regla B (backward pass JIT)
 *   CPM — Ruta crítica por Holgura Total
 *
 * options:
 *   weatherFactor        {number}  Factor climático global (default 1.0)
 *   performanceFactors   {Object}  { [pairId]: factor } externos (sobreescribe calculados)
 *   compressorBufferDays {number}  Días de colchón de seguridad para el compresor (default 3)
 *   today                {string}  Fecha ref. YYYY-MM-DD para curvas de aprendizaje
 *   incidencias          {Array|Set|null} IDs de caissons bloqueados en vida real
 */

import {
  SEQUENCE, BLOCKED, SACRIFICE_3, SACRIFICE_15,
  BASELINE_CURRENT_EXC, BASELINE_CURRENT_TOTAL,
  STEEL1_FALLBACK_DATE, RATE,
} from './config.js';

import {
  nextWorkDay, ensureWorkDay, addWorkDays, addCalDays,
  dateMax, dateMin, workDaysBetween, parseDate, prevWorkDay,
  nextOrSameMonday, isWorkDay,
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

function prevWorkDays(dateStr, n) {
  let d = dateStr;
  for (let i = 0; i < n; i++) d = prevWorkDay(d);
  return d;
}

/**
 * Encuentra el primer día hábil >= dateStr donde el día calendario
 * siguiente también sea hábil. Necesario para el par campana→vaciado:
 * campana día N, vaciado día N+1 (calendario, no hábil) — si N+1 no es
 * laborable, la campana colapsa. Avanza hasta encontrar un par válido.
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
    performanceFactors   = {},   // { [pairId]: factor } externos; sobreescribe calculados
    compressorBufferDays = 3,    // días hábiles de colchón de seguridad (Regla B)
    today                = null, // fecha ref. para curvas de aprendizaje
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
     BLOQUEADOS DINÁMICOS (incidencias sobreescribe config.js)
     ══════════════════════════════════════════════════════════════════════════ */

  let effectiveBlocked;
  if (incidencias != null) {
    if (incidencias instanceof Set) {
      effectiveBlocked = new Set([...incidencias].map(Number));
    } else if (Array.isArray(incidencias)) {
      effectiveBlocked = new Set(
        incidencias.map(i => Number(typeof i === 'object' ? (i.k ?? i.id ?? i) : i))
      );
    } else {
      effectiveBlocked = new Set(BLOCKED);
    }
  } else {
    effectiveBlocked = new Set(BLOCKED);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     1. ESTADO ACTUAL
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
     2. FECHAS CLAVE
     ══════════════════════════════════════════════════════════════════════════ */

  const START  = ensureWorkDay(startDateStr);
  const steel1Raw = startDateStr <= STEEL1_FALLBACK_DATE
    ? STEEL1_FALLBACK_DATE
    : nextOrSameMonday(startDateStr);
  const STEEL1 = ensureWorkDay(steel1Raw);
  const STEEL2 = ensureWorkDay(addCalDays(START, 20));
  const quantities = buildQuantitiesMap(currentTotal);

  /* ══════════════════════════════════════════════════════════════════════════
     3. ASIGNACIONES INICIALES
     ══════════════════════════════════════════════════════════════════════════ */

  const pairAvail = Object.fromEntries(pairIds.map(id => [id, START]));
  let initialAssign = [];

  if (useRealPairs) {
    const byPair = new Map();
    if (Array.isArray(caissonsData)) {
      for (const c of caissonsData) {
        if (c.cuadrillaId && !c.excD && !effectiveBlocked.has(c.k) &&
            Object.prototype.hasOwnProperty.call(pairAvail, c.cuadrillaId)) {
          if (!byPair.has(c.cuadrillaId)) byPair.set(c.cuadrillaId, []);
          byPair.get(c.cuadrillaId).push(c.k);
        }
      }
    }
    for (const [pid, ks] of byPair.entries()) {
      ks.sort((a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b));
      initialAssign.push([pid, ks[0]]);
    }
  } else {
    if (pairIds.length >= 4) {
      initialAssign = [['A', 8], ['B', 11], ['C', 12], ['D', 23]];
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     MEJORA — CURVAS DE APRENDIZAJE POR CUADRILLA
     ══════════════════════════════════════════════════════════════════════════
     Compara metros realmente excavados desde START hasta `today` contra lo
     que RATE habría producido en el mismo período.

       Δexc_real = currentExc[k] − BASELINE_CURRENT_EXC[k]   (para cada caisson)
       Días_transcurridos = workDaysBetween(START, today)
       factor_k = (RATE × días) / Δexc_real

     Si Δexc > RATE×días → cuadrilla es más rápida → factor < 1 (reduce días)
     Si Δexc < RATE×días → cuadrilla es más lenta  → factor > 1 (añade días)

     Clamp: [0.60, 1.50] para evitar extremos con datos ruidosos.
     Solo aplica cuando useRealPairs=true y hay datos (today != null).
  */
  const MIN_PERF = 0.60;
  const MAX_PERF = 1.50;
  const computedPerfFactors = {};

  if (false && today && useRealPairs && Array.isArray(caissonsData)) { // DESACTIVADO — curvas de aprendizaje pendientes de calibración
    const todayWD     = ensureWorkDay(today);
    const daysElapsed = workDaysBetween(START, todayWD);

    if (daysElapsed > 0) {
      const pairDelta = {};   // { [pairId]: metros_excavados_desde_START }

      for (const c of caissonsData) {
        if (!c.cuadrillaId) continue;
        if (!Object.prototype.hasOwnProperty.call(pairAvail, c.cuadrillaId)) continue;

        const delta = Math.max(0, (c.exc ?? 0) - (BASELINE_CURRENT_EXC[c.k] ?? 0));
        if (delta > 0) {
          pairDelta[c.cuadrillaId] = (pairDelta[c.cuadrillaId] ?? 0) + delta;
        }
      }

      // Una cuadrilla trabaja secuencialmente → budget total = RATE × daysElapsed
      for (const [pid, delta] of Object.entries(pairDelta)) {
        const factor = (RATE * daysElapsed) / delta;
        computedPerfFactors[pid] = Math.max(MIN_PERF, Math.min(MAX_PERF, factor));
      }
    }
  }

  // Factores externos tienen prioridad sobre los calculados
  const finalPerfFactors = { ...computedPerfFactors, ...performanceFactors };

  // Factor promedio para casos donde el par no se conoce aún (backward pass)
  const perfValues = Object.values(finalPerfFactors);
  const avgPerfFactor = perfValues.length > 0
    ? perfValues.reduce((s, f) => s + f, 0) / perfValues.length
    : 1.0;

  /* Función que combina weatherFactor + factor de cuadrilla */
  const excDaysForPair = (k, pid) => Math.ceil(
    calcExcDays(k, currentExc, currentTotal) * weatherFactor * (finalPerfFactors[pid] ?? 1.0)
  );

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 1 — Excavación fustes normales
     ══════════════════════════════════════════════════════════════════════════ */

  const execOrder  = SEQUENCE.filter(k => !effectiveBlocked.has(k));
  const assignedKs = new Set([
    ...initialAssign.map(([, k]) => k),
    ...effectiveBlocked,
  ]);

  const shaftInfo = {};
  const results   = {};

  for (const [pid, k] of initialAssign) {
    const sd    = ensureWorkDay(pairAvail[pid]);
    const n     = excDaysForPair(k, pid);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    shaftInfo[k]   = { pid, start: sd, end: endSh, days: n };
    // n=0 significa caisson ya terminado — no consume tiempo de la pareja
    pairAvail[pid] = n > 0 ? nextWorkDay(endSh) : sd;
  }

  for (const k of execOrder) {
    if (assignedKs.has(k)) continue;
    const pid   = earliestPair(pairAvail);
    const sd    = ensureWorkDay(pairAvail[pid]);
    const n     = excDaysForPair(k, pid);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    shaftInfo[k]   = { pid, start: sd, end: endSh, days: n };
    // n=0 significa caisson ya terminado — no consume tiempo de la pareja
    pairAvail[pid] = n > 0 ? nextWorkDay(endSh) : sd;
    assignedKs.add(k);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 2 — Campana + Acero + Vaciado (normales)
     ══════════════════════════════════════════════════════════════════════════ */

  let aceroFree   = START;
  let vaciadoFree = START;

  // Contar caissons ya terminados — ya consumieron acero del lote 1 en el pasado
  let doneCaissons = 0;
  for (const [kStr, si] of Object.entries(shaftInfo)) {
    const k = Number(kStr);
    if (si.days > 0) continue;
    doneCaissons++;
    const isSac = SACRIFICE_3.has(k) || SACRIFICE_15.has(k);
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
      isSacrifice15: isSac && !SACRIFICE_3.has(k),
      quantities: quantities[k],
    };
  }
  // Lote 1 de acero: 7 canastas totales, menos las ya usadas por caissons terminados
  let steel1Rem = Math.max(0, 7 - doneCaissons);

  const byCompletion = Object.entries(shaftInfo)
    .map(([kStr, si]) => [Number(kStr), si])
    .filter(([, si]) => si.days > 0)   // solo caissons con excavación pendiente
    .sort((a, b) => {
      if (a[1].end !== b[1].end) return a[1].end < b[1].end ? -1 : 1;
      return SEQUENCE.indexOf(a[0]) - SEQUENCE.indexOf(b[0]);
    });

  for (const [k, si] of byCompletion) {
    const steel      = steel1Rem > 0 ? STEEL1 : STEEL2;
    const caEarliest = si.days > 0 ? nextWorkDay(si.end) : si.end;
    // Fecha más temprana considerando todas las restricciones
    const caRaw = dateMax(
      dateMax(ensureWorkDay(caEarliest), ensureWorkDay(steel)),
      ensureWorkDay(aceroFree)
    );
    // ensurePairSlot: campana solo en un día donde mañana (calendario) sea laboral
    const ca = ensurePairSlot(caRaw);
    const lote = steel1Rem > 0 ? 1 : 2;
    if (steel1Rem > 0) steel1Rem--;
    aceroFree = nextWorkDay(ca);

    // Vaciado = día calendario siguiente (no hábil siguiente) — riesgo de colapso
    const vd = addCalDays(ca, 1);
    vaciadoFree = nextWorkDay(vd);

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
      loteAcero: lote,
      isBlocked: false,
      isSacrifice3: SACRIFICE_3.has(k),
      isSacrifice15: SACRIFICE_15.has(k),
      quantities: quantities[k],
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     FASE 3 — Caissons bloqueados por roca
     ══════════════════════════════════════════════════════════════════════════ */

  const blockedKs       = [...effectiveBlocked].filter(k => SEQUENCE.includes(k));
  const blockedNeedComp = blockedKs.filter(k => calcExcDays(k, currentExc, currentTotal) > 0);

  let comprRequest = null;
  let comprArrive  = null;
  let comprClear   = null;

  if (blockedNeedComp.length > 0) {

    // Fin proyectado solo con caissons normales (horizonte para backward pass)
    const normalEnd = Object.keys(results).length > 0
      ? Object.values(results).reduce((mx, r) => r.vaciadoDay > mx ? r.vaciadoDay : mx, START)
      : START;

    // Primera pareja libre tras FASE 1 (punto de referencia para Regla A)
    const firstPairFreeDate = Object.values(pairAvail).reduce(
      (mn, d) => (d < mn ? d : mn), '9999-12-31'
    );

    /* ──────────────────────────────────────────────────────────────────────
     * REGLA A — Ventana máxima de 14 días calendario
     *
     *   ruleA = firstPairFreeDate + 14 días cal.
     *   Evita que la obra quede parada > 2 semanas esperando el compresor.
     * ────────────────────────────────────────────────────────────────────── */
    const ruleA_requestDate = ensureWorkDay(addCalDays(firstPairFreeDate, 14));

    /* ──────────────────────────────────────────────────────────────────────
     * REGLA B — Backward Scheduling (JIT / CPM tardío)
     *
     * Cadena forward:
     *   req →[+3wd]→ arrive →[nextWD]→ clear →[nextWD]→ excStart
     *   →[+excDays wd]→ excEnd →[nextWD]→ campana →[nextWD]→ vaciado
     *
     * Backward desde normalEnd:
     *   LF_vaciado   = normalEnd
     *   LF_campana   = LF_vaciado − 1 día calendario (riesgo colapso)
     *   LF_excEnd    = prevWD(LF_campana)
     *   LS_excStart  = prevWorkDays(LF_excEnd, excDays − 1)
     *   LF_comprClear  = prevWD(LS_excStart)
     *   LF_comprArrive = prevWD(LF_comprClear)
     *   LS_comprReq    = prevWorkDays(LF_comprArrive, 2)   ← inv. de +3wd
     *
     * MEJORA — Buffer de seguridad: se retroceden adicionalmente
     * `compressorBufferDays` días hábiles para proteger la ruta crítica
     * ante imprevistos en el transporte del compresor.
     *
     * ruleB = min(LS_comprReq − buffer  para todos los bloqueados activos)
     * ────────────────────────────────────────────────────────────────────── */
    let ruleB_requestDate = '9999-12-31';

    for (const k of blockedNeedComp) {
      // Usa factor promedio porque aún no conocemos qué par excavará k
      const excDays_k = Math.ceil(
        calcExcDays(k, currentExc, currentTotal) * weatherFactor * avgPerfFactor
      );

      const lf_vaciado   = normalEnd;
      const lf_campana   = addCalDays(lf_vaciado, -1); // campana = día calendario previo al vaciado
      const lf_excEnd    = prevWorkDay(lf_campana);
      const ls_excStart  = prevWorkDays(lf_excEnd, excDays_k - 1);
      const lf_comprClear  = prevWorkDay(ls_excStart);
      const lf_comprArrv   = prevWorkDay(lf_comprClear);
      const ls_comprReq    = prevWorkDays(lf_comprArrv, 2);

      // Aplicar buffer de seguridad
      const ls_comprReq_buffered = prevWorkDays(ls_comprReq, compressorBufferDays);

      if (ls_comprReq_buffered < ruleB_requestDate) {
        ruleB_requestDate = ls_comprReq_buffered;
      }
    }

    /* Fecha de solicitud: la más temprana de A y B; no antes de START */
    const rawRequest = dateMin(ruleA_requestDate, ruleB_requestDate);
    comprRequest = ensureWorkDay(dateMax(rawRequest, START));
    comprArrive  = addWorkDays(comprRequest, 3);
    comprClear   = nextWorkDay(comprArrive);
  }

  /* Procesamiento de caissons bloqueados */
  const blockedSorted = [...blockedKs].sort(
    (a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b)
  );

  for (const k of blockedSorted) {
    const pid       = earliestPair(pairAvail);
    const n         = excDaysForPair(k, pid);
    const needsComp = n > 0 && comprClear !== null;

    const sd    = needsComp
      ? ensureWorkDay(dateMax(pairAvail[pid], nextWorkDay(comprClear)))
      : ensureWorkDay(pairAvail[pid]);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    pairAvail[pid] = n > 0 ? nextWorkDay(endSh) : sd;

    const steel      = steel1Rem > 0 ? STEEL1 : STEEL2;
    const caEarliest = n > 0 ? nextWorkDay(endSh) : endSh;
    const caRaw = dateMax(
      dateMax(ensureWorkDay(caEarliest), ensureWorkDay(steel)),
      ensureWorkDay(aceroFree)
    );
    const ca = ensurePairSlot(caRaw);
    const lote = steel1Rem > 0 ? 1 : 2;
    if (steel1Rem > 0) steel1Rem--;
    aceroFree = nextWorkDay(ca);

    // Vaciado = día calendario siguiente — riesgo de colapso
    const vd = addCalDays(ca, 1);
    vaciadoFree = nextWorkDay(vd);

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
      loteAcero: lote,
      isBlocked: true,
      isSacrifice3: SACRIFICE_3.has(k),
      isSacrifice15: SACRIFICE_15.has(k),
      compressor: needsComp
        ? { request: comprRequest, arrive: comprArrive, clear: comprClear }
        : null,
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
     ══════════════════════════════════════════════════════════════════════════
     TF(k) = (workDaysBetween(vaciadoDay_k, projectedEnd) − 1) − countAfter(k)
     TF ≤ 0 → ruta crítica.
  */
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

  const firstCompResult = Object.values(results).find(r => r.isBlocked && r.compressor);

  return {
    gantt,
    summary: {
      startDate:        START,
      projectedEndDate: projectedEnd,
      totalCalDays,
      totalWorkDays,
      steel1Date:       STEEL1,
      steel2Date:       STEEL2,
      caissonCount:     gantt.length,
      pairCount:        pairIds.length,
      compressor:       firstCompResult?.compressor ?? null,
    },
    criticalPath,
    pairSchedules:    buildPairSchedules(gantt, pairIds),
    pairNames,
    pairPerformance:  finalPerfFactors,  // expuesto para reutilizar en Monte Carlo
  };
}
