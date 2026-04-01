/**
 * ENGINE / SIMULATION.JS
 *
 * Simulación día a día con optimización de cuello de botella.
 *
 * El castillo (acero) es el recurso limitante: 1 instalación por día.
 * El algoritmo simula día a día para:
 *   - Mantener el castillo ocupado sin huecos (flujo continuo)
 *   - Minimizar la espera entre fin de excavación y castillo
 *   - Asignar parejas de forma inteligente según metros restantes
 *
 * Flujo por caisson:
 *   Excavación (N días) → Campana+Acero (1 día hábil) → Vaciado (día calendario siguiente)
 *
 * Restricciones:
 *   - N parejas excavan en paralelo (1 caisson a la vez cada una)
 *   - 1 sola instalación de castillo por día (cuello de botella global)
 *   - Vaciado DEBE ser el día calendario siguiente a campana (colapso)
 *   - Campana solo se programa si el día siguiente calendario es hábil
 */

import {
  SEQUENCE, SACRIFICE_3, SACRIFICE_15,
  BASELINE_CURRENT_EXC, BASELINE_CURRENT_TOTAL,
  RATE,
} from './config.js';

import {
  nextWorkDay, ensureWorkDay, addWorkDays, addCalDays,
  dateMax, workDaysBetween, parseDate,
  isWorkDay,
} from './calendar.js';

import {
  calcExcDays, totalDepth, shaftDepth, remainingShaft, buildQuantitiesMap,
} from './quantities.js';

/* ─────────────────────────────────────────────────────────────────────────────
   UTILIDADES
   ───────────────────────────────────────────────────────────────────────────── */

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

/**
 * ensurePairSlot: primer día hábil >= dateStr donde el día calendario
 * siguiente también sea hábil (para que vaciado sea al día siguiente).
 */
function ensurePairSlot(dateStr) {
  let d = ensureWorkDay(dateStr);
  while (!isWorkDay(addCalDays(d, 1))) d = nextWorkDay(addCalDays(d, 1));
  return d;
}

/* ─────────────────────────────────────────────────────────────────────────────
   FUNCIÓN PRINCIPAL
   ───────────────────────────────────────────────────────────────────────────── */

export function runSimulation(
  caissonsData,
  startDateStr,
  cuadrillas = [],
  {
    incidencias        = null,
    weatherFactor      = 1.0,
    performanceFactors = {},
    today              = null,
    monteCarlo         = 0,
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
     BLOQUEADOS — solo por incidencias reales
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
     2. PREPARACIÓN
     ══════════════════════════════════════════════════════════════════════════ */

  const START      = ensureWorkDay(startDateStr);
  const quantities = buildQuantitiesMap(currentTotal);

  const excDaysFor = (k) => Math.ceil(
    calcExcDays(k, currentExc, currentTotal) * weatherFactor
  );

  /* ══════════════════════════════════════════════════════════════════════════
     3. CLASIFICAR CAISSONS
     ══════════════════════════════════════════════════════════════════════════

     Prioridad de asignación a excavación:
       1° Caissons ya parcialmente excavados (menos días restantes primero)
          → Alimentan rápido el castillo
       2° Caissons sin excavar, ordenados por SEQUENCE
          → Respeta la secuencia lógica de obra

     Los bloqueados (incidencia) se excluyen hasta que se resuelva.
     ══════════════════════════════════════════════════════════════════════════ */

  const available = SEQUENCE.filter(k => !effectiveBlocked.has(k));

  // Calcular días restantes de excavación para cada caisson
  const excDaysMap = {};
  for (const k of available) {
    excDaysMap[k] = excDaysFor(k);
  }

  // Separar: ya terminados (excDays=0) vs pendientes
  const alreadyDone = available.filter(k => excDaysMap[k] === 0);
  const needExc     = available.filter(k => excDaysMap[k] > 0);

  // Ordenar pendientes: parcialmente excavados primero (menos días), luego por SEQUENCE
  const partiallyExc = needExc.filter(k => (currentExc[k] ?? 0) > 0);
  const notStarted   = needExc.filter(k => (currentExc[k] ?? 0) === 0);

  partiallyExc.sort((a, b) => excDaysMap[a] - excDaysMap[b]);
  // notStarted mantiene orden SEQUENCE (ya viene filtrado de SEQUENCE)

  const excQueue = [...partiallyExc, ...notStarted];

  /* ══════════════════════════════════════════════════════════════════════════
     4. SIMULACIÓN DÍA A DÍA
     ══════════════════════════════════════════════════════════════════════════

     Estado:
       pairState[pid] = { k, startDate, endDate } | null  (null = libre)
       castilloQueue  = [k, ...]  (caissons listos para castillo, FIFO)
       castilloFree   = fecha en que el castillo queda libre

     Cada día hábil:
       1. ¿Alguna pareja termina hoy? → añadir caisson a castilloQueue
       2. ¿El castillo está libre y hay cola? → programar campana+vaciado
       3. ¿Hay parejas libres? → asignar siguiente caisson de excQueue
     ══════════════════════════════════════════════════════════════════════════ */

  // State
  const pairState = Object.fromEntries(pairIds.map(id => [id, null]));
  const castilloQueue = [...alreadyDone]; // los ya terminados entran directo
  let castilloFreeDate = START;
  let excQueueIdx = 0;

  // Results
  const excResult   = {}; // k → { pair, startExc, endShaft, excDays }
  const castResult  = {}; // k → { campanaDay, vaciadoDay }

  // Register already-done caissons (no excavation needed)
  for (const k of alreadyDone) {
    excResult[k] = { pair: null, startExc: START, endShaft: START, excDays: 0 };
  }

  // Day-by-day simulation
  let currentDay = START;
  const MAX_DAYS = 365; // safety limit
  let dayCount = 0;

  while (dayCount < MAX_DAYS) {
    if (!isWorkDay(currentDay)) {
      currentDay = addCalDays(currentDay, 1);
      continue;
    }

    dayCount++;
    let somethingHappened = false;

    // ── STEP 1: Check if any pair finishes today ──
    for (const pid of pairIds) {
      const st = pairState[pid];
      if (st && st.endDate === currentDay) {
        // Pair finishes excavation of caisson st.k today
        castilloQueue.push(st.k);
        pairState[pid] = null; // pair is now free
        somethingHappened = true;
      }
    }

    // ── STEP 2: Assign castillo if free and queue non-empty ──
    if (currentDay >= castilloFreeDate && castilloQueue.length > 0) {
      // Check if today is a valid pair slot (tomorrow must be work day for vaciado)
      const campanaDay = ensurePairSlot(currentDay);

      if (campanaDay === currentDay) {
        const k = castilloQueue.shift();
        const vaciadoDay = addCalDays(campanaDay, 1);
        castResult[k] = { campanaDay, vaciadoDay };
        castilloFreeDate = nextWorkDay(campanaDay);
        somethingHappened = true;
      }
    }

    // ── STEP 3: Assign free pairs to next caissons ──
    for (const pid of pairIds) {
      if (pairState[pid] !== null) continue; // busy
      if (excQueueIdx >= excQueue.length) continue; // no more work

      const k = excQueue[excQueueIdx];
      excQueueIdx++;

      const n = excDaysMap[k];
      const endDate = addWorkDays(currentDay, n);

      pairState[pid] = { k, startDate: currentDay, endDate };
      excResult[k] = { pair: pid, startExc: currentDay, endShaft: endDate, excDays: n };
      somethingHappened = true;
    }

    // ── Check if we're done ──
    const allExcDone = excQueueIdx >= excQueue.length &&
                       Object.values(pairState).every(s => s === null);
    const allCastDone = castilloQueue.length === 0;

    if (allExcDone && allCastDone) {
      // Process any remaining castillo queue items that haven't been assigned yet
      // (This shouldn't happen but safety check)
      break;
    }

    // If nothing happened and all pairs are busy and castillo has no work, just advance
    currentDay = addCalDays(currentDay, 1);
  }

  // ── Process remaining castillo queue (if pairs all finished but castillo has backlog) ──
  while (castilloQueue.length > 0) {
    const campanaDay = ensurePairSlot(ensureWorkDay(dateMax(castilloFreeDate, currentDay)));
    const k = castilloQueue.shift();
    const vaciadoDay = addCalDays(campanaDay, 1);
    castResult[k] = { campanaDay, vaciadoDay };
    castilloFreeDate = nextWorkDay(campanaDay);
    currentDay = castilloFreeDate;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     5. CAISSONS BLOQUEADOS (incidencia) — al final
     ══════════════════════════════════════════════════════════════════════════ */

  const blockedKs = [...effectiveBlocked]
    .filter(k => SEQUENCE.includes(k))
    .sort((a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b));

  // Find latest pair availability
  let latestPairFree = START;
  for (const pid of pairIds) {
    const st = pairState[pid];
    if (st) {
      const free = nextWorkDay(st.endDate);
      if (free > latestPairFree) latestPairFree = free;
    }
  }
  // Use the pair that finishes earliest for blocked caissons
  const pairFreeDate = {};
  for (const pid of pairIds) {
    const st = pairState[pid];
    pairFreeDate[pid] = st ? nextWorkDay(st.endDate) : currentDay;
  }

  for (const k of blockedKs) {
    // Find earliest free pair
    let bestPid = pairIds[0];
    for (const pid of pairIds) {
      if ((pairFreeDate[pid] || '9999') < (pairFreeDate[bestPid] || '9999')) bestPid = pid;
    }

    const n = excDaysFor(k);
    const sd = ensureWorkDay(pairFreeDate[bestPid]);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    pairFreeDate[bestPid] = n > 0 ? nextWorkDay(endSh) : addCalDays(sd, 1);

    excResult[k] = { pair: bestPid, startExc: sd, endShaft: endSh, excDays: n };

    // Castillo
    const caEarliest = n > 0 ? nextWorkDay(endSh) : ensureWorkDay(sd);
    const campanaDay = ensurePairSlot(dateMax(ensureWorkDay(caEarliest), ensureWorkDay(castilloFreeDate)));
    const vaciadoDay = addCalDays(campanaDay, 1);
    castResult[k] = { campanaDay, vaciadoDay };
    castilloFreeDate = nextWorkDay(campanaDay);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     6. ENSAMBLAR RESULTADOS
     ══════════════════════════════════════════════════════════════════════════ */

  const results = {};
  for (const k of SEQUENCE) {
    const exc  = excResult[k];
    const cast = castResult[k];
    if (!exc) continue; // shouldn't happen

    const isSac = SACRIFICE_3.has(k) || SACRIFICE_15.has(k);
    results[k] = {
      pair:            exc.pair,
      pairName:        exc.pair ? (pairNames[exc.pair] ?? exc.pair) : '—',
      startExc:        exc.startExc,
      endShaft:        exc.endShaft,
      campanaAceroDay: cast?.campanaDay || null,
      vaciadoDay:      cast?.vaciadoDay || null,
      excDays:         exc.excDays,
      terraplen:       isSac && (currentExc[k] ?? 0) === 0,
      totalDepth:      totalDepth(k, currentTotal),
      shaft:           shaftDepth(k, currentTotal),
      remaining:       remainingShaft(k, currentExc, currentTotal),
      loteAcero:       null,
      isBlocked:       effectiveBlocked.has(k),
      isSacrifice3:    SACRIFICE_3.has(k),
      isSacrifice15:   SACRIFICE_15.has(k),
      quantities:      quantities[k],
    };
  }

  /* ══════════════════════════════════════════════════════════════════════════
     7. GANTT + CPM
     ══════════════════════════════════════════════════════════════════════════ */

  const ganttRaw = SEQUENCE.map(k => ({ k, ...results[k] })).filter(r => r.pair !== undefined);

  const allVaciadoDates = ganttRaw.map(r => r.vaciadoDay).filter(Boolean);
  const projectedEnd = allVaciadoDates.length > 0
    ? allVaciadoDates.reduce((mx, d) => (d > mx ? d : mx), START)
    : START;

  const startD       = parseDate(START);
  const endD         = parseDate(projectedEnd);
  const totalCalDays = Math.round((endD - startD) / (1000 * 60 * 60 * 24));
  const totalWorkDays = workDaysBetween(START, projectedEnd);

  /* CPM — Holgura Total */
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

  const gantt = ganttRaw.map(r => {
    const tf = tfMap[r.k] ?? 0;
    return {
      ...r,
      totalFloat:   tf,
      floatEndDate: (tf > 0 && r.vaciadoDay) ? addWorkDays(r.vaciadoDay, tf) : null,
    };
  });

  /* ══════════════════════════════════════════════════════════════════════════
     8. RETORNO
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
