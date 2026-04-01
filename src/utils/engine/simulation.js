/**
 * ENGINE / SIMULATION.JS
 *
 * Simulación día a día con optimización de cuello de botella.
 *
 * El castillo (acero) es el recurso limitante: 1 instalación por día.
 * El algoritmo simula día hábil a día hábil para:
 *   - Mantener el castillo ocupado sin huecos (flujo continuo)
 *   - Minimizar la espera entre fin de excavación y castillo
 *   - Asignar parejas de forma inteligente según metros restantes
 *
 * Flujo por caisson:
 *   Excavación (N días háb.) → [día siguiente háb.] → Campana+Acero (1 día háb.)
 *   → [día calendario siguiente] → Vaciado
 *
 * Restricciones:
 *   - N parejas excavan en paralelo (1 caisson a la vez cada una)
 *   - 1 sola instalación de castillo por día (cuello de botella global)
 *   - Vaciado DEBE ser el día CALENDARIO siguiente a campana (riesgo colapso)
 *   - Campana solo se programa si el día calendario siguiente es hábil
 *
 * Manejo de días hábiles:
 *   - addWorkDays(start, N): start es el 1er día de trabajo, retorna el ÚLTIMO día.
 *     Ej: addWorkDays("lunes", 3) = "miércoles" (lun, mar, mié = 3 días)
 *   - Una pareja que termina el día D queda LIBRE el día nextWorkDay(D)
 *   - Un caisson listo para castillo: campana es como mínimo nextWorkDay(endShaft)
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
 * Primer día hábil >= dateStr donde addCalDays(d, 1) también sea hábil.
 * Necesario para campana: vaciado DEBE ser el día calendario siguiente.
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
     3. CLASIFICAR CAISSONS — cola de asignación a excavación

     Prioridad:
       1° Parcialmente excavados (menos días restantes primero)
          → Terminan rápido, alimentan castillo sin gaps
       2° Sin iniciar, en orden SEQUENCE
     ══════════════════════════════════════════════════════════════════════════ */

  const available = SEQUENCE.filter(k => !effectiveBlocked.has(k));

  const excDaysMap = {};
  for (const k of available) excDaysMap[k] = excDaysFor(k);

  const alreadyDone = available.filter(k => excDaysMap[k] === 0);
  const needExc     = available.filter(k => excDaysMap[k] > 0);

  const partiallyExc = needExc.filter(k => (currentExc[k] ?? 0) > 0);
  const notStarted   = needExc.filter(k => (currentExc[k] ?? 0) === 0);
  partiallyExc.sort((a, b) => excDaysMap[a] - excDaysMap[b]);

  const excQueue = [...partiallyExc, ...notStarted];

  /* ══════════════════════════════════════════════════════════════════════════
     4. SIMULACIÓN DÍA A DÍA (solo días hábiles)

     pairFreeOn[pid]  = primer día hábil que la pareja está DISPONIBLE
                        (día DESPUÉS de terminar su caisson actual)
     castilloFreeOn   = primer día hábil que el castillo está disponible
     readyForCastillo = [{ k, readyDate }]  cola FIFO de caissons esperando

     Cada día hábil:
       1. ¿Alguna pareja se libera hoy? → su caisson pasa a readyForCastillo
       2. ¿El castillo está libre y hay cola? → programar campana + vaciado
       3. ¿Hay parejas libres? → asignar siguiente caisson
     ══════════════════════════════════════════════════════════════════════════ */

  // pairFreeOn: día en que la pareja queda libre (puede tomar nuevo trabajo)
  const pairFreeOn  = Object.fromEntries(pairIds.map(id => [id, START]));
  // pairCurrent: qué caisson tiene asignado cada pareja (null = libre)
  const pairCurrent = Object.fromEntries(pairIds.map(id => [id, null]));

  let castilloFreeOn = START;
  const readyForCastillo = []; // [{ k, readyDate }]
  let excQueueIdx = 0;

  // Results
  const excResult  = {}; // k → { pair, startExc, endShaft, excDays }
  const castResult = {}; // k → { campanaDay, vaciadoDay }

  // Caissons ya excavados: listos para castillo desde el día 1
  for (const k of alreadyDone) {
    excResult[k] = { pair: null, startExc: START, endShaft: START, excDays: 0 };
    readyForCastillo.push({ k, readyDate: START });
  }

  // Iterar solo por días hábiles
  let day = START;
  const MAX_ITER = 500;
  let iter = 0;

  while (iter < MAX_ITER) {
    // Saltar a día hábil
    day = ensureWorkDay(day);
    iter++;

    // ── STEP 1: Liberar parejas que terminaron (su endShaft fue ayer o antes) ──
    // Una pareja con endShaft = D queda libre en nextWorkDay(D).
    // Si pairFreeOn[pid] <= day, la pareja está libre.
    for (const pid of pairIds) {
      const cur = pairCurrent[pid];
      if (cur !== null && pairFreeOn[pid] <= day) {
        // La pareja ya se liberó, su caisson está listo para castillo
        // readyDate = nextWorkDay(endShaft) = pairFreeOn[pid]
        readyForCastillo.push({ k: cur.k, readyDate: pairFreeOn[pid] });
        pairCurrent[pid] = null;
      }
    }

    // ── STEP 2: Programar castillo si hay cola y está libre ──
    if (castilloFreeOn <= day && readyForCastillo.length > 0) {
      // Buscar el primer caisson cuyo readyDate <= day
      const idx = readyForCastillo.findIndex(item => item.readyDate <= day);
      if (idx >= 0) {
        const { k } = readyForCastillo.splice(idx, 1)[0];

        // Campana hoy solo si mañana calendario es hábil (para vaciado)
        const campanaDay = ensurePairSlot(day);

        if (campanaDay === day) {
          // Programar campana hoy, vaciado mañana calendario
          const vaciadoDay = addCalDays(campanaDay, 1);
          castResult[k] = { campanaDay, vaciadoDay };
          castilloFreeOn = nextWorkDay(campanaDay);
        } else {
          // Hoy no se puede (mañana no es hábil), devolver a la cola
          readyForCastillo.unshift({ k, readyDate: day });
        }
      }
    }

    // ── STEP 3: Asignar caissons a parejas libres ──
    for (const pid of pairIds) {
      if (pairCurrent[pid] !== null) continue; // ocupada
      if (excQueueIdx >= excQueue.length) continue; // no hay más trabajo

      const k = excQueue[excQueueIdx];
      excQueueIdx++;

      const n = excDaysMap[k];
      // La pareja empieza HOY, trabaja N días hábiles.
      // addWorkDays(day, N) = último día de trabajo.
      // Ej: addWorkDays("lunes", 3) = "miércoles" (lun+mar+mié)
      const startExc = day;
      const endShaft = addWorkDays(day, n); // último día trabajando

      excResult[k] = { pair: pid, startExc, endShaft, excDays: n };

      // La pareja queda libre el día hábil DESPUÉS de terminar
      pairFreeOn[pid] = nextWorkDay(endShaft);
      pairCurrent[pid] = { k };
    }

    // ── ¿Terminamos? ──
    const allExcAssigned = excQueueIdx >= excQueue.length;
    const allPairsFree   = Object.values(pairCurrent).every(c => c === null);
    const queueEmpty     = readyForCastillo.length === 0;
    const allCastDone    = Object.keys(castResult).length >=
                           (alreadyDone.length + excQueue.length);

    if (allExcAssigned && allPairsFree && queueEmpty && allCastDone) break;

    // Avanzar al siguiente día hábil
    day = nextWorkDay(day);
  }

  // ── Procesar backlog de castillo (si quedaron caissons en cola) ──
  while (readyForCastillo.length > 0) {
    const campanaDay = ensurePairSlot(ensureWorkDay(castilloFreeOn));
    const { k } = readyForCastillo.shift();
    const vaciadoDay = addCalDays(campanaDay, 1);
    castResult[k] = { campanaDay, vaciadoDay };
    castilloFreeOn = nextWorkDay(campanaDay);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     5. CAISSONS BLOQUEADOS (incidencia) — al final
     ══════════════════════════════════════════════════════════════════════════ */

  const blockedKs = [...effectiveBlocked]
    .filter(k => SEQUENCE.includes(k))
    .sort((a, b) => SEQUENCE.indexOf(a) - SEQUENCE.indexOf(b));

  for (const k of blockedKs) {
    // Buscar pareja más temprana
    let bestPid = pairIds[0];
    for (const pid of pairIds) {
      if (pairFreeOn[pid] < pairFreeOn[bestPid]) bestPid = pid;
    }

    const n  = excDaysFor(k);
    const sd = ensureWorkDay(pairFreeOn[bestPid]);
    const endSh = n > 0 ? addWorkDays(sd, n) : sd;
    pairFreeOn[bestPid] = n > 0 ? nextWorkDay(endSh) : nextWorkDay(sd);

    excResult[k] = { pair: bestPid, startExc: sd, endShaft: endSh, excDays: n };

    // Castillo: al menos nextWorkDay después de terminar exc., y cuando castillo esté libre
    const readyDate = n > 0 ? nextWorkDay(endSh) : ensureWorkDay(sd);
    const campanaDay = ensurePairSlot(dateMax(readyDate, ensureWorkDay(castilloFreeOn)));
    const vaciadoDay = addCalDays(campanaDay, 1);
    castResult[k] = { campanaDay, vaciadoDay };
    castilloFreeOn = nextWorkDay(campanaDay);
  }

  /* ══════════════════════════════════════════════════════════════════════════
     6. ENSAMBLAR RESULTADOS
     ══════════════════════════════════════════════════════════════════════════ */

  const results = {};
  for (const k of SEQUENCE) {
    const exc  = excResult[k];
    const cast = castResult[k];
    if (!exc) continue;

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

  const startD        = parseDate(START);
  const endD          = parseDate(projectedEnd);
  const totalCalDays  = Math.round((endD - startD) / (1000 * 60 * 60 * 24));
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
