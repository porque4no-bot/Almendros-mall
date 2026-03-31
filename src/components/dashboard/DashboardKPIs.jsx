/**
 * DashboardKPIs.jsx
 *
 * Fila de tarjetas KPI. Cuando baselineComparison.hasBaseline es true,
 * renderiza una segunda fila con 3 tarjetas de análisis Plan vs Real:
 *   1. Desviación en fecha de fin del proyecto
 *   2. Avance % planeado vs real (vaciados)
 *   3. Rendimiento m/día actual vs meta
 */
import { REND } from '../../data/constants';
import StatCard from '../ui/StatCard';

/* ── Helper: formatea 'YYYY-MM-DD' → '26 Mar 2026' ─── */
function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/* ── Tarjeta Plan vs Real genérica ──────────────────── */
function PlanRealCard({ label, icon, children, accentBorder }) {
  return (
    <div className={`berlin-card p-4 rounded-2xl relative overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-1 h-full ${accentBorder}`} />
      <div className="flex justify-between items-start mb-3">
        <span className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</span>
        <span className="text-xl opacity-60">{icon}</span>
      </div>
      {children}
    </div>
  );
}

/* ── Barra progreso compacta ─────────────────────────── */
function ProgressBar({ pct, color, label }) {
  return (
    <div>
      {label && <p className="text-[7px] text-muted mb-0.5">{label}</p>}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════ */
export default function DashboardKPIs({
  dash, prevDash, lastActaDash, caissonStatus, totalCaissons,
  baselineComparison,
}) {
  const bc = baselineComparison || { hasBaseline: false };

  return (
    <>
      {/* ── Fila 1: Fases principales ─────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
        <StatCard
          label="Avance Global"
          value={dash.pG.toFixed(1) + "%"}
          color="bg-brand-red"
          delta={prevDash ? dash.pG - prevDash.pG : null}
          deltaActa={lastActaDash ? dash.pG - lastActaDash.pG : null}
          icon={'\uD83C\uDFD7\uFE0F'}
        />
        <StatCard
          label="Campanas"
          value={dash.cCam + " / " + totalCaissons}
          color="bg-brand-yellow"
          delta={prevDash ? dash.pCa - prevDash.pCa : null}
          deltaActa={lastActaDash ? dash.cCamM3 - lastActaDash.cCamM3 : null}
          deltaActaUnit="m³"
          icon={'\uD83D\uDEE1\uFE0F'}
        />
        <StatCard
          label="Armado"
          value={dash.cCas + " / " + totalCaissons}
          color="bg-white"
          delta={prevDash ? dash.pCs - prevDash.pCs : null}
          deltaActa={lastActaDash ? dash.cCasKg - lastActaDash.cCasKg : null}
          deltaActaUnit="kg"
          icon={'\u26D3\uFE0F'}
        />
        <StatCard
          label="Remate"
          value={dash.pR.toFixed(1) + "%"}
          color="bg-purple-500"
          delta={prevDash ? dash.pR - prevDash.pR : null}
          deltaActa={lastActaDash ? dash.pR - lastActaDash.pR : null}
          icon={'\u2728'}
        />
      </div>

      {/* ── Fila 2: Volúmenes ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Excavación"
          value={dash.pE.toFixed(1) + "%"}
          color="bg-brand-orange"
          delta={prevDash ? dash.pE - prevDash.pE : null}
          deltaActa={lastActaDash ? dash.cE - lastActaDash.cE : null}
          deltaActaUnit="m³"
          icon={'\u26A1'}
          subtext={dash.totalExc.toFixed(1) + " / " + dash.totalPTR.toFixed(1) + " m\n" + dash.cE.toFixed(1) + " / " + dash.totalME.toFixed(1) + " m³"}
        />
        <StatCard
          label="Anillos"
          value={dash.cAnillosM.toFixed(1) + " m"}
          color="bg-cyan-500"
          delta={prevDash ? dash.cAnillosM - prevDash.cAnillosM : null}
          deltaActa={lastActaDash ? dash.cAnillos - lastActaDash.cAnillos : null}
          deltaUnit="m"
          deltaActaUnit="m³"
          icon={'\uD83D\uDD18'}
          subtext={dash.cAnillosM.toFixed(1) + " / " + dash.totalAnillosM.toFixed(1) + " m\n" + dash.cAnillos.toFixed(1) + " / " + (dash.totalAnillosM * REND.anillo).toFixed(1) + " m³"}
        />
        <StatCard
          label="Vaciado"
          value={dash.pV.toFixed(1) + "%"}
          color="bg-brand-sage"
          delta={prevDash ? dash.pV - prevDash.pV : null}
          deltaActa={lastActaDash ? dash.cFC - lastActaDash.cFC : null}
          deltaActaUnit="m³"
          imgSrc="/mixer.png"
          subtext={dash.cFC.toFixed(1) + " / " + dash.totalFC.toFixed(1) + " m³"}
        />
      </div>

      {/* ── Contadores estado de caissons ─────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label:"Sin Iniciar",  val: caissonStatus.sinIniciar,  dot:"#64748B" },
          { label:"En Progreso",  val: caissonStatus.enProgreso,  dot:"#FBC202" },
          { label:"Completados",  val: caissonStatus.completados, dot:"#80AF96" },
        ].map(({ label, val, dot }) => (
          <div key={label} className="berlin-card rounded-2xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{background: dot + "33", border: `1.5px solid ${dot}`}}>
              <span className="text-lg font-black" style={{color: dot}}>{val}</span>
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest text-muted">{label}</p>
              <p className="text-xs font-black text-white">
                {((val / totalCaissons) * 100).toFixed(0)}% del total
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════
          FILA PLAN VS REAL — solo si existe línea base
          ═══════════════════════════════════════════════════ */}
      {bc.hasBaseline ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

          {/* ── KPI 1: Desviación en fecha de fin ──────── */}
          <PlanRealCard
            label="Desviación Fin del Proyecto"
            icon="📅"
            accentBorder={bc.projectDelayDays > 0 ? 'bg-brand-red' : 'bg-brand-sage'}
          >
            {bc.projectDelayDays > 0 ? (
              <>
                <p className="text-2xl font-black text-brand-red leading-none">
                  +{bc.projectDelayDays}d
                </p>
                <p className="text-[8px] font-black text-brand-red/70 mt-0.5 uppercase tracking-wider">
                  Retraso acumulado
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-black text-brand-sage leading-none">En tiempo</p>
                <p className="text-[8px] font-black text-brand-sage/70 mt-0.5 uppercase tracking-wider">
                  Sin retrasos detectados
                </p>
              </>
            )}
            <div className="mt-3 pt-3 border-t border-white/5 space-y-1 text-[8px]">
              <div className="flex justify-between text-muted">
                <span>Fin planeado:</span>
                <span className="font-black text-white">{fmtDate(bc.plannedEndDate)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Caissons retrasados:</span>
                <span className={`font-black ${bc.delayedCount > 0 ? 'text-brand-red' : 'text-brand-sage'}`}>
                  {bc.delayedCount} / {totalCaissons}
                </span>
              </div>
            </div>
          </PlanRealCard>

          {/* ── KPI 2: Avance % Plan vs Real ───────────── */}
          <PlanRealCard
            label="Avance Vaciados · Plan vs Real"
            icon="📊"
            accentBorder={bc.realVacPct >= bc.plannedVacPct ? 'bg-brand-sage' : 'bg-brand-orange'}
          >
            <div className="flex items-end gap-3 mb-3">
              <div>
                <p className="text-[7px] text-muted uppercase mb-0.5">Real</p>
                <p className={`text-2xl font-black leading-none ${
                  bc.realVacPct >= bc.plannedVacPct ? 'text-brand-sage' : 'text-brand-red'
                }`}>
                  {bc.realVacPct.toFixed(0)}%
                </p>
              </div>
              <div className="pb-0.5 text-muted/40 text-lg font-black">vs</div>
              <div>
                <p className="text-[7px] text-muted uppercase mb-0.5">Plan</p>
                <p className="text-2xl font-black text-white leading-none">
                  {bc.plannedVacPct.toFixed(0)}%
                </p>
              </div>
            </div>
            <ProgressBar
              pct={bc.plannedVacPct}
              color="bg-white/20"
              label="Plan"
            />
            <div className="mt-1.5">
              <ProgressBar
                pct={bc.realVacPct}
                color={bc.realVacPct >= bc.plannedVacPct ? 'bg-brand-sage' : 'bg-brand-red'}
                label="Real"
              />
            </div>
            <p className="text-[7px] text-muted mt-2">
              {bc.realVacCount} / {totalCaissons} vaciados completados
              {bc.plannedVacCount > 0 && ` · plan: ${bc.plannedVacCount}`}
            </p>
          </PlanRealCard>

          {/* ── KPI 3: Rendimiento m/día ────────────────── */}
          <PlanRealCard
            label="Rendimiento Excavación"
            icon="⚡"
            accentBorder={
              bc.rendimientoActual >= bc.rendimientoMeta * 0.85
                ? 'bg-brand-sage'
                : bc.rendimientoActual >= bc.rendimientoMeta * 0.6
                  ? 'bg-brand-yellow'
                  : 'bg-brand-red'
            }
          >
            <div className="flex items-end gap-2 mb-2">
              <p className={`text-2xl font-black leading-none ${
                bc.rendimientoActual >= bc.rendimientoMeta * 0.85
                  ? 'text-brand-sage'
                  : bc.rendimientoActual >= bc.rendimientoMeta * 0.6
                    ? 'text-brand-yellow'
                    : 'text-brand-red'
              }`}>
                {bc.rendimientoActual.toFixed(1)}
              </p>
              <p className="text-[10px] text-muted pb-0.5 font-black">m/día</p>
            </div>
            <ProgressBar
              pct={(bc.rendimientoActual / bc.rendimientoMeta) * 100}
              color={
                bc.rendimientoActual >= bc.rendimientoMeta * 0.85
                  ? 'bg-brand-sage'
                  : bc.rendimientoActual >= bc.rendimientoMeta * 0.6
                    ? 'bg-brand-yellow'
                    : 'bg-brand-red'
              }
            />
            <div className="mt-2 space-y-1 text-[8px]">
              <div className="flex justify-between text-muted">
                <span>Meta (4 parejas):</span>
                <span className="font-black text-white">{bc.rendimientoMeta.toFixed(1)} m/día</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Eficiencia:</span>
                <span className={`font-black ${
                  bc.rendimientoActual >= bc.rendimientoMeta * 0.85 ? 'text-brand-sage' : 'text-brand-red'
                }`}>
                  {bc.rendimientoMeta > 0
                    ? ((bc.rendimientoActual / bc.rendimientoMeta) * 100).toFixed(0) + '%'
                    : '—'}
                </span>
              </div>
              <p className="text-[7px] text-muted/50">Promedio últimos 7 días del log</p>
            </div>
          </PlanRealCard>

        </div>
      ) : (
        /* Banner informativo cuando no hay línea base aún */
        <div className="berlin-card rounded-2xl px-5 py-4 mb-8 flex items-center gap-3 border border-brand-yellow/20 bg-brand-yellow/5">
          <span className="text-xl shrink-0">📌</span>
          <div>
            <p className="text-[9px] font-black text-brand-yellow uppercase tracking-wider">
              Sin línea base fijada
            </p>
            <p className="text-[8px] text-muted mt-0.5">
              Pide al admin que fije la Línea Base para activar el análisis Plan vs Real y el seguimiento de retrasos.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
