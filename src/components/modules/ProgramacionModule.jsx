/**
 * ProgramacionModule.jsx
 *
 * Panel de Analítica (Earned Value) + Diagrama de Gantt Visual.
 *
 * FASE 1 — KPIs analíticos de alto impacto:
 *   · Desviación del Fin (forecast vs baseline)
 *   · Avance Vaciados (plan vs real)
 *   · Ruta Crítica activa vs plan
 *
 * FASE 3 — Auto-run: al montar el módulo o al cambiar processed/cuadrillas
 *   se re-ejecuta la simulación automáticamente (sin botón). Se usa un hash
 *   de firma para evitar re-runs idénticos.
 *
 * Props:
 *   processed    — Array caissons procesados (calcC) del App
 *   baselineData — Documento Firestore proyecto/lineaBase (o null)
 *   selDate      — fecha "hoy" YYYY-MM-DD
 *   cuadrillas   — Array de cuadrillas del proyecto
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSimulation } from '../../hooks/useSimulation';
import { getToday } from '../../utils/caissonUtils';
import GanttChartVisual from './GanttChartVisual';

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS DE FECHA
   ───────────────────────────────────────────────────────────────────────────── */
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: '2-digit',
  });
}

function diffDays(a, b) {
  if (!a || !b) return 0;
  const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  return Math.round((parse(b) - parse(a)) / 86400000);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SUB-COMPONENTES UI
   ───────────────────────────────────────────────────────────────────────────── */

function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'w-3 h-3 border-2' : 'w-6 h-6 border-2';
  return <div className={`${s} border-current/30 border-t-current rounded-full animate-spin shrink-0`} />;
}

/** Barra de progreso de dos colores (plan vs real) */
function ProgBar({ plan, real, colorPlan = 'bg-white/20', colorReal = 'bg-brand-sage' }) {
  return (
    <div className="relative w-full h-2 bg-white/5 rounded-full overflow-hidden mt-1.5">
      <div className={`absolute left-0 top-0 h-full rounded-full ${colorPlan}`}
        style={{ width: `${Math.min(100, plan)}%` }} />
      <div className={`absolute left-0 top-0 h-full rounded-full ${colorReal} transition-all duration-700`}
        style={{ width: `${Math.min(100, real)}%` }} />
    </div>
  );
}

/** Badge de caisson en ruta crítica */
function CritBadge({ k, changed }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[7px] font-black ${
      changed ? 'bg-brand-red/30 text-brand-red' : 'bg-white/10 text-muted'
    }`}>
      {changed && <span className="w-1.5 h-1.5 rounded-full bg-brand-red animate-pulse shrink-0" />}
      K-{k}
    </span>
  );
}

/** Badge de nombre de pareja */
function PairBadge({ name }) {
  return (
    <span className="px-2 py-0.5 rounded-lg text-[8px] font-black bg-white/10 text-white/70">
      {name}
    </span>
  );
}

/**
 * Panel de resultados Monte Carlo.
 * Muestra percentiles P50/P80/P90/P95 y un histograma mensual.
 */
function MonteCarloPanel({ mc }) {
  if (!mc) return null;
  const { p50, p80, p90, p95, min, max, histogram, runs } = mc;

  const histEntries = Object.entries(histogram).sort(([a], [b]) => a < b ? -1 : 1);
  const maxCount    = Math.max(1, ...histEntries.map(([, c]) => c));

  const P_ITEMS = [
    { label: 'P50', value: fmtDate(p50), color: 'text-brand-sage',   title: '50% de corridas terminan antes' },
    { label: 'P80', value: fmtDate(p80), color: 'text-brand-yellow', title: '80% de corridas terminan antes' },
    { label: 'P90', value: fmtDate(p90), color: 'text-brand-orange', title: '90% de corridas terminan antes' },
    { label: 'P95', value: fmtDate(p95), color: 'text-brand-red',    title: '95% de corridas terminan antes' },
  ];

  return (
    <div className="berlin-card rounded-2xl p-5">
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest">
          🎲 Monte Carlo · {runs} corridas
        </p>
        <p className="text-[7px] text-muted/50">
          σ clima: ±8% · Rango {fmtDate(min)} – {fmtDate(max)}
        </p>
      </div>

      {/* Percentiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {P_ITEMS.map(({ label, value, color, title }) => (
          <div key={label} className="bg-white/[0.03] rounded-xl p-3 text-center" title={title}>
            <p className="text-[7px] font-black text-muted uppercase mb-1">{label}</p>
            <p className={`text-[10px] font-black leading-tight ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Histograma mensual */}
      {histEntries.length > 0 && (
        <div>
          <p className="text-[6px] font-black text-muted/40 uppercase tracking-widest mb-2">
            Distribución de fechas de fin
          </p>
          <div className="flex items-end gap-1" style={{ height: 64 }}>
            {histEntries.map(([month, count]) => {
              const barH = Math.max(4, Math.round((count / maxCount) * 54));
              const [, mm] = month.split('-');
              const monthLabel = new Date(Number(month.slice(0, 4)), Number(mm) - 1, 1)
                .toLocaleDateString('es-CO', { month: 'short' })
                .toUpperCase().slice(0, 3);
              return (
                <div key={month} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height:     barH,
                      background: `rgba(128,175,150,${0.25 + (count / maxCount) * 0.55})`,
                    }}
                    title={`${month}: ${count} corridas`}
                  />
                  <span className="text-[5px] text-muted/40 truncate">{monthLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   GANTT HISTÓRICO — actividad real reconstruida desde dailyLog
   ───────────────────────────────────────────────────────────────────────────── */

const H_DAY_W   = 28;
const H_ROW_H   = 56;
const H_LABEL_W = 140;

function parseLocal(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function hDiffDays(a, b) {
  if (!a || !b) return 0;
  return Math.round((parseLocal(b) - parseLocal(a)) / 86400000);
}
function hAddCal(str, n) {
  const d = parseLocal(str);
  d.setDate(d.getDate() + n);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/**
 * Reconstruye desde dailyLog:
 * - Hitos por caisson (excStart, excEnd, armadoDate, vaciadoDate)
 * - Actividad diaria: { date, excDelta, vacDelta, excTotal, vacTotal, excD }
 */
function buildHistorial(dailyLog) {
  const hist      = {};   // { k: { hitos + days[] } }
  const prevEntry = {};   // último entry conocido por caisson
  const sortedDates = Object.keys(dailyLog).sort();

  for (const date of sortedDates) {
    const entries = dailyLog[date] || {};
    for (const [kStr, entry] of Object.entries(entries)) {
      const k = Number(kStr);
      if (!hist[k]) hist[k] = {
        k,
        excStart: null, excEnd: null, armadoDate: null, vaciadoDate: null,
        pTR: entry.restante || 0,   // profundidad total (aproximada del primer registro)
        days: [],
      };
      const h    = hist[k];
      const prev = prevEntry[k] || { exc: 0, vacP: 0 };

      // Hitos
      if (!h.excStart    && (entry.exc > 0 || entry.preop))  h.excStart    = date;
      if (!h.excEnd      && entry.excD)                       h.excEnd      = date;
      if (!h.armadoDate  && entry.armado)                     h.armadoDate  = date;
      if (!h.vaciadoDate && (entry.vacP ?? 0) >= 100)         h.vaciadoDate = date;

      // Actualizar pTR con el mayor valor visto de restante (antes de que termine)
      if (!entry.excD && entry.restante > h.pTR) h.pTR = entry.restante;

      // Actividad diaria (solo si algo cambió)
      const excDelta = Math.max(0, (entry.exc  ?? 0) - (prev.exc  ?? 0));
      const vacDelta = Math.max(0, (entry.vacP ?? 0) - (prev.vacP ?? 0));
      if (excDelta > 0 || vacDelta > 0 || (!h.excStart && entry.preop)) {
        h.days.push({
          date,
          excDelta,
          vacDelta,
          excTotal: entry.exc  ?? 0,
          vacTotal: entry.vacP ?? 0,
          excD:     !!entry.excD,
        });
      }

      prevEntry[k] = entry;
    }
  }

  return Object.values(hist)
    .filter(h => h.excStart || h.days.length)
    .sort((a, b) => (a.excStart || '') < (b.excStart || '') ? -1 : 1);
}

function HistoricalGanttView({ dailyLog, selDate, processed = [] }) {
  const rows = useMemo(() => buildHistorial(dailyLog), [dailyLog]);

  // pTR por caisson desde processed (más preciso que el estimado del log)
  const pTRMap = useMemo(() => {
    const m = {};
    processed.forEach(p => { m[p.k] = p.pTR || 1; });
    return m;
  }, [processed]);

  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    if (!rows.length) return { chartStart: selDate, chartEnd: selDate, totalDays: 1 };
    const allDates = rows.flatMap(r =>
      [r.excStart, r.excEnd, r.armadoDate, r.vaciadoDate, ...r.days.map(d => d.date)]
    ).filter(Boolean);
    const mn = allDates.reduce((a, b) => a < b ? a : b);
    const mx = allDates.reduce((a, b) => a > b ? a : b);
    return {
      chartStart: hAddCal(mn, -2),
      chartEnd:   hAddCal(selDate > mx ? selDate : mx, 3),
      totalDays:  hDiffDays(hAddCal(mn, -2), hAddCal(selDate > mx ? selDate : mx, 3)) + 1,
    };
  }, [rows, selDate]);

  const px = (str) => Math.max(0, hDiffDays(chartStart, str)) * H_DAY_W;
  const totalWidth = totalDays * H_DAY_W;
  const todayPx    = px(selDate);

  const months = useMemo(() => {
    const spans = [];
    let [y, m] = chartStart.split('-').map(Number);
    const [ey, em] = chartEnd.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const mFirst = `${y}-${String(m).padStart(2, '0')}-01`;
      const mLast  = (() => { const d = new Date(y, m, 0); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
      const cStart = mFirst < chartStart ? chartStart : mFirst;
      const cEnd   = mLast  > chartEnd   ? chartEnd   : mLast;
      const days   = hDiffDays(cStart, cEnd) + 1;
      const offset = hDiffDays(chartStart, cStart);
      const label  = new Date(y, m-1, 1).toLocaleDateString('es-CO', { month: 'short', year: '2-digit' }).toUpperCase();
      spans.push({ label, days, offset });
      if (++m > 12) { m = 1; y++; }
    }
    return spans;
  }, [chartStart, chartEnd]);

  if (!rows.length) {
    return (
      <div className="p-16 text-center">
        <p className="text-[9px] font-black text-muted uppercase tracking-widest">Sin registros históricos</p>
        <p className="text-[8px] text-muted/40 mt-2">Los datos aparecerán conforme se registren actividades diarias</p>
      </div>
    );
  }

  return (
    <div className="overflow-auto sthin rounded-2xl border border-white/5"
      style={{ maxHeight: 'calc(100vh - 320px)', background: '#0a0a0a' }}>
      <div style={{ minWidth: H_LABEL_W + totalWidth, position: 'relative' }}>

        {/* ── Cabecera meses ── */}
        <div className="sticky top-0 z-20 flex"
          style={{ height: 26, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="sticky left-0 z-30 flex items-end px-3 pb-1"
            style={{ width: H_LABEL_W, minWidth: H_LABEL_W, background: '#0a0a0a',
              borderRight: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="text-[7px] font-black text-muted/50 uppercase tracking-widest">Unidad</span>
          </div>
          <div className="relative" style={{ width: totalWidth, height: 26 }}>
            {months.map((ms, i) => (
              <div key={i} className="absolute flex items-center px-2"
                style={{ left: ms.offset * H_DAY_W, width: ms.days * H_DAY_W, height: 26,
                  borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                <span className="text-[8px] font-black text-muted/70 tracking-wider">{ms.label}</span>
              </div>
            ))}
            {todayPx >= 0 && todayPx < totalWidth && (
              <div className="absolute bottom-0 flex items-end justify-center pointer-events-none z-10"
                style={{ left: todayPx + H_DAY_W / 2 - 5, width: 10 }}>
                <div style={{ width: 0, height: 0,
                  borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                  borderTop: '7px solid rgba(211,34,55,0.85)' }} />
              </div>
            )}
          </div>
        </div>

        {/* ── Filas ── */}
        {rows.map((r, idx) => {
          const pTR        = pTRMap[r.k] || r.pTR || 1;
          const vacDone    = !!r.vaciadoDate;
          const excInProg  = !!r.excStart && !r.excEnd;
          const armPx      = r.armadoDate  ? px(r.armadoDate)  : null;
          const vacPx      = r.vaciadoDate ? px(r.vaciadoDate) : null;

          // Máx delta de excavación para normalizar alturas de ticks
          const maxExcDelta = Math.max(1, ...r.days.map(d => d.excDelta));

          // Último día con actividad (para el pulso)
          const lastDay = r.days.length ? r.days[r.days.length - 1] : null;
          const isActive = lastDay && !vacDone && lastDay.date === selDate;

          // Progreso actual de excavación
          const lastExcTotal = lastDay?.excTotal ?? 0;
          const excPct = Math.min(100, Math.round((lastExcTotal / pTR) * 100));

          return (
            <div key={r.k} className="flex hover:bg-white/[0.02] transition-colors"
              style={{ height: H_ROW_H, borderBottom: '1px solid rgba(255,255,255,0.04)',
                background: idx % 2 ? 'rgba(255,255,255,0.006)' : 'transparent' }}>

              {/* ── Label sticky ── */}
              <div className="sticky left-0 z-10 flex flex-col justify-center px-3 gap-0.5 shrink-0"
                style={{ width: H_LABEL_W, minWidth: H_LABEL_W,
                  background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-1.5">
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-yellow animate-pulse shrink-0" />
                  )}
                  <span className="text-[10px] font-black text-white">K-{r.k}</span>
                </div>
                {/* Barra de progreso de excavación */}
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${excPct}%`,
                      background: vacDone ? 'rgba(128,175,150,0.8)' : 'rgba(251,194,2,0.7)' }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[6px] text-muted/40">{r.excStart}</span>
                  <span className={`text-[6px] font-black ${vacDone ? 'text-brand-sage' : excInProg ? 'text-brand-yellow' : 'text-muted/60'}`}>
                    {vacDone ? '✓ Vaciado' : `${excPct}%`}
                  </span>
                </div>
              </div>

              {/* ── Timeline ── */}
              <div className="relative shrink-0" style={{ width: totalWidth, height: H_ROW_H }}>

                {/* Línea hoy */}
                {todayPx >= 0 && todayPx < totalWidth && (
                  <div className="absolute top-0 bottom-0 pointer-events-none z-10"
                    style={{ left: todayPx + H_DAY_W / 2,
                      borderLeft: '1px dashed rgba(211,34,55,0.35)', width: 0 }} />
                )}

                {/* Track excavación (fondo sutil) */}
                {r.excStart && (
                  <div className="absolute rounded pointer-events-none"
                    style={{
                      left:   px(r.excStart),
                      width:  r.excEnd
                        ? Math.max(H_DAY_W, px(r.excEnd) - px(r.excStart) + H_DAY_W)
                        : Math.max(H_DAY_W * 2, todayPx - px(r.excStart) + H_DAY_W),
                      top: 20, height: 4,
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 2,
                    }} />
                )}

                {/* Ticks de actividad diaria — excavación */}
                {r.days.filter(d => d.excDelta > 0).map((d, i) => {
                  const dayPx  = px(d.date);
                  const relH   = Math.max(4, Math.round((d.excDelta / maxExcDelta) * 16));
                  const isLastExc = i === r.days.filter(x => x.excDelta > 0).length - 1;
                  const isPulse   = isLastExc && excInProg;
                  const opacity   = 0.50 + (d.excDelta / maxExcDelta) * 0.50;
                  const color = d.excD
                    ? `rgba(128,175,150,${opacity})`
                    : `rgba(251,194,2,${opacity})`;
                  return (
                    <div key={d.date} className="absolute pointer-events-none"
                      style={{
                        left:         dayPx + (H_DAY_W - 4) / 2,
                        width:        4,
                        top:          24 - relH,
                        height:       relH,
                        background:   color,
                        borderRadius: 2,
                      }}
                      title={`${d.date} · +${d.excDelta.toFixed(2)}m · total ${d.excTotal.toFixed(2)}m`}>
                      {/* Punto pulsante en el último día activo */}
                      {isPulse && (
                        <div className="absolute animate-pulse"
                          style={{
                            top: -5, left: -3,
                            width: 10, height: 10,
                            borderRadius: '50%',
                            background: 'rgba(251,194,2,0.90)',
                            boxShadow: '0 0 8px rgba(251,194,2,0.70)',
                          }} />
                      )}
                    </div>
                  );
                })}

                {/* Ticks de actividad diaria — vaciado */}
                {r.days.filter(d => d.vacDelta > 0).map((d) => {
                  const dayPx = px(d.date);
                  const relH  = Math.max(3, Math.round((d.vacDelta / 100) * 12));
                  return (
                    <div key={`vac-${d.date}`} className="absolute pointer-events-none"
                      style={{
                        left:         dayPx + (H_DAY_W - 4) / 2,
                        width:        4,
                        top:          40 - relH,
                        height:       relH,
                        background:   `rgba(128,175,150,${0.50 + (d.vacDelta / 100) * 0.50})`,
                        borderRadius: 2,
                      }}
                      title={`${d.date} · vaciado +${d.vacDelta.toFixed(0)}% · total ${d.vacTotal.toFixed(0)}%`} />
                  );
                })}

                {/* Track vaciado (fondo sutil) */}
                {(armPx !== null || vacPx !== null) && (
                  <div className="absolute rounded pointer-events-none"
                    style={{
                      left:       armPx ?? vacPx,
                      width:      vacPx !== null
                        ? Math.max(H_DAY_W, vacPx - (armPx ?? vacPx) + H_DAY_W)
                        : H_DAY_W * 2,
                      top: 36, height: 4,
                      background: 'rgba(255,255,255,0.06)',
                      borderRadius: 2,
                    }} />
                )}

                {/* Hito armado */}
                {armPx !== null && (
                  <div className="absolute rounded-sm pointer-events-none"
                    style={{ left: armPx, width: H_DAY_W, top: 34, height: 8,
                      background: 'rgba(246,128,0,0.75)' }}
                    title={`K-${r.k} Armado completado: ${r.armadoDate}`} />
                )}

                {/* Hito vaciado */}
                {vacPx !== null && (
                  <div className="absolute rounded pointer-events-none"
                    style={{ left: vacPx, width: H_DAY_W * 1.5, top: 34, height: 8,
                      background: 'rgba(128,175,150,0.92)',
                      boxShadow: '0 0 8px rgba(128,175,150,0.40)' }}
                    title={`K-${r.k} Vaciado 100%: ${r.vaciadoDate}`} />
                )}

              </div>
            </div>
          );
        })}

        {/* ── Leyenda ── */}
        <div className="sticky bottom-0 z-20 flex items-center gap-x-5 flex-wrap px-4 py-2.5"
          style={{ background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { style: { background: 'rgba(251,194,2,0.75)' },   label: 'Día trabajado (exc)' },
            { style: { background: 'rgba(128,175,150,0.75)' }, label: 'Exc completada' },
            { style: { background: 'rgba(246,128,0,0.75)' },   label: 'Armado' },
            { style: { background: 'rgba(128,175,150,0.92)' }, label: 'Vaciado 100%' },
          ].map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-sm shrink-0" style={l.style} />
              <span className="text-[7px] font-black text-muted/50 uppercase tracking-wide">{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse shrink-0" />
            <span className="text-[7px] font-black text-muted/50 uppercase tracking-wide">Activo hoy</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Tarjeta KPI de Earned Value */
function EVCard({ icon, label, value, sub, accent = 'text-white', detail, detailColor = 'text-muted' }) {
  return (
    <div className="berlin-card rounded-2xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-base leading-none">{icon}</span>
        <p className="text-[7px] font-black text-muted uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-lg font-black leading-none truncate ${accent}`}>{value}</p>
      {sub && <p className="text-[8px] text-muted/70">{sub}</p>}
      {detail && <p className={`text-[7px] font-black mt-0.5 ${detailColor}`}>{detail}</p>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   VISTAS DE TABS
   ───────────────────────────────────────────────────────────────────────────── */

/** Tab "👷 Cuadrillas" — schedule por pareja */
function PairScheduleTab({ result }) {
  if (!result) return null;
  const { pairSchedules, pairNames = {} } = result;
  const entries = Object.entries(pairSchedules || {});
  if (!entries.length) {
    return (
      <div className="p-10 text-center text-[9px] font-black text-muted uppercase">
        Sin parejas en la simulación
      </div>
    );
  }
  return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {entries.map(([pid, schedule]) => (
        <div key={pid} className="berlin-card rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <PairBadge name={pairNames[pid] || pid} />
            <span className="text-[7px] font-black text-muted uppercase">
              {schedule.length} caissons
            </span>
          </div>
          <div className="space-y-1.5">
            {schedule.map(s => (
              <div key={s.k} className="flex justify-between items-center">
                <span className="text-[9px] font-black text-white/70">K-{s.k}</span>
                <span className="text-[8px] text-muted">{fmtDate(s.startExc)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Tab "📦 Logística" — acero, compresor, resumen */
function LogisticaTab({ result }) {
  if (!result) return null;
  const { gantt, summary } = result;
  const byLote1 = gantt.filter(r => r.loteAcero === 1).length;
  const byLote2 = gantt.filter(r => r.loteAcero === 2).length;
  const yaExcavados = gantt.filter(r => r.excDays === 0).length;
  const sacrificios = gantt.filter(r => r.isSacrifice3 || r.isSacrifice15).length;

  return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Acero */}
      <div className="berlin-card rounded-2xl p-4">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-3">
          🔩 Acero
        </p>
        <div className="space-y-2 text-[9px]">
          <div className="flex justify-between">
            <span className="text-muted">Lote 1 disponible:</span>
            <span className="font-black text-brand-yellow">{fmtDate(summary.steel1Date)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Lote 2 disponible:</span>
            <span className="font-black text-brand-sage">{fmtDate(summary.steel2Date)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-white/5">
            <span className="text-muted">Distribución:</span>
            <span className="font-black text-white">{byLote1} L1 · {byLote2} L2</span>
          </div>
        </div>
      </div>

      {/* Compresor */}
      <div className="berlin-card rounded-2xl p-4">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-3">
          💨 Compresor
        </p>
        <p className="text-[7px] text-muted/50 mb-2">K-7, K-15, K-16 (roca)</p>
        <div className="space-y-2 text-[9px]">
          <div className="flex justify-between">
            <span className="text-muted">Solicitar:</span>
            <span className="font-black text-white">{fmtDate(summary.compressor?.request)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Llegada:</span>
            <span className="font-black text-white">{fmtDate(summary.compressor?.arrive)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Libre para excavar:</span>
            <span className="font-black text-brand-red">{fmtDate(summary.compressor?.clear)}</span>
          </div>
        </div>
      </div>

      {/* Caissons */}
      <div className="berlin-card rounded-2xl p-4">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-3">
          📦 Caissons
        </p>
        <div className="space-y-2 text-[9px]">
          <div className="flex justify-between">
            <span className="text-muted">Ya excavados:</span>
            <span className="font-black text-brand-sage">{yaExcavados}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Bloqueados roca:</span>
            <span className="font-black text-brand-red">3</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Sacrificio prof.:</span>
            <span className="font-black text-brand-orange">{sacrificios}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-white/5">
            <span className="text-muted">Total caissons:</span>
            <span className="font-black text-white">{gantt.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════════ */

export default function ProgramacionModule({
  processed    = [],
  baselineData = null,
  selDate,
  cuadrillas   = [],
  incidencias  = [],
  dailyLog     = {},
}) {
  const today = selDate || getToday();
  const { runSim, result, loading, error } = useSimulation();

  const [startDate, setStartDate] = useState(today);

  // Sincronizar startDate cuando cambia la fecha del calendario
  useEffect(() => {
    setStartDate(today);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeTab, setActiveTab] = useState('gantt'); // 'gantt' | 'pairs' | 'logistica'
  const [mcEnabled, setMcEnabled] = useState(false);

  /* ── Hash de firma para evitar re-runs idénticos ── */
  const sigRef = useRef('');
  const buildSig = (proc, sq, sd, mc, inc) => {
    const procSig  = proc.map(p => `${p.k}:${(p.exc||0).toFixed(1)}:${(p.vacP||0).toFixed(0)}:${p.cuadrillaId || ''}`).join('|');
    const quadSig  = sq.filter(q => q.activa).map(q => q.id).join(',');
    const incArray = Array.isArray(inc) ? inc : Array.from(inc || []);
    const incSig   = incArray.map(i => typeof i === 'object' ? (i.k || i.id || i.caissonId) : i).sort().join(',');
    return `${procSig}__${quadSig}__${sd}__mc${mc ? 1 : 0}__blk${incSig}`;
  };

  /* ── Auto-run cuando processed / cuadrillas / startDate / mcEnabled / incidencias cambian ── */
  useEffect(() => {
    if (!processed.length) return;
    const sig = buildSig(processed, cuadrillas, startDate, mcEnabled, incidencias);
    if (sig === sigRef.current) return;
    sigRef.current = sig;
    // Extraer sólo los IDs numéricos de caissons con bloqueo_roca abierto
    const blockedIds = incidencias
      .filter(i => i.tipo === 'bloqueo_roca' && i.estado === 'abierta')
      .map(i => Number(i.caissonId))
      .filter(n => !isNaN(n));
    runSim(processed, startDate, cuadrillas, {
      today,
      incidencias: blockedIds,
      monteCarlo: mcEnabled ? 100 : 0,
    });
  }, [processed, cuadrillas, startDate, mcEnabled, incidencias]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Earned Value Analytics ── */
  const ev = useMemo(() => {
    if (!result) return null;
    const forecastEnd = result.summary?.projectedEndDate;
    const baselineEnd = baselineData?.summary?.projectedEndDate;

    // Desviación del fin (negativo = retraso, positivo = adelanto)
    const devDays = (baselineEnd && forecastEnd)
      ? diffDays(forecastEnd, baselineEnd) * -1   // forecast - baseline
      : null;

    // % vaciados planeados para hoy según baseline
    const blGantt = baselineData?.gantt || [];
    const plannedVac = blGantt.length
      ? (blGantt.filter(r => r.vaciadoDay <= today).length / blGantt.length) * 100
      : null;

    // % vaciados reales completados
    const realVac = processed.length
      ? (processed.filter(p => (p.vacP ?? 0) >= 100).length / processed.length) * 100
      : 0;

    // Rutas críticas
    const curCrit = result.criticalPath || [];
    const blCrit  = baselineData?.criticalPath || [];
    const blCritSet = new Set(blCrit);
    const critChanged = curCrit.some(k => !blCritSet.has(k)) || blCrit.some(k => !new Set(curCrit).has(k));

    return { devDays, plannedVac, realVac, curCrit, blCrit, critChanged, forecastEnd, baselineEnd };
  }, [result, baselineData, processed, today]);

  /* ── Helpers de formato EV ── */
  const fmtDev = (d) => {
    if (d === null) return '—';
    if (d === 0)    return 'En plazo';
    return d > 0 ? `+${d}d adelanto` : `${d}d retraso`;
  };
  const devAccent = (d) => {
    if (d === null) return 'text-muted';
    if (d > 0)      return 'text-brand-sage';
    if (d < 0)      return 'text-brand-red';
    return 'text-brand-yellow';
  };

  /* ── Tabs config ── */
  const TABS = [
    { key: 'gantt',     label: '📅 Gantt Visual' },
    { key: 'pairs',     label: '👷 Cuadrillas'   },
    { key: 'logistica',  label: '📦 Logística'    },
  ];

  /* ── Render ── */
  return (
    <div className="space-y-6">

      {/* ── Panel de control ───────────────────────────────────────────────── */}
      <div className="berlin-card rounded-3xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-black uppercase tracking-widest text-white leading-none">
                Programación · Gantt
              </h2>
              {loading && <Spinner size="sm" />}
            </div>
            <p className="text-[9px] text-muted mt-1">
              Simulación automática · {processed.length} caissons ·{' '}
              {cuadrillas.filter(q => q.activa && q.especialidad === 'Excavación').length || 4} parejas de excavación
            </p>
            {result && !loading && (
              <p className="text-[8px] text-brand-sage/70 mt-0.5 font-black">
                ✓ Actualizado · fin proyectado {fmtDate(result.summary?.projectedEndDate)}
              </p>
            )}
          </div>

          {/* Controles derechos */}
          <div className="flex items-end gap-3 flex-wrap">

            {/* Toggle Monte Carlo */}
            <div className="flex flex-col gap-1">
              <label className="text-[7px] font-black text-muted uppercase tracking-widest">
                Monte Carlo
              </label>
              <button
                onClick={() => setMcEnabled(v => !v)}
                title={mcEnabled ? 'Desactivar Monte Carlo' : 'Activar análisis probabilístico (100 corridas)'}
                className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition border ${
                  mcEnabled
                    ? 'bg-brand-sage/20 border-brand-sage/40 text-brand-sage'
                    : 'bg-white/5 border-white/10 text-muted hover:text-white'
                }`}
              >
                {mcEnabled ? '🎲 Activo' : '🎲 Inactivo'}
              </button>
            </div>

            {/* Fecha de inicio manual */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sim-startdate" className="text-[7px] font-black text-muted uppercase tracking-widest">
                Fecha de inicio simulación
              </label>
              <input
                id="sim-startdate"
                name="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-brand-red/50 transition"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 bg-brand-red/10 border border-brand-red/30 rounded-2xl px-4 py-3">
            <span className="text-brand-red shrink-0 font-black text-sm">!</span>
            <p className="text-[10px] font-black text-brand-red">{error}</p>
          </div>
        )}
      </div>

      {/* ── Estado vacío / cargando ─────────────────────────────────────────── */}
      {!result && !loading && (
        <div className="berlin-card rounded-3xl p-16 text-center">
          <div className="text-5xl mb-4 opacity-20 select-none">📅</div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">
            Calculando cronograma proyectado...
          </p>
          <p className="text-[8px] text-muted/40 mt-2">
            Se ejecuta automáticamente al cargar los datos de la obra
          </p>
        </div>
      )}

      {loading && !result && (
        <div className="berlin-card rounded-3xl p-16 flex flex-col items-center gap-4 text-center">
          <Spinner />
          <p className="text-[10px] font-black uppercase tracking-widest text-muted">
            Calculando...
          </p>
        </div>
      )}

      {/* ── Resultados ─────────────────────────────────────────────────────── */}
      {result && (
        <>
          {/* ── FASE 1: EV KPI Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

            {/* KPI 1: Desviación del Fin */}
            <EVCard
              icon="📆"
              label="Desviación Fin de Obra"
              value={ev ? fmtDev(ev.devDays) : fmtDate(result.summary?.projectedEndDate)}
              sub={ev?.baselineEnd
                ? `Baseline: ${fmtDate(ev.baselineEnd)} · Forecast: ${fmtDate(ev.forecastEnd)}`
                : `Fin proyectado: ${fmtDate(result.summary?.projectedEndDate)}`}
              accent={ev ? devAccent(ev.devDays) : 'text-brand-red'}
              detail={`${result.summary?.totalCalDays ?? '—'} días calendario totales`}
            />

            {/* KPI 2: Avance Vaciados */}
            <div className="berlin-card rounded-2xl p-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-base leading-none">🏗️</span>
                <p className="text-[7px] font-black text-muted uppercase tracking-widest">Avance Vaciados</p>
              </div>
              <div className="flex items-end gap-2">
                <p className="text-lg font-black leading-none text-brand-sage">
                  {ev ? ev.realVac.toFixed(0) : 0}%
                </p>
                {ev?.plannedVac !== null && (
                  <p className="text-[9px] font-black text-muted mb-0.5">
                    plan {ev.plannedVac.toFixed(0)}%
                  </p>
                )}
              </div>
              {ev?.plannedVac !== null ? (
                <ProgBar
                  plan={ev.plannedVac}
                  real={ev.realVac}
                  colorPlan="bg-white/15"
                  colorReal="bg-brand-sage"
                />
              ) : (
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mt-1.5">
                  <div className="h-full bg-brand-sage rounded-full transition-all duration-700"
                    style={{ width: `${ev?.realVac ?? 0}%` }} />
                </div>
              )}
              <p className="text-[7px] text-muted/60 mt-0.5">
                {processed.filter(p => (p.vacP ?? 0) >= 100).length} / {processed.length} vaciados completos
              </p>
            </div>

            {/* KPI 3: Ruta Crítica */}
            <div className="berlin-card rounded-2xl p-4 flex flex-col gap-1.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-base leading-none">🔴</span>
                <p className="text-[7px] font-black text-muted uppercase tracking-widest">Ruta Crítica Activa</p>
              </div>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {(ev?.curCrit || result.criticalPath || []).map(k => (
                  <CritBadge key={k} k={k}
                    changed={ev?.critChanged && !new Set(ev.blCrit).has(k)} />
                ))}
                {!(ev?.curCrit || result.criticalPath || []).length && (
                  <span className="text-[8px] text-muted">—</span>
                )}
              </div>
              {ev?.critChanged && (
                <p className="text-[7px] font-black text-brand-red mt-0.5">
                  ⚠ Cambió respecto al baseline
                </p>
              )}
              {ev && !ev.critChanged && ev.blCrit.length > 0 && (
                <p className="text-[7px] text-brand-sage/70 mt-0.5 font-black">
                  ✓ Sin cambios respecto al plan
                </p>
              )}
              <p className="text-[7px] text-muted/60 mt-auto">
                {(ev?.curCrit || result.criticalPath || []).length} caissons en ruta crítica
              </p>
            </div>
          </div>

          {/* ── Monte Carlo Panel (visible cuando está activado y hay resultados) ── */}
          {mcEnabled && result.monteCarlo && (
            <MonteCarloPanel mc={result.monteCarlo} />
          )}
          {mcEnabled && !result.monteCarlo && !loading && (
            <div className="berlin-card rounded-2xl p-4 flex items-center gap-3">
              <span className="text-xl">🎲</span>
              <p className="text-[8px] text-muted font-black uppercase">
                Monte Carlo pendiente — relanza la simulación para ver resultados probabilísticos
              </p>
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="berlin-card rounded-3xl overflow-hidden">
            {/* Tab header */}
            <div className="px-6 py-3 border-b border-white/5 bg-white/[0.03] flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 bg-black rounded-xl p-0.5 border border-white/10">
                {TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase transition ${
                      activeTab === tab.key
                        ? 'bg-brand-red text-white'
                        : 'text-muted hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Info rápida */}
              <div className="flex items-center gap-3 text-[8px] text-muted">
                <span>
                  Inicio: <span className="text-white font-black">{fmtDate(result.summary?.startDate)}</span>
                </span>
                <span>
                  Fin: <span className="text-brand-red font-black">{fmtDate(result.summary?.projectedEndDate)}</span>
                </span>
                <span>
                  <span className="text-brand-yellow font-black">{result.summary?.totalWorkDays ?? '—'}</span> días hábiles
                </span>
              </div>
            </div>

            {/* ── Gantt Visual ── */}
            {activeTab === 'gantt' && (
              <div className="p-4">
                <GanttChartVisual
                  gantt={result.gantt}
                  pairNames={result.pairNames || {}}
                  criticalPath={result.criticalPath}
                  baselineData={baselineData}
                  processed={processed}
                  selDate={today}
                  dailyLog={dailyLog}
                />
              </div>
            )}

            {/* ── Cuadrillas / Parejas ── */}
            {activeTab === 'pairs' && (
              <PairScheduleTab result={result} />
            )}

            {/* ── Logística ── */}
            {activeTab === 'logistica' && (
              <LogisticaTab result={result} />
            )}

          </div>
        </>
      )}
    </div>
  );
}
