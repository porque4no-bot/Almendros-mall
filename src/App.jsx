import { useState, useMemo, useCallback, useRef } from 'react';
import { REND, ITEMS, CAISSONS } from './data/constants';
import { useFirestoreSync, useBaselineData } from './hooks/useFirebaseData';
import { runSimulation } from './utils/engine/simulation';
import { getToday, defEntry, findC, calcC, calcGlobal } from './utils/caissonUtils';
import { useAuth } from './context/AuthContext';
import Login from './components/auth/Login';
import Header from './components/layout/Header';
import InteractiveMap from './components/caissons/InteractiveMap';
import CaissonDetailPanel from './components/caissons/CaissonDetailPanel';
import IncidenciasPanel from './components/caissons/IncidenciasPanel';
import ProgressChart from './components/charts/ProgressChart';
import DashboardKPIs from './components/dashboard/DashboardKPIs';
import CaissonTable from './components/caissons/CaissonTable';
import CuadrillasManager from './components/modules/CuadrillasManager';
import ProgramacionModule from './components/modules/ProgramacionModule';
import InventarioModule from './components/modules/InventarioModule';

export default function App() {
  const { user, role, loadingAuth, logout } = useAuth();
  const isViewer = role === 'viewer';

  const [dailyLog, setDailyLog] = useState({ [getToday()]: Object.fromEntries(CAISSONS.map(c => [c.k, defEntry(c)])) });
  const [actas, setActas] = useState([]);
  const [loadingFirebase, setLoadingFirebase] = useState(true);
  const [selDate, setSelDate]     = useState(getToday());
  const [selK, setSelK]           = useState(null);
  const [viewMode, setViewMode]   = useState("plano");
  const [filter, setFilter]       = useState("all");
  const [selActa, setSelActa]     = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [incidencias, setIncidencias] = useState([]);
  const [cuadrillas, setCuadrillas] = useState([]);
  const [showIncidencias, setShowIncidencias] = useState(false);
  const [showCuadrillas, setShowCuadrillas] = useState(false);
  const [mainTab, setMainTab] = useState('dashboard'); // 'dashboard' | 'programacion' | 'inventario'
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(selDate);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Escucha en tiempo real desde Firestore
  const initialLoadRef = useRef(true);
  const { saveData, deleteRegistro } = useFirestoreSync(
    (data) => {
      if (data.dailyLog) {
        setDailyLog(data.dailyLog);
        if (initialLoadRef.current) {
          const dates = Object.keys(data.dailyLog).sort();
          if (dates.length > 0) {
            const lastDate = dates[dates.length - 1];
            setSelDate(lastDate);
            const d = new Date(lastDate + 'T12:00:00');
            setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
          }
        }
      }
      if (data.actas) setActas(data.actas);
      if (data.incidencias) setIncidencias(data.incidencias);
      if (data.cuadrillas) setCuadrillas(data.cuadrillas);
      initialLoadRef.current = false;
    },
    () => setLoadingFirebase(false)
  );

  // Línea Base — documento fijo en proyecto/lineaBase
  const { baselineData, saveBaseline } = useBaselineData();

  // Guardado explícito — se llama solo tras acciones del usuario
  const handleSaveData = useCallback((newDailyLog, newActas, newIncidencias) => {
    saveData({
      dailyLog: newDailyLog ?? dailyLog,
      actas: newActas ?? actas,
      incidencias: newIncidencias ?? incidencias
    });
  }, [saveData, dailyLog, actas, incidencias]);

  const sortedDates = useMemo(() => Object.keys(dailyLog).sort(), [dailyLog]);

  const processed = useMemo(() =>
    CAISSONS.map(c => calcC(c, (dailyLog[selDate] && dailyLog[selDate][c.k]) ? dailyLog[selDate][c.k] : defEntry(c))),
    [dailyLog, selDate]
  );

  // Datos del dia anterior y ultima acta para deltas por unidad
  const prevDayProcessed = useMemo(() => {
    const idx = sortedDates.indexOf(selDate);
    if (idx <= 0) return null;
    const prevDate = sortedDates[idx - 1];
    return Object.fromEntries(CAISSONS.map(c => [c.k, calcC(c, (dailyLog[prevDate] && dailyLog[prevDate][c.k]) ? dailyLog[prevDate][c.k] : defEntry(c))]));
  }, [sortedDates, selDate, dailyLog]);

  const lastActaProcessed = useMemo(() => {
    const sa = [...actas].sort();
    const lastActa = sa.filter(a => a <= selDate).pop();
    if (!lastActa || lastActa === selDate) return null;
    return Object.fromEntries(CAISSONS.map(c => [c.k, calcC(c, (dailyLog[lastActa] && dailyLog[lastActa][c.k]) ? dailyLog[lastActa][c.k] : defEntry(c))]));
  }, [actas, selDate, dailyLog]);

  const handleUpdate = useCallback((k, field, val) => {
    const v = typeof val === "boolean" ? val
      : typeof val === "string" && field !== "observaciones" && field !== "imagenBase64" && field !== "cuadrillaId" ? (parseFloat(val) || 0)
      : val;
    setDailyLog(prev => {
      const entry = (prev[selDate] || {})[k] || defEntry(findC(k));
      const updated = { ...entry, [field]: v };

      // Calcular si excavacion esta terminada DESPUES del update
      const c = findC(k);
      const updatedDesplante = field === "desplante" ? v : entry.desplante;
      const updatedExc = field === "exc" ? v : entry.exc;
      const updatedManual = field === "excManualComplete" ? v : entry.excManualComplete;
      const newPTR = c.prof + updatedDesplante;
      const excDone = updatedExc >= newPTR || updatedManual;

      // Durante excavacion, restante se calcula automaticamente como pTR
      if (!excDone && field !== "restante") {
        updated.restante = newPTR;
      }
      // Si cambia desplante y ya termino excavacion, solo ajustar si no fue tocado
      if (field === "desplante" && excDone) {
        const oldPTR = c.prof + entry.desplante;
        if (entry.restante === oldPTR || entry.restante === 0) {
          updated.restante = newPTR;
        }
      }

      const next = {
        ...prev,
        [selDate]: {
          ...(prev[selDate] || {}),
          [k]: updated
        }
      };
      setUnsaved(true);
      return next;
    });
  }, [selDate, actas, incidencias]);

  const handleSave = useCallback(() => {
    saveData({ dailyLog, actas, incidencias });
    setUnsaved(false);
  }, [saveData, dailyLog, actas, incidencias]);

  const handleRemateCheck = useCallback((k, checkKey, val) => {
    setDailyLog(prev => {
      const entry = (prev[selDate] && prev[selDate][k]) ? prev[selDate][k] : defEntry(findC(k));
      const checks = { ...(entry.remateChecks || { nivelacion:false, plomada:false, recubrimiento:false, superficie:false, curado:false }), [checkKey]: val };
      const next = {
        ...prev,
        [selDate]: {
          ...(prev[selDate] || {}),
          [k]: { ...entry, remateChecks: checks }
        }
      };
      saveData({ dailyLog: next, actas, incidencias });
      return next;
    });
  }, [selDate, saveData, actas, incidencias]);

  const dash = useMemo(() => {
    let tE=0, cE=0, tC=0, cC=0, cCam=0, cCas=0, cRem=0, totalExc=0, totalPTR=0, cAnillos=0, cFC=0, cAnillosM=0, totalAnillosM=0, totalFC=0, cCamM3=0, cCasKg=0;
    const n = processed.length;
    for (const d of processed) {
      tE += d.mE; cE += d.volExc; tC += d.mC; cC += d.volCon;
      totalExc += d.exc; totalPTR += d.pTR;
      cAnillos += d.bill.vA; cFC += d.bill.vF + d.bill.vC;
      cAnillosM += d.bill.vA / REND.anillo;
      totalAnillosM += d.tr;
      totalFC += d.cd.vol + d.profFuste * REND.fuste;
      cCamM3 += d.bill.vC;
      cCasKg += d.bill.acero;
      if (d.excD)   cCam++;
      if (d.armado) cCas++;
      if (d.remate) cRem++;
    }
    const pE  = tE > 0 ? (cE / tE) * 100 : 0;
    const pV  = totalFC > 0 ? (cFC / totalFC) * 100 : 0;
    const pCa = (cCam / n) * 100;
    const pCs = (cCas / n) * 100;
    const pR  = (cRem / n) * 100;
    const pG  = (pE * 0.45) + (pCa * 0.15) + (pCs * 0.15) + (pV * 0.20) + (pR * 0.05);
    return { pG, pE, pCa, pCs, pV, pR, cE, cC, cCam, cCas, totalExc, totalPTR, totalME: tE, cAnillos, cFC, cAnillosM, totalAnillosM, totalFC, cCamM3, cCasKg };
  }, [processed]);

  const prevDash = useMemo(() => {
    const idx = sortedDates.indexOf(selDate);
    if (idx <= 0) return null;
    const prevDate = sortedDates[idx - 1];
    const prevProcessed = CAISSONS.map(c => calcC(c, (dailyLog[prevDate] && dailyLog[prevDate][c.k]) ? dailyLog[prevDate][c.k] : defEntry(c)));
    let tE=0, cE=0, cCam=0, cCas=0, cRem=0, totalExc=0, cAnillos=0, cFC=0, cAnillosM=0, totalFC=0, cCamM3=0, cCasKg=0;
    const n = prevProcessed.length;
    for (const d of prevProcessed) {
      tE += d.mE; cE += d.volExc;
      totalExc += d.exc; cAnillos += d.bill.vA; cFC += d.bill.vF + d.bill.vC;
      cAnillosM += d.bill.vA / REND.anillo;
      totalFC += d.cd.vol + d.profFuste * REND.fuste;
      cCamM3 += d.bill.vC; cCasKg += d.bill.acero;
      if (d.excD)   cCam++;
      if (d.armado) cCas++;
      if (d.remate) cRem++;
    }
    const pE  = tE > 0 ? (cE / tE) * 100 : 0;
    const pV  = totalFC > 0 ? (cFC / totalFC) * 100 : 0;
    const pCa = (cCam / n) * 100;
    const pCs = (cCas / n) * 100;
    const pR  = (cRem / n) * 100;
    const pG  = (pE * 0.45) + (pCa * 0.15) + (pCs * 0.15) + (pV * 0.20) + (pR * 0.05);
    return { pG, pE, pCa, pCs, pV, pR, totalExc, cE, cAnillos, cFC, cAnillosM, cCam, cCas, cCamM3, cCasKg };
  }, [sortedDates, selDate, dailyLog]);

  const lastActaDash = useMemo(() => {
    const sa = [...actas].sort();
    const lastActa = sa.filter(a => a < selDate).pop();
    if (!lastActa) return null;
    const actaProcessed = CAISSONS.map(c => calcC(c, (dailyLog[lastActa] && dailyLog[lastActa][c.k]) ? dailyLog[lastActa][c.k] : defEntry(c)));
    let tE=0, cE=0, cCam=0, cCas=0, cRem=0, totalExc=0, cAnillos=0, cFC=0, cAnillosM=0, totalFC=0, cCamM3=0, cCasKg=0;
    const n = actaProcessed.length;
    for (const d of actaProcessed) {
      tE += d.mE; cE += d.volExc;
      totalExc += d.exc; cAnillos += d.bill.vA; cFC += d.bill.vF + d.bill.vC;
      cAnillosM += d.bill.vA / REND.anillo;
      totalFC += d.cd.vol + d.profFuste * REND.fuste;
      cCamM3 += d.bill.vC; cCasKg += d.bill.acero;
      if (d.excD)   cCam++;
      if (d.armado) cCas++;
      if (d.remate) cRem++;
    }
    const pE  = tE > 0 ? (cE / tE) * 100 : 0;
    const pV  = totalFC > 0 ? (cFC / totalFC) * 100 : 0;
    const pCa = (cCam / n) * 100;
    const pCs = (cCas / n) * 100;
    const pR  = (cRem / n) * 100;
    const pG  = (pE * 0.45) + (pCa * 0.15) + (pCs * 0.15) + (pV * 0.20) + (pR * 0.05);
    return { pG, pE, pCa, pCs, pV, pR, totalExc, cE, cAnillos, cFC, cAnillosM, cCam, cCas, cCamM3, cCasKg };
  }, [actas, selDate, dailyLog]);

  const chartData = useMemo(() =>
    sortedDates.map(d => {
      const dp = CAISSONS.map(c => calcC(c, (dailyLog[d] && dailyLog[d][c.k]) ? dailyLog[d][c.k] : defEntry(c)));
      let tE=0, cE=0, totalFC=0, cFC=0, cCas=0, cCam=0;
      for (const x of dp) {
        tE += x.mE; cE += x.volExc;
        totalFC += x.cd.vol + x.profFuste * REND.fuste;
        cFC += x.bill.vF + x.bill.vC;
        if (x.armado) cCas++;
        if (x.excD) cCam++;
      }
      return {
        label: d,
        global: calcGlobal(dailyLog, d),
        excavacion: tE > 0 ? (cE / tE) * 100 : 0,
        vaciado: totalFC > 0 ? (cFC / totalFC) * 100 : 0,
        armado: (cCas / CAISSONS.length) * 100,
        campanas: (cCam / CAISSONS.length) * 100,
      };
    }),
    [dailyLog, sortedDates]
  );

  const actaData = useMemo(() => {
    if (!selActa) return null;
    const sa = [...actas].sort();
    const idx = sa.indexOf(selActa);
    const prevDate = idx > 0 ? sa[idx - 1] : null;
    const totals = {};
    for (const ik of Object.keys(ITEMS)) {
      const ck = ITEMS[ik].billKey;
      totals[ik] = CAISSONS.reduce((acc, c) => {
        const cur = calcC(c, (dailyLog[selActa] && dailyLog[selActa][c.k]) ? dailyLog[selActa][c.k] : defEntry(c));
        const pre = calcC(c, (prevDate && dailyLog[prevDate] && dailyLog[prevDate][c.k]) ? dailyLog[prevDate][c.k] : defEntry(c));
        return acc + (cur.bill[ck] - pre.bill[ck]);
      }, 0);
    }
    return totals;
  }, [selActa, actas, dailyLog]);

  /* Caisson status counters */
  const caissonStatus = useMemo(() => {
    let sinIniciar=0, enProgreso=0, completados=0;
    for (const d of processed) {
      if      (d.st === "completed") completados++;
      else if (d.st === "active")    enProgreso++;
      else                           sinIniciar++;
    }
    return { sinIniciar, enProgreso, completados };
  }, [processed]);

  /* ──────────────────────────────────────────────────────────────────────────
     LÍNEA BASE: comparación plan vs real
     ────────────────────────────────────────────────────────────────────────── */

  /** Diferencia en días calendario entre dos strings 'YYYY-MM-DD'. Positivo = d2 más tarde. */
  const calDaysBetween = (d1Str, d2Str) => {
    if (!d1Str || !d2Str) return 0;
    const parse = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d).getTime(); };
    return Math.round((parse(d2Str) - parse(d1Str)) / 86400000);
  };

  /**
   * caissonsComparison: para cada caisson, compara el estado actual
   * con la línea base. Clave: número de caisson.
   * {
   *   planStartExc, planEndShaft, planCampanaAcero, planVaciado,
   *   excDelay,   — días de retraso en excavación (0 si no aplica)
   *   vacDelay,   — días de retraso en vaciado
   *   endVar,     — métrica principal de retraso (vacDelay > excDelay)
   *   isDelayed,  — bool
   *   isCritical, — bool (en ruta crítica del plan)
   * }
   */
  const caissonsComparison = useMemo(() => {
    if (!baselineData?.gantt) return {};
    const ganttMap = Object.fromEntries(baselineData.gantt.map(r => [r.k, r]));
    const result = {};
    for (const d of processed) {
      const plan = ganttMap[d.k];
      if (!plan) continue;
      const excDelay = (!d.excD && selDate > plan.endShaft)
        ? calDaysBetween(plan.endShaft, selDate) : 0;
      const vacDelay = (d.vacP < 100 && selDate > plan.vaciadoDay)
        ? calDaysBetween(plan.vaciadoDay, selDate) : 0;
      const endVar   = vacDelay > 0 ? vacDelay : excDelay;
      result[d.k] = {
        planStartExc:     plan.startExc,
        planEndShaft:     plan.endShaft,
        planCampanaAcero: plan.campanaAceroDay,
        planVaciado:      plan.vaciadoDay,
        excDelay, vacDelay, endVar,
        isDelayed:  endVar > 0,
        isCritical: (baselineData.criticalPath || []).includes(d.k),
      };
    }
    return result;
  }, [baselineData, processed, selDate]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Rendimiento real: promedio de metros excavados por día en los últimos 7 días del log */
  const rendimientoActual = useMemo(() => {
    const n = sortedDates.length;
    if (n < 2) return null;
    const window = sortedDates.slice(Math.max(0, n - 8)); // hasta 8 fechas → 7 deltas
    let totalDelta = 0, count = 0;
    for (let i = 1; i < window.length; i++) {
      const prev = window[i - 1], curr = window[i];
      let delta = 0;
      for (const c of CAISSONS) {
        const excPrev = dailyLog[prev]?.[c.k]?.exc ?? 0;
        const excCurr = dailyLog[curr]?.[c.k]?.exc ?? 0;
        delta += Math.max(0, excCurr - excPrev);
      }
      totalDelta += delta; count++;
    }
    return count > 0 ? totalDelta / count : 0;
  }, [sortedDates, dailyLog]);

  /** Resumen del análisis plan vs real — se pasa directamente a DashboardKPIs */
  const baselineComparison = useMemo(() => {
    const hasBaseline = !!baselineData?.gantt;
    if (!hasBaseline) return { hasBaseline: false };
    const compValues    = Object.values(caissonsComparison);
    const delayedCount  = compValues.filter(c => c.isDelayed).length;
    const projectDelayDays = compValues
      .filter(c => c.endVar > 0)
      .reduce((mx, c) => Math.max(mx, c.endVar), 0);
    // % vaciados planeados para hoy según baseline
    const plannedVacCount = baselineData.gantt.filter(r => r.vaciadoDay <= selDate).length;
    const plannedVacPct   = (plannedVacCount / baselineData.gantt.length) * 100;
    // % vaciados reales completados
    const realVacCount    = processed.filter(d => d.vacP >= 100).length;
    const realVacPct      = (realVacCount / CAISSONS.length) * 100;
    return {
      hasBaseline,
      projectDelayDays,
      plannedVacPct, realVacPct,
      plannedVacCount, realVacCount,
      rendimientoActual: rendimientoActual ?? 0,
      rendimientoMeta:   1.4 * 4,               // RATE × 4 parejas = 5.6 m/día
      plannedEndDate:    baselineData.summary?.projectedEndDate,
      generatedAt:       baselineData.generatedAt,
      delayedCount,
    };
  }, [baselineData, caissonsComparison, processed, selDate, rendimientoActual]);

  /** Admin: ejecuta la simulación y fija el resultado en Firestore (proyecto/lineaBase) */
  const handleFijarLineaBase = useCallback(async () => {
    const msg = baselineData
      ? '⚠ Ya existe una Línea Base. ¿Deseas regenerarla y sobreescribirla?\n\nEsta acción cambiará el plan de referencia de toda la obra.'
      : '¿Fijar la Línea Base del proyecto?\n\nEsto registrará el cronograma planificado como referencia permanente. Asegúrate de que los datos iniciales de excavación sean correctos.';
    if (!confirm(msg)) return;
    setSavingBaseline(true);
    try {
      const simResult = runSimulation(processed, '2026-03-26', cuadrillas);
      await saveBaseline({
        ...simResult,
        generatedAt:      new Date().toISOString(),
        generatedBy:      user?.displayName || user?.email || 'Admin',
        projectStartDate: '2026-03-26',
      });
    } catch (err) {
      alert('Error al fijar línea base: ' + (err?.message || err));
    } finally {
      setSavingBaseline(false);
    }
  }, [processed, saveBaseline, user, baselineData]);

  const handleCrearIncidencia = useCallback((inc) => {
    const next = [...incidencias, inc];
    setIncidencias(next);
    saveData({ dailyLog, actas, incidencias: next });
  }, [incidencias, saveData, dailyLog, actas]);

  const handleResolverIncidencia = useCallback((id, comentario, imagenResolucion, resolutorNombre) => {
    const next = incidencias.map(inc =>
      inc.id === id ? { ...inc, estado: "resuelta", comentarioResolucion: comentario, imagenResolucion: imagenResolucion || "", fechaResolucion: new Date().toISOString(), resueltaPor: resolutorNombre || 'Usuario Desconocido' } : inc
    );
    setIncidencias(next);
    saveData({ dailyLog, actas, incidencias: next });
  }, [incidencias, saveData, dailyLog, actas]);

  const handleSaveCuadrillas = useCallback((newCuadrillas) => {
    setCuadrillas(newCuadrillas);
    // Solo guarda el campo cuadrillas — merge:true no toca el resto del documento
    saveData({ cuadrillas: newCuadrillas });
  }, [saveData]);

  const incidenciasAbiertas = useMemo(() => incidencias.filter(i => i.estado === "abierta").length, [incidencias]);

  const selData = selK ? processed.find(d => d.k === selK) : null;

  const fileInputRef = useRef(null);

  const handleExport = useCallback(() => {
    const data = JSON.stringify({ dailyLog, actas, incidencias }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `BERLIN_EXPORT_${selDate}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [dailyLog, actas, selDate]);

  const handleImport = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.dailyLog) setDailyLog(data.dailyLog);
        if (data.actas)    setActas(data.actas);
        if (data.incidencias) setIncidencias(data.incidencias);
        const dates = Object.keys(data.dailyLog || {}).sort();
        if (dates.length) setSelDate(dates[dates.length - 1]);
        saveData({
          dailyLog: data.dailyLog || dailyLog,
          actas: data.actas || actas,
          incidencias: data.incidencias || incidencias
        });
      } catch(_) { alert('Archivo JSON invalido o corrupto.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [saveData, dailyLog, actas, incidencias]);

  const handleDeleteCaisson = useCallback((k) => {
    if (!confirm(`Eliminar todos los datos del caisson K-${k}?`)) return;
    setDailyLog(prev => {
      const newLog = { ...prev };
      for (const date of Object.keys(newLog)) {
        const newDate = { ...newLog[date] };
        delete newDate[k];
        newLog[date] = newDate;
      }
      saveData({ dailyLog: newLog, actas, incidencias });
      return newLog;
    });
    if (selK === k) setSelK(null);
  }, [selK, saveData, actas, incidencias]);

  const crearDia = useCallback(() => {
    const last = sortedDates[sortedDates.length - 1];
    const next = new Date(last + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    const nStr = next.toISOString().split('T')[0];
    if (dailyLog[nStr]) { setSelDate(nStr); return; }
    setDailyLog(prev => {
      const nextLog = { ...prev, [nStr]: JSON.parse(JSON.stringify(prev[last])) };
      saveData({ dailyLog: nextLog, actas, incidencias });
      return nextLog;
    });
    setSelDate(nStr);
    setViewMode("plano");
    setSelActa(null);
  }, [sortedDates, dailyLog, saveData, actas, incidencias]);

  const getCalendarDays = useMemo(() => {
    const firstDay = new Date(calendarMonth.year, calendarMonth.month, 1);
    const lastDay = new Date(calendarMonth.year, calendarMonth.month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    let current = new Date(startDate);
    while (current <= lastDay || days.length % 7 !== 0) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  }, [calendarMonth]);

  const monthName = useMemo(() => {
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return `${months[calendarMonth.month]} ${calendarMonth.year}`;
  }, [calendarMonth]);

  // Auth + Firebase loading gates
  if (loadingAuth || loadingFirebase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-black">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <div className="w-12 h-12 border-4 border-brand-red/20 border-t-brand-red rounded-full"></div>
          </div>
          <p className="text-white/60 text-sm">{loadingAuth ? 'Verificando sesion...' : 'Conectando a Firestore...'}</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="min-h-screen pb-16">
      {/* HEADER */}
      <Header
        selDate={selDate}
        selActa={selActa}
        actas={actas}
        sortedDates={sortedDates}
        showCalendar={showCalendar}
        isDarkMode={isDarkMode}
        calendarMonth={calendarMonth}
        monthName={monthName}
        getCalendarDays={getCalendarDays}
        onSetShowCalendar={setShowCalendar}
        onSetSelDate={setSelDate}
        onSetSelActa={setSelActa}
        onSetViewMode={setViewMode}
        onSetCalendarMonth={setCalendarMonth}
        onCrearDia={crearDia}
        onCortarActa={() => {
          const newActas = actas.includes(selDate) ? actas : [...actas, selDate].sort();
          setActas(newActas);
          setSelActa(selDate);
          setViewMode("acta");
          setShowCalendar(false);
          saveData({ dailyLog, actas: newActas, incidencias });
        }}
        onEliminarRegistro={() => {
          if (confirm(`Eliminar registro del ${selDate}? Esta accion no se puede deshacer.`)) {
            const dateToDelete = selDate;
            setDailyLog(prev => {
              const newLog = { ...prev };
              delete newLog[dateToDelete];
              const remaining = Object.keys(newLog).sort();
              if (remaining.length > 0) {
                setSelDate(remaining[remaining.length - 1]);
              }
              return newLog;
            });
            deleteRegistro(dateToDelete);
            setUnsaved(false);
            setSelActa(null);
            setViewMode("plano");
          }
        }}
        onToggleDarkMode={() => {
          const next = !isDarkMode;
          setIsDarkMode(next);
          document.documentElement.classList.toggle('dark', next);
          document.documentElement.classList.toggle('light-mode', !next);
        }}
        showIncidencias={showIncidencias}
        onToggleIncidencias={() => setShowIncidencias(!showIncidencias)}
        incidenciasAbiertas={incidenciasAbiertas}
        isViewer={isViewer}
        user={user}
        role={role}
        onLogout={logout}
        hasBaseline={!!baselineData}
        savingBaseline={savingBaseline}
        onFijarLineaBase={handleFijarLineaBase}
      />

      <main className="max-w-7xl mx-auto px-6 mt-8">

        {/* ── Tab toggle: Dashboard / Programación ── */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex gap-1 bg-black/60 rounded-2xl p-1 border border-white/10">
            {[
              { key: 'dashboard',     label: '📊 Dashboard'    },
              { key: 'programacion',  label: '📅 Programación' },
              { key: 'inventario',    label: '📋 Inventario'   },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setMainTab(tab.key)}
                className={`px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition ${
                  mainTab === tab.key
                    ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20'
                    : 'text-muted hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── VISTA: Programación ── */}
        {mainTab === 'programacion' && (
          <ProgramacionModule
            processed={processed}
            baselineData={baselineData}
            selDate={selDate}
            cuadrillas={cuadrillas}
            incidencias={incidencias}
            dailyLog={dailyLog}
          />
        )}

        {/* ── VISTA: Inventario ── */}
        {mainTab === 'inventario' && (
          <InventarioModule
            processed={processed}
            selDate={selDate}
            cuadrillas={cuadrillas}
            incidencias={incidencias}
            dailyLog={dailyLog}
          />
        )}

        {/* ── VISTA: Dashboard ── */}
        {mainTab === 'dashboard' && <>

        {/* KPI CARDS + STATUS COUNTERS */}
        <DashboardKPIs
          dash={dash}
          prevDash={prevDash}
          lastActaDash={lastActaDash}
          caissonStatus={caissonStatus}
          totalCaissons={CAISSONS.length}
          baselineComparison={baselineComparison}
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-6">

            {/* PROGRESS CHART */}
            <ProgressChart dataPoints={chartData} actas={actas} />

            {/* PLANO INTERACTIVO */}
            <InteractiveMap
              processed={processed}
              selK={selK}
              onSelectCaisson={setSelK}
              dailyLog={dailyLog}
              selDate={selDate}
              incidencias={incidencias}
            />

            {/* ACTAS DE COBRO */}
            {actas.length > 0 && (
              <div className="berlin-card rounded-3xl p-6">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Actas de Cobro</h3>
                  <div className="flex gap-2 flex-wrap">
                    {actas.map(a => (
                      <button
                        key={a}
                        onClick={() => { setSelActa(a); setViewMode("acta"); }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition
                          ${selActa === a ? 'bg-brand-yellow text-black' : 'bg-white/5 text-muted hover:text-white'}`}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
                {viewMode === "acta" && selActa && actaData && (
                  <div className="space-y-2">
                    {Object.keys(ITEMS).map(ik => {
                      const val = actaData[ik] || 0;
                      const CAISSON_DIAM = 0.85;
                      const CAISSON_AREA = Math.PI * Math.pow(CAISSON_DIAM / 2, 2);
                      let deltaExtra = null;
                      if (ik.startsWith("EXC_")) {
                        const mLineal = val / REND.exc;
                        deltaExtra = (
                          <div className="flex gap-3 mt-1 flex-wrap">
                            <span className="text-[8px] font-black text-brand-yellow">
                              {val.toFixed(2)} m&sup3; exc.
                            </span>
                            <span className="text-[8px] font-black text-brand-orange">
                              &asymp;{mLineal.toFixed(2)} m lin.
                            </span>
                          </div>
                        );
                      } else if (ik === "ACERO") {
                        const nCastillos = CAISSONS.filter(c => {
                          const cur = calcC(c, (dailyLog[selActa] && dailyLog[selActa][c.k]) ? dailyLog[selActa][c.k] : defEntry(c));
                          return cur.armado;
                        }).length;
                        deltaExtra = (
                          <div className="mt-1">
                            <span className="text-[8px] font-black text-brand-orange">
                              {nCastillos} castillos colocados
                            </span>
                          </div>
                        );
                      } else if (ik === "FUSTE_A" || ik === "FUSTE_B") {
                        const m2 = val * (CAISSON_AREA / REND.fuste);
                        deltaExtra = (
                          <div className="mt-1">
                            <span className="text-[8px] font-black text-brand-sage">
                              &asymp;{m2.toFixed(2)} m&sup2; sup.
                            </span>
                          </div>
                        );
                      }
                      const isEmpty = val <= 0.0001;
                      return (
                        <div key={ik} className={`bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex justify-between items-start gap-4 ${isEmpty ? 'opacity-40' : ''}`}>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-black text-brand-red shrink-0">{ITEMS[ik].code}</span>
                              <span className="text-[9px] font-black text-white/40 shrink-0">Ref.{ITEMS[ik].ref}</span>
                            </div>
                            <span className="text-[9px] text-muted truncate">{ITEMS[ik].name}</span>
                            {!isEmpty && deltaExtra}
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`text-sm font-black ${isEmpty ? 'text-muted' : 'text-white'}`}>{val.toFixed(2)}</span>
                            <span className="text-[9px] font-black text-muted ml-1 uppercase">{ITEMS[ik].unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TABLA POR UNIDAD */}
            <CaissonTable
              processed={processed}
              filter={filter}
              selK={selK}
              selDate={selDate}
              prevDayProcessed={prevDayProcessed}
              lastActaProcessed={lastActaProcessed}
              onSetFilter={setFilter}
              onSelectCaisson={setSelK}
              onDeleteCaisson={handleDeleteCaisson}
              isViewer={isViewer}
              caissonsComparison={caissonsComparison}
            />

          </div>

          {/* PANEL LATERAL */}
          <div className="lg:col-span-1 space-y-6">
            {showIncidencias && (
              <IncidenciasPanel
                incidencias={incidencias}
                onCrear={handleCrearIncidencia}
                onResolver={handleResolverIncidencia}
                onClose={() => setShowIncidencias(false)}
                isViewer={isViewer}
              />
            )}
            <CaissonDetailPanel
              selData={selData}
              selK={selK}
              dailyLog={dailyLog}
              selDate={selDate}
              handleUpdate={handleUpdate}
              handleRemateCheck={handleRemateCheck}
              incidencias={incidencias}
              onCrearIncidencia={handleCrearIncidencia}
              onResolverIncidencia={handleResolverIncidencia}
              isLastDate={selDate === sortedDates[sortedDates.length - 1]}
              isViewer={isViewer}
              cuadrillas={cuadrillas}
              unsaved={unsaved}
              onSave={handleSave}
            />
          </div>
        </div>

        </>}  {/* fin mainTab === 'dashboard' */}

      </main>

      {/* FLOATING TOOLBAR: Equipos + Exportar / Cargar JSON — hidden for viewers */}
      {!isViewer && (
        <>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleImport} className="hidden"/>
          <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
            {/* Cuadrillas button */}
            <button
              onClick={() => setShowCuadrillas(true)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase text-white transition-all shadow-2xl group"
              style={{background:"rgba(13,13,13,0.92)", border:"1px solid rgba(251,194,2,0.25)", backdropFilter:"blur(16px)"}}
            >
              <span className="text-base group-hover:scale-110 transition-transform">{'\uD83D\uDC77'}</span>
              Equipos
              {cuadrillas.length > 0 && (
                <span className="bg-brand-yellow/20 text-brand-yellow text-[7px] font-black px-1.5 py-0.5 rounded-full border border-brand-yellow/30">
                  {cuadrillas.filter(q => q.activa).length}
                </span>
              )}
            </button>

            <p className="text-[8px] font-black uppercase tracking-[0.25em] text-muted mb-0.5 mr-1">Base de datos</p>
            <button
              onClick={handleExport}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase text-white transition-all shadow-2xl group"
              style={{background:"rgba(13,13,13,0.92)", border:"1px solid rgba(255,255,255,0.14)", backdropFilter:"blur(16px)"}}
            >
              <span className="text-base group-hover:scale-110 transition-transform">{'\uD83D\uDCBE'}</span>
              Exportar JSON
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase text-white transition-all shadow-2xl group"
              style={{background:"rgba(13,13,13,0.92)", border:"1px solid rgba(255,255,255,0.14)", backdropFilter:"blur(16px)"}}
            >
              <span className="text-base group-hover:scale-110 transition-transform">{'\uD83D\uDCC2'}</span>
              Cargar JSON
            </button>
          </div>
        </>
      )}

      {/* MODAL: Gestión de cuadrillas */}
      {showCuadrillas && (
        <CuadrillasManager
          cuadrillas={cuadrillas}
          onSave={handleSaveCuadrillas}
          onClose={() => setShowCuadrillas(false)}
          role={role}
        />
      )}

      <footer className="max-w-7xl mx-auto px-6 mt-16 pt-8 border-t border-white/5 text-center opacity-40">
        <p className="text-[8px] font-black uppercase tracking-[0.4em] text-muted">
          &copy; 2026 BERL&Iacute;N<sup className="text-[6px]">&deg;</sup> INFRAESTRUCTURA &middot; ALMENDROS MALL &middot; TRONIO ETAPA 3
        </p>
      </footer>
    </div>
  );
}
