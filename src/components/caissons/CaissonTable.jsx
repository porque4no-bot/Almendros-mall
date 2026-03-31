import { stColor } from '../../utils/caissonUtils';
import ExcBar from '../ui/ExcBar';
import CaissonDraw from '../ui/CaissonDraw';

/** Formatea 'YYYY-MM-DD' → 'DD mmm' (sin año, compacto) */
function fmtDateShort(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export default function CaissonTable({
  processed, filter, selK, selDate, prevDayProcessed, lastActaProcessed,
  onSetFilter, onSelectCaisson, onDeleteCaisson, isViewer,
  caissonsComparison,
}) {
  const hasPlan = caissonsComparison && Object.keys(caissonsComparison).length > 0;
  return (
    <div className="berlin-card rounded-3xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/5">
        <h3 className="text-[10px] font-black text-muted uppercase tracking-widest">Estado por Unidad</h3>
        <div className="flex bg-black rounded-lg p-0.5 border border-white/10 text-[8px] font-black uppercase">
          {['all','active','completed'].map(f => (
            <button
              key={f}
              onClick={() => onSetFilter(f)}
              className={`px-3 py-1.5 rounded-md transition ${filter===f ? 'bg-brand-red text-white' : 'text-muted hover:text-white'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto sthin">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/5 text-muted font-black uppercase tracking-tight border-b border-white/10">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-2 py-3 text-center">Secci&oacute;n</th>
              <th className="px-4 py-3">Excavaci&oacute;n</th>
              <th className="px-4 py-3">Anillos</th>
              <th className="px-4 py-3">Vaciado F+C</th>
              <th className="px-4 py-3 text-center">Fases</th>
              <th className="px-4 py-3 text-right">Avance</th>
              {hasPlan && (
                <>
                  <th className="px-3 py-3 text-right text-brand-yellow/70">Inicio Plan.</th>
                  <th className="px-3 py-3 text-right text-brand-yellow/70">Fin Plan.</th>
                  <th className="px-3 py-3 text-right text-brand-yellow/70">Retraso</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {processed.filter(d => filter==='all' || d.st===filter).map(d => (
              <tr
                key={d.k}
                onClick={() => onSelectCaisson(d.k)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!isViewer && confirm(`Eliminar todos los datos de K-${d.k}?`)) {
                    onDeleteCaisson(d.k);
                  }
                }}
                className={`hover:bg-white/5 cursor-pointer transition-colors ${selK===d.k ? 'bg-brand-red/10' : ''}${hasPlan && caissonsComparison[d.k]?.isDelayed ? ' border-l-2 border-brand-red/50' : ''}`}
                title="Click derecho para eliminar"
              >
                {/* ID */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{background: stColor(d.st)}}></div>
                    <div>
                      <span className="font-black text-white block">{"K-"+d.k}</span>
                      <span className="text-[8px] text-muted font-bold">{d.ey+"-"+d.ex}</span>
                    </div>
                  </div>
                </td>

                {/* Mini caisson geometry */}
                <td className="px-2 py-1 text-center">
                  <div style={{width:"44px", height:"64px"}} className="mx-auto">
                    <CaissonDraw
                      status={d.st} pTR={d.pTR} desplante={d.desplante} campana={d.campana}
                      exc={d.exc} vacP={d.vacP} excD={d.excD}
                      armado={d.armado} preop={d.preop} remate={d.remate}
                      mini={true}
                    />
                  </div>
                </td>

                {/* Excavacion */}
                <td className="px-4 py-3 min-w-[140px]">
                  <ExcBar pTR={d.pTR} desplante={d.desplante} currentExc={d.exc} />
                  <span className="text-[8px] font-black text-white mt-1 block">
                    {d.exc.toFixed(2)} m <span className="text-muted font-medium">/ falt. {(d.pTR - d.exc).toFixed(2)} m</span>
                  </span>
                  <span className="text-[7px] text-muted block">{d.volExc.toFixed(2)} m³ exc.</span>
                  <div className="flex gap-2 flex-wrap mt-0.5">
                    {prevDayProcessed && prevDayProcessed[d.k] && (() => {
                      const delta = d.exc - prevDayProcessed[d.k].exc;
                      return delta > 0 ? (
                        <span className="text-[7px] font-black text-brand-sage">+{delta.toFixed(2)} m d</span>
                      ) : null;
                    })()}
                    {lastActaProcessed && lastActaProcessed[d.k] && (() => {
                      const delta = d.exc - lastActaProcessed[d.k].exc;
                      return delta > 0 ? (
                        <span className="text-[7px] font-black text-brand-yellow">+{delta.toFixed(2)} m a</span>
                      ) : null;
                    })()}
                  </div>
                </td>

                {/* Anillos */}
                <td className="px-4 py-3">
                  <span className="text-[8px] font-black text-white block">{d.bill.vA.toFixed(2)} m³</span>
                  <span className="text-[7px] text-muted block">{d.anillos} anillos</span>
                  <div className="flex gap-2 flex-wrap mt-0.5">
                    {prevDayProcessed && prevDayProcessed[d.k] && (() => {
                      const delta = d.bill.vA - prevDayProcessed[d.k].bill.vA;
                      return delta > 0 ? (
                        <span className="text-[7px] font-black text-brand-sage">+{delta.toFixed(2)} m³ d</span>
                      ) : null;
                    })()}
                    {lastActaProcessed && lastActaProcessed[d.k] && (() => {
                      const delta = d.bill.vA - lastActaProcessed[d.k].bill.vA;
                      return delta > 0 ? (
                        <span className="text-[7px] font-black text-brand-yellow">+{delta.toFixed(2)} m³ a</span>
                      ) : null;
                    })()}
                  </div>
                </td>

                {/* Vaciado Fuste + Campana */}
                <td className="px-4 py-3">
                  <div className="w-24 bg-white/10 h-2 rounded-full overflow-hidden">
                    <div className="bg-brand-sage h-full rounded-full" style={{width: d.vacP + "%"}}></div>
                  </div>
                  <span className="text-[8px] font-black text-white mt-1 block">{d.vacP.toFixed(0)}%</span>
                  <span className="text-[7px] text-muted block">{(d.bill.vF + d.bill.vC).toFixed(2)} m³</span>
                  <div className="flex gap-2 flex-wrap mt-0.5">
                    {prevDayProcessed && prevDayProcessed[d.k] && (() => {
                      const deltaVol = (d.bill.vF + d.bill.vC) - (prevDayProcessed[d.k].bill.vF + prevDayProcessed[d.k].bill.vC);
                      return deltaVol > 0 ? (
                        <span className="text-[7px] font-black text-brand-sage">+{deltaVol.toFixed(2)} m³ d</span>
                      ) : null;
                    })()}
                    {lastActaProcessed && lastActaProcessed[d.k] && (() => {
                      const deltaVol = (d.bill.vF + d.bill.vC) - (lastActaProcessed[d.k].bill.vF + lastActaProcessed[d.k].bill.vC);
                      return deltaVol > 0 ? (
                        <span className="text-[7px] font-black text-brand-yellow">+{deltaVol.toFixed(2)} m³ a</span>
                      ) : null;
                    })()}
                  </div>
                </td>

                {/* Fases */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {[
                      { ok: d.preop,    title:"Preop",   color:"#80AF96" },
                      { ok: d.excD,     title:"Excav.",  color:"#FBC202" },
                      { ok: d.armado,   title:"Acero",   color:"#F68000" },
                      { ok: d.vacP>=100,title:"Vaciado", color:"#80AF96" },
                      { ok: d.remate,   title:"Remate",  color:"#D32237"  },
                    ].map((ph, i) => (
                      <div
                        key={i}
                        title={ph.title}
                        className="w-3 h-3 rounded-full border"
                        style={{
                          background: ph.ok ? ph.color : "rgba(255,255,255,0.06)",
                          borderColor: ph.ok ? ph.color : "rgba(255,255,255,0.2)",
                          boxShadow: ph.ok ? `0 0 4px ${ph.color}88` : "none"
                        }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {["P","E","A","V","R"].map((l,i) => (
                      <span key={i} className="text-[6px] font-black text-muted/60 w-3 text-center">{l}</span>
                    ))}
                  </div>
                </td>

                {/* Avance */}
                <td className="px-4 py-3 text-right">
                  <span className="font-black text-brand-red text-sm">{d.gP.toFixed(1)}%</span>
                  {prevDayProcessed && prevDayProcessed[d.k] && (() => {
                    const delta = d.gP - prevDayProcessed[d.k].gP;
                    return delta !== 0 ? (
                      <span className={`text-[7px] font-black block ${delta > 0 ? 'text-brand-sage' : 'text-brand-red'}`}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                      </span>
                    ) : null;
                  })()}
                </td>

                {/* Plan vs Real — solo si hay línea base */}
                {hasPlan && (() => {
                  const comp = caissonsComparison[d.k];
                  if (!comp) return <td colSpan={3} className="px-3 py-3" />;

                  const isCompleted = d.vacP >= 100;
                  const isPastPlanVac = selDate > (comp.planVaciado || '');

                  return (
                    <>
                      {/* Inicio Planeado */}
                      <td className="px-3 py-3 text-right">
                        <span className="text-[8px] text-muted/70 font-black">
                          {fmtDateShort(comp.planStartExc)}
                        </span>
                      </td>

                      {/* Fin Planeado (vaciado) */}
                      <td className="px-3 py-3 text-right">
                        <span className={`text-[8px] font-black ${
                          comp.isDelayed ? 'text-brand-red/80' : 'text-muted/70'
                        }`}>
                          {fmtDateShort(comp.planVaciado)}
                        </span>
                        {comp.isCritical && (
                          <span className="text-[6px] text-brand-red block">RC</span>
                        )}
                      </td>

                      {/* Retraso (días) */}
                      <td className="px-3 py-3 text-right">
                        {comp.endVar > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="text-[9px] font-black text-brand-red flex items-center gap-0.5">
                              <span className="text-[8px]">⚠</span>
                              +{comp.endVar}d
                            </span>
                            {comp.excDelay > 0 && comp.vacDelay === 0 && (
                              <span className="text-[6px] text-brand-red/60">exc</span>
                            )}
                          </div>
                        ) : isCompleted && isPastPlanVac ? (
                          <span className="text-[9px] font-black text-brand-sage">✓</span>
                        ) : (
                          <span className="text-[8px] text-muted/30">—</span>
                        )}
                      </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
