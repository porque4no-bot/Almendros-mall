import { stColor } from '../../utils/caissonUtils';
import { REND } from '../../data/constants';

export default function CaissonDraw({ status, pTR, desplante, campana, exc=0, vacP=0, excD=false, armado=false, preop=false, remate=false, mini=false }) {
  const col = stColor(status);
  const cd = REND.campana[campana.toFixed(1)] || REND.campana["2.0"];
  const TOP = 22, BOT = 148;
  const TOTAL = BOT - TOP;
  const scale = TOTAL / pTR;
  const sw = mini ? 16 : 24;
  const cx = 50;
  const shaftH = (pTR - cd.alt) * scale;
  const bellStartY = TOP + shaftH;
  const bottomY = TOP + pTR * scale;
  const excFrontY = TOP + Math.min(exc, pTR) * scale;
  const desY = TOP + (desplante / pTR) * pTR * scale;
  const bellRpx = (campana / 2) * (mini ? 10 : 14);
  const concreteTopY = vacP > 0 ? bottomY - (vacP / 100) * pTR * scale : bottomY;

  const PHASES = [
    { ok: preop,    label:"PRE", color:"#80AF96" },
    { ok: excD,     label:"EXC", color:"#FBC202" },
    { ok: armado,   label:"ACE", color:"#F68000" },
    { ok: vacP>=100,label:"VAC", color:"#80AF96" },
    { ok: remate,   label:"REM", color:"#D32237"  },
  ];

  return (
    <svg viewBox="0 0 100 160" className="w-full h-full drop-shadow-lg">
      {/* soil background */}
      <rect x="0" y={TOP} width="100" height={TOTAL} fill="rgba(160,120,80,0.10)" rx="2"/>

      {/* excavated void */}
      {exc > 0 && (
        <rect
          x={cx - sw/2 + 1} y={TOP}
          width={sw - 2}
          height={Math.min(excFrontY - TOP, bellStartY - TOP)}
          fill="rgba(211,34,55,0.15)"
        />
      )}
      {excD && (
        <path
          d={`M ${cx-sw/2} ${bellStartY} C ${cx-sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx-bellRpx} ${bottomY} ${cx} ${bottomY} C ${cx+bellRpx} ${bottomY} ${cx+sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx+sw/2} ${bellStartY}`}
          fill="rgba(211,34,55,0.18)"
        />
      )}

      {/* concrete fill */}
      {vacP > 0 && (
        <>
          <rect
            x={cx - sw/2 + 2} y={concreteTopY}
            width={sw - 4}
            height={Math.max(0, bellStartY - concreteTopY)}
            fill="rgba(128,175,150,0.45)" rx="1"
          />
          {vacP >= 100 && (
            <path
              d={`M ${cx-sw/2} ${bellStartY} C ${cx-sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx-bellRpx} ${bottomY} ${cx} ${bottomY} C ${cx+bellRpx} ${bottomY} ${cx+sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx+sw/2} ${bellStartY}`}
              fill="rgba(128,175,150,0.45)"
            />
          )}
        </>
      )}

      {/* shaft walls */}
      <rect x={cx - sw/2}     y={TOP} width={2} height={shaftH} fill={col} opacity="0.9"/>
      <rect x={cx + sw/2 - 2} y={TOP} width={2} height={shaftH} fill={col} opacity="0.9"/>

      {/* bell outline */}
      <path
        d={`M ${cx-sw/2} ${bellStartY} C ${cx-sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx-bellRpx} ${bottomY} ${cx} ${bottomY} C ${cx+bellRpx} ${bottomY} ${cx+sw/2} ${bellStartY + cd.alt*scale*0.55} ${cx+sw/2} ${bellStartY}`}
        fill="none" stroke={col} strokeWidth="1.5" opacity="0.85"
      />

      {/* base plate */}
      <line x1={cx-bellRpx} y1={bottomY} x2={cx+bellRpx} y2={bottomY} stroke={col} strokeWidth="2" opacity="0.6"/>

      {/* ground level */}
      <line x1="4" y1={TOP} x2="96" y2={TOP} stroke="#D32237" strokeWidth="1.5" strokeDasharray="3,2"/>
      <text x={cx} y={TOP - 5} textAnchor="middle" fontSize="7" fill="#D32237" fontWeight="900">{'\u00B10.00'}</text>

      {/* desplante dashed */}
      <line x1={cx-sw/2-4} y1={desY} x2={cx+sw/2+4} y2={desY} stroke="#FBC202" strokeWidth="1" strokeDasharray="2,2" opacity="0.65"/>

      {/* current excavation front */}
      {exc > 0 && exc < pTR && (
        <line x1={cx-sw/2} y1={excFrontY} x2={cx+sw/2} y2={excFrontY} stroke="#FBC202" strokeWidth="2.5"/>
      )}

      {/* depth label */}
      {!mini && (
        <text x={cx} y={BOT + 10} textAnchor="middle" fontSize="7" fill="#475569" fontWeight="700">
          {exc.toFixed(1)}m / {pTR.toFixed(1)}m
        </text>
      )}

      {/* phase dots (right side) */}
      {!mini && PHASES.map((ph, i) => {
        const dy = TOP + (i / (PHASES.length - 1)) * TOTAL;
        return (
          <g key={i}>
            <circle cx="90" cy={dy} r="5" fill={ph.ok ? ph.color : "rgba(255,255,255,0.08)"} stroke={ph.ok ? ph.color : "rgba(255,255,255,0.18)"} strokeWidth="1"/>
            <text x="90" y={dy + 2.5} textAnchor="middle" fontSize="4.5" fill={ph.ok ? "#0D0D0D" : "#475569"} fontWeight="900">{ph.label}</text>
          </g>
        );
      })}
    </svg>
  );
}
