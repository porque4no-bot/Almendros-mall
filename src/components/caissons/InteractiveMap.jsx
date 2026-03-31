import { useState, useRef, useEffect, useCallback } from 'react';
import { stColor } from '../../utils/caissonUtils';
import { CAISSONS } from '../../data/constants';

// Grid config — single source of truth
const GRID = {
  rows: ['A','B','C','D'],
  cols: ['1','2','3','4','5','6','7','8'],
  // Ratios relative to container width; actual px computed at render
  padLeft: 0.06,   // left padding for row labels
  padTop:  0.08,   // top padding for col labels
  padRight: 0.03,
  padBottom: 0.07,
  // Min cell sizes so labels stay readable on very small screens
  minCellW: 56,
  minCellH: 52,
};

function computeLayout(containerW) {
  const cols = GRID.cols.length;
  const rows = GRID.rows.length;

  const pl = Math.round(containerW * GRID.padLeft);
  const pr = Math.round(containerW * GRID.padRight);
  const pt = Math.round(containerW * GRID.padTop);
  const pb = Math.round(containerW * GRID.padBottom);

  const availW = containerW - pl - pr;
  const cw = Math.max(GRID.minCellW, Math.round(availW / cols));
  const ch = Math.max(GRID.minCellH, Math.round(cw * 0.9));

  const vw = pl + cols * cw + pr;
  const vh = pt + rows * ch + pb;

  return { pl, pt, cw, ch, vw, vh };
}

export default function InteractiveMap({ processed, selK, onSelectCaisson, dailyLog, selDate, incidencias }) {
  const containerRef = useRef(null);
  const [containerW, setContainerW] = useState(860); // sensible default

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerW(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { pl, pt, cw, ch, vw, vh } = computeLayout(containerW);

  const gx = useCallback((ex) => pl + GRID.cols.indexOf(ex) * cw + cw / 2, [pl, cw]);
  const gy = useCallback((ey) => pt + GRID.rows.indexOf(ey) * ch + ch / 2, [pt, ch]);

  // Circle radius scales with cell width
  const R = Math.max(10, Math.round(cw * 0.16));
  const CIRC = 2 * Math.PI * R;

  // Font sizes scale with cell width
  const fLabel = Math.max(7, Math.round(cw * 0.085));
  const fAxis  = Math.max(9, Math.round(cw * 0.13));
  const fPct   = Math.max(7, Math.round(cw * 0.093));
  const fDiam  = Math.max(7, Math.round(cw * 0.088));

  return (
    <div className="berlin-card rounded-3xl p-4 sm:p-6">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h3 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Geometr&iacute;a de Cimentaci&oacute;n</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-sage"></div>
            <span className="text-[9px] font-black uppercase">Finalizado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-brand-yellow"></div>
            <span className="text-[9px] font-black uppercase">Activo</span>
          </div>
        </div>
      </div>
      <div ref={containerRef} className="bg-black/40 rounded-2xl p-2 sm:p-4 border border-white/5 overflow-hidden">
        <svg viewBox={`0 0 ${vw} ${vh}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
          {/* column labels + vertical guides */}
          {GRID.cols.map((col, ci) => (
            <g key={col}>
              <line x1={pl+ci*cw+cw/2} y1={pt-12} x2={pl+ci*cw+cw/2} y2={vh-Math.round(vh*0.05)}
                stroke="rgba(255,255,255,0.04)" strokeDasharray="4,5"/>
              <text x={pl+ci*cw+cw/2} y={pt-18} textAnchor="middle"
                fontSize={fAxis} fontWeight="900" fill="#5A5F6F" className="table-label">{col}</text>
            </g>
          ))}
          {/* row labels + horizontal guides */}
          {GRID.rows.map((row, ri) => (
            <g key={row}>
              <line x1={pl-10} y1={pt+ri*ch+ch/2} x2={vw-10} y2={pt+ri*ch+ch/2}
                stroke="rgba(255,255,255,0.04)" strokeDasharray="4,5"/>
              <text x={pl-18} y={pt+ri*ch+ch/2+5} textAnchor="middle"
                fontSize={fAxis} fontWeight="900" fill="#5A5F6F" className="table-label">{row}</text>
            </g>
          ))}
          {/* caissons */}
          {processed.map(c => {
            if (c.ex === '?' || c.ey === '?') return null;
            const cx = gx(c.ex), cy = gy(c.ey);
            const col = stColor(c.st);
            const pct = c.gP;
            const arc = (pct / 100) * CIRC;
            const isSel = selK === c.k;
            const isBlocked = (incidencias || []).some(i => i.caissonId === c.k && i.tipo === 'bloqueo_roca' && i.estado === 'abierta');
            return (
              <g key={c.k} className="cursor-pointer" onClick={() => onSelectCaisson(c.k)}>
                {/* cell bg on select */}
                {isSel && <rect x={cx-cw/2+4} y={cy-ch/2+4} width={cw-8} height={ch-8}
                  rx="10" fill={col} fillOpacity="0.08"/>}
                {/* BLOQUEADO POR ROCA red warning ring */}
                {isBlocked && <circle cx={cx} cy={cy} r={cw*0.38}
                  fill="rgba(211,34,55,0.08)" stroke="#D32237" strokeWidth="2.5"
                  strokeDasharray="5,3" opacity="0.9"/>}
                {/* campana footprint ring */}
                <circle cx={cx} cy={cy} r={cw*0.36}
                  fill="none" stroke={isBlocked ? "#D32237" : col} strokeWidth="1"
                  strokeDasharray="3,4" opacity="0.25"/>
                {/* progress track */}
                <circle cx={cx} cy={cy} r={R} fill="none"
                  stroke="rgba(255,255,255,0.07)" strokeWidth="3.5"/>
                {/* progress arc */}
                {pct > 0 && (
                  <circle cx={cx} cy={cy} r={R} fill="none"
                    stroke={col} strokeWidth="3.5"
                    strokeDasharray={`${arc} ${CIRC}`}
                    strokeLinecap="round"
                    strokeDashoffset={CIRC/4}
                    opacity="0.9"/>
                )}
                {/* center fill */}
                <circle cx={cx} cy={cy} r={isSel ? R*0.7 : R*0.56}
                  fill={isSel ? col : "rgba(13,13,13,0.95)"}
                  stroke={isBlocked ? "#D32237" : col} strokeWidth={isSel ? 0 : 1.5}/>
                {/* K label */}
                <text x={cx} y={cy+3.5} textAnchor="middle"
                  fontSize={fLabel} fontWeight="900"
                  fill={isSel ? "#0D0D0D" : "#FFFFFF"}>{"K"+c.k}</text>
                {/* diameter between rings */}
                <text x={cx} y={cy+R+fDiam+2} textAnchor="middle"
                  fontSize={fDiam} fontWeight="900" fill="#475569" opacity="0.95">{"\u00F8"+c.campana+"m"}</text>
                {/* % label */}
                <text x={cx} y={cy+ch*0.42} textAnchor="middle"
                  fontSize={fPct} fontWeight="700"
                  fill={col} opacity="0.75">{pct.toFixed(0)+"%"}</text>
                {/* ROCA badge */}
                {isBlocked && (
                  <g>
                    <rect x={cx+10} y={cy-ch*0.42} width={28} height={11} rx="3" fill="#D32237"/>
                    <text x={cx+24} y={cy-ch*0.42+8} textAnchor="middle" fontSize="7" fontWeight="900" fill="#fff">ROCA</text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
