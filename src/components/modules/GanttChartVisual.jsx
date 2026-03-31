/**
 * GanttChartVisual.jsx
 *
 * Diagrama de Gantt 100% nativo (HTML + Tailwind, sin librerías externas).
 * Renderiza 3 capas visuales por fila de caisson:
 *
 *   Capa 1 — Línea Base (gris, borde punteado): fechas planeadas del baseline
 *   Capa 2 — Forecast (color con rayas si futuro, sólido si pasado)
 *   Capa 3 — Progreso real (sobreposición sólida proporcional a exc/pTR)
 *
 * Columna izquierda "sticky" + cabecera "sticky top" + scroll horizontal.
 * Línea vertical roja "hoy" en cada fila.
 *
 * Props:
 *   gantt        — result.gantt del motor de simulación
 *   pairNames    — { [pairId]: nombre } del motor
 *   criticalPath — [ k, … ] del motor
 *   baselineData — documento Firestore proyecto/lineaBase (o null)
 *   processed    — array procesado (calcC) del App (estado real)
 *   selDate      — fecha "hoy" YYYY-MM-DD
 */

import React, { useMemo } from 'react';
import { isWorkDay } from '../../utils/engine/calendar';

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTES DE LAYOUT
   ───────────────────────────────────────────────────────────────────────────── */
const DAY_W      = 28;   // px por día calendario
const ROW_H      = 52;   // px por fila de caisson
const LABEL_W    = 122;  // px columna izquierda sticky
const HDR_MO_H   = 26;   // px cabecera meses
const HDR_DAY_H  = 28;   // px cabecera días (abreviatura + número)
const HDR_H      = HDR_MO_H + HDR_DAY_H;

/* ─────────────────────────────────────────────────────────────────────────────
   COLORES (en rgb para poder ajustar opacidad)
   ───────────────────────────────────────────────────────────────────────────── */
const C = {
  yellow: [251, 194, 2],
  orange: [246, 128, 0],
  sage:   [128, 175, 150],
  red:    [211, 34,  55],
  white:  [255, 255, 255],
};
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

/** Fondo rayado a 45° para barras futuras / proyectadas */
function stripes(rgb, solidA = 0.55, transA = 0.15) {
  const s = rgba(rgb, solidA);
  const t = rgba(rgb, transA);
  return {
    backgroundImage:
      `repeating-linear-gradient(-45deg, ${s} 0px, ${s} 4px, ${t} 4px, ${t} 8px)`,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS DE FECHAS (local-time, sin desfase UTC)
   ───────────────────────────────────────────────────────────────────────────── */
function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(date) {
  const y  = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const da = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
function addCal(str, n) {
  const d = parseLocal(str);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function diffDays(a, b) {   // b - a in calendar days
  if (!a || !b) return 0;
  return Math.round((parseLocal(b) - parseLocal(a)) / 86400000);
}

/* ── Build month-span metadata ── */
function buildMonths(startStr, endStr) {
  const spans = [];
  let [y, m] = startStr.split('-').map(Number);
  const [ey, em] = endStr.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const mFirst = `${y}-${String(m).padStart(2, '0')}-01`;
    const mLast  = fmtDate(new Date(y, m, 0));   // last day of month
    const cStart = mFirst < startStr ? startStr : mFirst;
    const cEnd   = mLast  > endStr   ? endStr   : mLast;
    const days   = diffDays(cStart, cEnd) + 1;
    const offset = diffDays(startStr, cStart);
    const label  = new Date(y, m - 1, 1)
      .toLocaleDateString('es-CO', { month: 'short', year: '2-digit' })
      .toUpperCase();
    spans.push({ label, days, offset });
    if (++m > 12) { m = 1; y++; }
  }
  return spans;
}

/* ── Build list of day markers for the day-header ── */
const DOW_LABELS = ['dom','lun','mar','mie','jue','vie','sab'];
function buildDayList(startStr, totalDays) {
  return Array.from({ length: totalDays }, (_, i) => {
    const str = addCal(startStr, i);
    const d   = parseLocal(str);
    const dow = d.getDay();
    return { str, num: d.getDate(), dow, label: DOW_LABELS[dow], workDay: isWorkDay(str) };
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL
   ───────────────────────────────────────────────────────────────────────────── */
export default function GanttChartVisual({
  gantt = [],
  pairNames = {},
  criticalPath = [],
  baselineData = null,
  processed = [],
  selDate,
  dailyLog = {},
}) {
  /* ── Construir mapas de acceso rápido ────────────────────────────────────── */
  const processedMap = useMemo(() => {
    const m = {};
    processed.forEach(p => { m[p.k] = p; });
    return m;
  }, [processed]);

  const baselineMap = useMemo(() => {
    const m = {};
    (baselineData?.gantt || []).forEach(r => { m[r.k] = r; });
    return m;
  }, [baselineData]);

  const critSet = useMemo(() => new Set(criticalPath), [criticalPath]);

  /* ── Actividad diaria real por caisson (fuente: dailyLog) ────────────────── */
  // Solo se cuenta como ejecutado lo que tiene registro guardado.
  const { dailyActivity, maxExcDeltaMap } = useMemo(() => {
    const activity  = {};   // { k: [{ date, excDelta, vacDelta }] }
    const prevEntry = {};
    for (const date of Object.keys(dailyLog).sort()) {
      const entries = dailyLog[date] || {};
      for (const [kStr, entry] of Object.entries(entries)) {
        const k    = Number(kStr);
        const prev = prevEntry[k] || { exc: 0, vacP: 0 };
        const excDelta = Math.max(0, (entry.exc  ?? 0) - (prev.exc  ?? 0));
        const vacDelta = Math.max(0, (entry.vacP ?? 0) - (prev.vacP ?? 0));
        if (excDelta > 0 || vacDelta > 0) {
          if (!activity[k]) activity[k] = [];
          activity[k].push({ date, excDelta, vacDelta });
        }
        prevEntry[k] = entry;
      }
    }
    const maxMap = {};
    for (const [k, days] of Object.entries(activity)) {
      maxMap[k] = Math.max(1, ...days.map(d => d.excDelta));
    }
    return { dailyActivity: activity, maxExcDeltaMap: maxMap };
  }, [dailyLog]);

  /* ── Calcular rango de fechas del chart ──────────────────────────────────── */
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    const allStarts = gantt.map(r => r.startExc).filter(Boolean);
    const allEnds   = gantt.flatMap(r => [r.vaciadoDay, r.floatEndDate]).filter(Boolean);
    if (baselineData?.gantt) {
      baselineData.gantt.forEach(r => {
        if (r.startExc)   allStarts.push(r.startExc);
        if (r.vaciadoDay) allEnds.push(r.vaciadoDay);
      });
    }
    if (!allStarts.length || !allEnds.length) {
      return { chartStart: selDate, chartEnd: selDate, totalDays: 1 };
    }
    const start = addCal(allStarts.reduce((mn, d) => d < mn ? d : mn, allStarts[0]), -5);
    const end   = addCal(allEnds.reduce((mx, d) => d > mx ? d : mx, allEnds[0]), 7);
    return { chartStart: start, chartEnd: end, totalDays: diffDays(start, end) + 1 };
  }, [gantt, baselineData, selDate]);

  /* ── Helpers de posicionamiento ─────────────────────────────────────────── */
  const px   = (str) => Math.max(0, diffDays(chartStart, str)) * DAY_W;
  const barW = (s, e) => Math.max(DAY_W, (diffDays(s, e) + 1) * DAY_W);
  const isPast = (str) => !!str && str <= selDate;

  /* ── Cabeceras ───────────────────────────────────────────────────────────── */
  const months  = useMemo(() => buildMonths(chartStart, chartEnd), [chartStart, chartEnd]);
  const dayList = useMemo(() => buildDayList(chartStart, totalDays), [chartStart, totalDays]);

  const todayPx    = px(selDate);
  const totalWidth = totalDays * DAY_W;

  /* ── Sorted rows: cascada cronológica (waterfall) ───────────────────────── */
  // Criterio principal : startExc ascendente (más próximos arriba)
  // Criterio desempate : vaciadoDay ascendente
  // Fallback           : '2099-01-01' para fechas ausentes (van al fondo)
  const sortedGantt = useMemo(() => {
    const FAR = '2099-01-01';
    return [...gantt].sort((a, b) => {
      const aS = a.startExc   || FAR;
      const bS = b.startExc   || FAR;
      if (aS !== bS) return aS < bS ? -1 : 1;          // orden lexicográfico ISO
      const aV = a.vaciadoDay || FAR;
      const bV = b.vaciadoDay || FAR;
      return aV < bV ? -1 : aV > bV ? 1 : 0;
    });
  }, [gantt]);

  if (!gantt.length) return null;

  /* ── Renderizado ─────────────────────────────────────────────────────────── */
  return (
    <div className="overflow-auto sthin rounded-2xl border border-white/5"
      style={{ maxHeight: 'calc(100vh - 300px)', background: '#0a0a0a' }}>

      {/* ─── Contenedor de ancho mínimo ────────────────────────────────────── */}
      <div className="w-max" style={{ minWidth: LABEL_W + totalWidth, position: 'relative' }}>

        {/* ══════ CABECERA MESES (sticky top) ══════ */}
        <div className="sticky top-0 z-40 flex"
          style={{ height: HDR_MO_H, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>

          {/* Esquina sticky (top+left) */}
          <div className="sticky left-0 z-50 flex items-end px-3 pb-1.5"
            style={{ width: LABEL_W, minWidth: LABEL_W, background: '#0a0a0a',
              borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[7px] font-black text-muted/50 uppercase tracking-widest">Unidad</span>
          </div>

          {/* Span de meses */}
          <div className="relative" style={{ width: totalWidth, height: HDR_MO_H }}>
            {months.map((ms, i) => (
              <div key={i} className="absolute flex items-center px-2"
                style={{ left: ms.offset * DAY_W, width: ms.days * DAY_W, height: HDR_MO_H,
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.10)' : 'none' }}>
                <span className="text-[8px] font-black text-muted/70 tracking-wider">{ms.label}</span>
              </div>
            ))}
            {/* Triángulo "hoy" en el header de meses */}
            {todayPx >= 0 && todayPx < totalWidth && (
              <div className="absolute bottom-0 flex items-end justify-center pointer-events-none z-10"
                style={{ left: todayPx + DAY_W / 2 - 5, width: 10 }}>
                <div style={{ width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderTop: '7px solid rgba(211,34,55,0.85)' }} />
              </div>
            )}
          </div>
        </div>

        {/* ══════ CABECERA DÍAS (sticky top debajo de meses) ══════ */}
        <div className="sticky z-40 flex"
          style={{ top: HDR_MO_H, height: HDR_DAY_H, background: '#0a0a0a',
            borderBottom: '1px solid rgba(255,255,255,0.10)' }}>

          <div className="sticky left-0 z-50"
            style={{ width: LABEL_W, minWidth: LABEL_W, background: '#0a0a0a',
              borderRight: '1px solid rgba(255,255,255,0.07)' }} />

          <div className="relative" style={{ width: totalWidth, height: HDR_DAY_H }}>
            {dayList.map((day, i) => {
              const isToday = day.str === selDate;
              const clr     = isToday ? '#D32237' : day.workDay ? 'rgba(128,175,150,0.7)' : 'rgba(211,34,55,0.5)';
              return (
                <div key={i} className="absolute flex flex-col items-center justify-center"
                  style={{ left: i * DAY_W, width: DAY_W, height: HDR_DAY_H,
                    borderLeft: '1px solid rgba(255,255,255,0.03)' }}>
                  <span className="text-[5px] font-black uppercase leading-none"
                    style={{ color: clr }}>{day.label}</span>
                  <span className="text-[7px] font-black leading-none mt-0.5"
                    style={{ color: clr }}>{day.num}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════ FILA RESUMEN — duración total del proyecto ══════ */}
        {(() => {
          const starts = gantt.map(r => r.startExc).filter(Boolean);
          const ends   = gantt.map(r => r.vaciadoDay).filter(Boolean);
          if (!starts.length || !ends.length) return null;
          const projStart = starts.reduce((mn, d) => d < mn ? d : mn, starts[0]);
          const projEnd   = ends.reduce((mx, d) => d > mx ? d : mx, ends[0]);
          const spanPx    = px(projStart);
          const spanW     = barW(projStart, projEnd);
          const elapsedW  = selDate >= projStart
            ? Math.min(spanW, barW(projStart, selDate <= projEnd ? selDate : projEnd))
            : 0;
          const totalCalDays = diffDays(projStart, projEnd) + 1;
          return (
            <div className="flex" style={{ height: 36,
              borderBottom: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.02)' }}>
              {/* Label sticky */}
              <div className="sticky left-0 z-30 flex items-center px-3 shrink-0"
                style={{ width: LABEL_W, minWidth: LABEL_W,
                  background: 'rgba(10,10,10,0.98)',
                  borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-[7px] font-black text-muted/70 uppercase tracking-widest">
                  Proyecto · {totalCalDays}d
                </span>
              </div>
              {/* Barra duración total */}
              <div className="relative shrink-0" style={{ width: totalWidth, height: 36 }}>
                {/* Track fondo */}
                <div className="absolute rounded-full pointer-events-none"
                  style={{ left: spanPx, width: spanW, top: 13, height: 10,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)' }} />
                {/* Progreso real (hasta hoy) */}
                {elapsedW > 0 && (
                  <div className="absolute rounded-full pointer-events-none"
                    style={{ left: spanPx, width: elapsedW, top: 13, height: 10,
                      background: 'rgba(128,175,150,0.55)' }} />
                )}
                {/* Línea hoy */}
                {todayPx >= 0 && todayPx < totalWidth && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10"
                    style={{ left: todayPx + DAY_W / 2,
                      borderLeft: '1px dashed rgba(211,34,55,0.45)', width: 0 }} />
                )}
                {/* Etiquetas inicio / fin */}
                <span className="absolute text-[6px] font-black text-muted/50 pointer-events-none"
                  style={{ left: spanPx + 4, top: 3 }}>
                  {projStart}
                </span>
                <span className="absolute text-[6px] font-black text-brand-red/70 pointer-events-none"
                  style={{ left: spanPx + spanW - 60, top: 3 }}>
                  {projEnd}
                </span>
              </div>
            </div>
          );
        })()}

        {/* ══════ FILAS (cuerpo del Gantt) ══════ */}
        {sortedGantt.map((r, rowIdx) => {
          const bl       = baselineMap[r.k];
          const proc     = processedMap[r.k];
          const isCrit   = critSet.has(r.k);
          const pairLbl  = pairNames[r.pair] || r.pair || '—';

          const excDone    = proc?.excD ?? false;
          const vacDone    = (proc?.vacP ?? 0) >= 100;
          const armadoDone = proc?.armado ?? false;

          /* ── Barras de excavación (superior) ── */
          const excStartPx = r.startExc ? px(r.startExc) : null;
          const excW       = (r.startExc && r.endShaft)
            ? barW(r.startExc, r.endShaft) : 0;
          // Sólido solo si hay dato real que confirma ejecución, no por fecha
          const excFuture  = !excDone;
          const excColor   = excDone ? C.sage : C.yellow;

          /* ── Barra baseline excavación ── */
          const blExcPx = bl?.startExc ? px(bl.startExc) : null;
          const blExcW  = (bl?.startExc && bl?.endShaft)
            ? barW(bl.startExc, bl.endShaft) : 0;

          /* ── Barras campana+acero → vaciado (inferior) ── */
          const caPx    = r.campanaAceroDay ? px(r.campanaAceroDay) : null;
          const vacPx   = r.vaciadoDay      ? px(r.vaciadoDay)      : null;
          const caW     = DAY_W;       // campana+acero = 1 día real
          const vacW    = DAY_W;
          // Sólido solo si vacDone viene confirmado por datos reales
          const vacFut  = !vacDone;
          const vacRgb  = isCrit ? C.red : C.sage;

          /* ── Barra baseline vaciado ── */
          const blVacPx = bl?.vaciadoDay ? px(bl.vaciadoDay) : null;

          return (
            <div key={r.k}
              className="flex hover:bg-white/[0.025] transition-colors"
              style={{ height: ROW_H,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: isCrit ? 'rgba(211,34,55,0.04)' : rowIdx % 2 ? 'rgba(255,255,255,0.008)' : 'transparent' }}>

              {/* ── Columna label sticky ── */}
              <div className="sticky left-0 z-30 flex flex-col justify-center px-3 shrink-0"
                style={{ width: LABEL_W, minWidth: LABEL_W,
                  background: isCrit ? 'rgba(14,5,7,0.98)' : '#0a0a0a',
                  borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {isCrit && (
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-red shrink-0 animate-pulse" />
                  )}
                  <span className="text-[10px] font-black text-white">K-{r.k}</span>
                  {r.isBlocked  && <span className="text-[7px] text-brand-red" title="Bloqueado roca">⛔</span>}
                  {(r.isSacrifice3 || r.isSacrifice15) && (
                    <span className="text-[7px] text-brand-orange">S</span>
                  )}
                </div>
                <span className="text-[6px] text-muted/50 truncate leading-none max-w-[100px]"
                  title={pairLbl}>{pairLbl}</span>
                {vacDone && (
                  <span className="text-[6px] font-black text-brand-sage mt-0.5">✓ Vaciado</span>
                )}
                {!vacDone && r.totalFloat > 0 && (
                  <span className="text-[6px] font-black text-brand-sage/50 mt-0.5"
                    title={`Holgura total: ${r.totalFloat} días hábiles`}>
                    +{r.totalFloat}d
                  </span>
                )}
              </div>

              {/* ── Área de timeline ── */}
              <div className="relative shrink-0" style={{ width: totalWidth, height: ROW_H }}>

                {/* Líneas de mes (guía vertical sutil) */}
                {months.filter(ms => ms.offset > 0).map((ms, i) => (
                  <div key={i} className="absolute top-0 bottom-0 pointer-events-none"
                    style={{ left: ms.offset * DAY_W,
                      borderLeft: '1px solid rgba(255,255,255,0.04)' }} />
                ))}

                {/* Línea "hoy" */}
                {todayPx >= 0 && todayPx < totalWidth && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10"
                    style={{ left: todayPx + DAY_W / 2,
                      borderLeft: '1px dashed rgba(211,34,55,0.45)',
                      width: 0 }} />
                )}

                {/* ═══ CAPA 1: Línea Base — excavación (gris, punteado) ═══ */}
                {blExcPx !== null && blExcW > 0 && (
                  <div className="absolute rounded-sm pointer-events-none"
                    style={{ left: blExcPx, width: blExcW, top: 9, height: 14,
                      background: rgba(C.white, 0.05),
                      border: '1px dashed rgba(255,255,255,0.18)' }}
                    title={`Baseline K-${r.k}: ${bl.startExc} → ${bl.endShaft}`} />
                )}
                {/* Línea Base — vaciado (punto sage punteado) */}
                {blVacPx !== null && (
                  <div className="absolute rounded-sm pointer-events-none"
                    style={{ left: blVacPx, width: DAY_W, top: 29, height: 9,
                      background: rgba(C.sage, 0.12),
                      border: '1px dashed rgba(128,175,150,0.35)' }}
                    title={`Baseline vaciado K-${r.k}: ${bl.vaciadoDay}`} />
                )}

                {/* ═══ CAPA 2: Forecast — Excavación ═══ */}
                {excStartPx !== null && excW > 0 && r.excDays > 0 && (
                  <div className="absolute rounded flex items-center overflow-hidden"
                    style={{ left: excStartPx, width: excW, top: 8, height: 16,
                      background: rgba(excColor, excDone ? 0.55 : excFuture ? 0.30 : 0.75),
                    }}
                    title={`K-${r.k} Excavación (${r.excDays}d) · ${r.startExc} → ${r.endShaft}\n👷 ${pairLbl}`}>
                    {excW > 36 && (
                      <span className="text-[6px] font-black px-1.5 whitespace-nowrap"
                        style={{ color: rgba(C.white, 0.7) }}>
                        {'\uD83D\uDC77'} {pairLbl}
                      </span>
                    )}
                  </div>
                )}
                {/* Caisson excavación completa — solo con confirmación real (dailyLog) */}
                {excDone && r.excDays === 0 && excStartPx !== null && (
                  <div className="absolute rounded flex items-center px-1.5 gap-1"
                    style={{ left: excStartPx, width: DAY_W * 2.5, top: 8, height: 16,
                      background: rgba(C.sage, 0.30) }}>
                    <span className="text-[7px] text-brand-sage">✓</span>
                    <span className="text-[6px] text-brand-sage/70">exc</span>
                  </div>
                )}

                {/* ═══ CAPA 3: Excavación completa confirmada por datos reales ═══ */}
                {excDone && excStartPx !== null && excW > 0 && (
                  <div className="absolute rounded pointer-events-none"
                    style={{ left: excStartPx, width: excW, top: 8, height: 16,
                      background: rgba(C.sage, 0.78) }} />
                )}

                {/* ═══ CAPA 2: Forecast — Campana+Acero ═══ */}
                {caPx !== null && caW > 0 && (
                  <div className="absolute rounded-sm"
                    style={{ left: caPx, width: caW, top: 28, height: 10,
                      background: rgba(C.orange, armadoDone ? 0.60 : 0.28),
                    }}
                    title={`K-${r.k} Campana+Acero: ${r.campanaAceroDay}`} />
                )}

                {/* ═══ CAPA 2: Forecast — Vaciado ═══ */}
                {vacPx !== null && (
                  <div className="absolute rounded"
                    style={{ left: vacPx, width: vacW, top: 28, height: 10,
                      background: rgba(vacRgb, vacDone ? 0.92 : 0.30),
                      boxShadow: isCrit && !vacDone
                        ? `0 0 6px ${rgba(C.red, 0.45)}` : 'none',
                    }}
                    title={`K-${r.k} Vaciado: ${r.vaciadoDay}${isCrit ? ' ★ Ruta crítica' : ''}`} />
                )}

                {/* ═══ CAPA: Actividad real diaria (fuente: dailyLog) ═══
                    Ticks verticales por cada día con registro guardado.
                    Altura proporcional al avance de ese día.
                    Punto pulsante en el último día activo. */}
                {/* ═══ Días reales registrados — mismas barras que proyectadas ═══ */}
                {(dailyActivity[r.k] || []).map((act) => {
                  const dayPx = px(act.date);
                  if (dayPx < 0 || dayPx >= totalWidth) return null;
                  return (
                    <React.Fragment key={`real-${act.date}`}>
                      {/* Barra excavación real (amarillo sólido, sage si excDone) */}
                      {act.excDelta > 0 && (
                        <div className="absolute rounded pointer-events-none z-0"
                          style={{ left: dayPx, width: DAY_W, top: 8, height: 16,
                            background: rgba(excDone ? C.sage : C.yellow, 0.85) }}
                          title={`${act.date} · +${act.excDelta.toFixed(2)}m excavación`} />
                      )}
                      {/* Barra vaciado real (sage sólido) */}
                      {act.vacDelta > 0 && (
                        <div className="absolute rounded pointer-events-none z-0"
                          style={{ left: dayPx, width: DAY_W, top: 28, height: 10,
                            background: rgba(C.sage, 0.85) }}
                          title={`${act.date} · +${act.vacDelta.toFixed(0)}% vaciado`} />
                      )}
                    </React.Fragment>
                  );
                })}

                {/* ═══ CAPA: Holgura total (float bar) ═══
                    Barra punteada translúcida a continuación del vaciado,
                    sólo para caissons con TF > 0 y no completos */}
                {!vacDone && r.totalFloat > 0 && r.floatEndDate && vacPx !== null && (() => {
                  const floatStart = vacPx + vacW;
                  const floatWidth = Math.max(0,
                    px(r.floatEndDate) + DAY_W - floatStart
                  );
                  if (floatWidth <= 0) return null;
                  return (
                    <div className="absolute rounded pointer-events-none"
                      style={{
                        left:       floatStart,
                        width:      floatWidth,
                        top:        29,
                        height:     8,
                        background: rgba(C.sage, 0.10),
                        border:     `1px dashed ${rgba(C.sage, 0.40)}`,
                      }}
                      title={`K-${r.k} Holgura total: +${r.totalFloat}d hábiles · hasta ${r.floatEndDate}`} />
                  );
                })()}

              </div>
            </div>
          );
        })}

        {/* ══════ LEYENDA (pie del gantt) ══════ */}
        <div className="sticky bottom-0 z-20 flex items-center gap-x-5 gap-y-1.5 flex-wrap px-4 py-2.5"
          style={{ background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { style: { background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.20)' }, label: 'Línea Base' },
            { style: { background: rgba(C.yellow, 0.80) },   label: 'Excavación completada' },
            { style: stripes(C.yellow),                       label: 'Excavación proyectada' },
            { style: { background: rgba(C.sage,   0.75) },   label: 'Vaciado completo' },
            { style: stripes(C.sage),                         label: 'Vaciado proyectado' },
            { style: { background: rgba(C.red,    0.70) },   label: 'Ruta crítica' },
            { style: { background: rgba(C.sage, 0.10), border: `1px dashed ${rgba(C.sage, 0.40)}` }, label: 'Holgura total' },
            { style: { background: rgba(C.yellow, 0.80), width: 4, height: 12, borderRadius: 1 }, label: 'Día trabajado (registro)' },
          ].map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-6 h-3 rounded-sm shrink-0" style={l.style} />
              <span className="text-[7px] font-black text-muted/50 uppercase tracking-wide whitespace-nowrap">
                {l.label}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
