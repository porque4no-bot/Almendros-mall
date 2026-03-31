import { useState } from 'react';

const SERIES = [
  { key: 'global',     label: 'Global',      color: '#D32237' },
  { key: 'excavacion', label: 'Excavación',  color: '#F68000' },
  { key: 'vaciado',    label: 'Vaciado',     color: '#80AF96' },
  { key: 'armado',     label: 'Armado',      color: '#ffffff' },
  { key: 'campanas',   label: 'Campanas',    color: '#FBC202' },
];

export default function ProgressChart({ dataPoints: pts, actas: actasList }) {
  const [activeSeries, setActiveSeries] = useState(['global']);

  if (pts.length < 1) return null;

  const pad = 36, W = 1000, H = 180;

  // Auto-scale: find min/max across all active series
  const allValues = pts.flatMap(d => activeSeries.map(k => d[k] ?? 0));
  const rawMax = Math.max(...allValues, 1);
  const rawMin = Math.min(...allValues, 0);
  const range = rawMax - rawMin || 1;
  const maxV = Math.min(100, rawMax + range * 0.12);
  const minV = Math.max(0, rawMin - range * 0.08);

  const toY = v => H - (((v - minV) / (maxV - minV)) * (H - pad * 2) + pad);
  const toX = i => pts.length === 1 ? W / 2 : (i / (pts.length - 1)) * (W - pad * 2) + pad;

  // Grid lines: 5 evenly spaced between minV and maxV
  const gridLines = Array.from({ length: 5 }, (_, i) => minV + (i / 4) * (maxV - minV));

  const toggle = key => {
    setActiveSeries(prev =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key]
    );
  };

  return (
    <div className="berlin-card rounded-3xl p-6 mb-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h4 className="text-[10px] font-black text-muted uppercase tracking-[0.2em]">Curva de Progreso</h4>
        <div className="flex gap-2 flex-wrap">
          {SERIES.map(s => (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase transition-all border ${
                activeSeries.includes(s.key) ? 'opacity-100' : 'opacity-30'
              }`}
              style={{
                borderColor: s.color,
                color: activeSeries.includes(s.key) ? s.color : '#64748B',
                background: activeSeries.includes(s.key) ? s.color + '22' : 'transparent',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto overflow-visible">
        {/* Grid */}
        {gridLines.map((v, i) => {
          const y = toY(v);
          return (
            <g key={i}>
              <line x1={pad} y1={y} x2={W - pad} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              <text x={pad - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#475569">{v.toFixed(1)}%</text>
            </g>
          );
        })}

        {/* Acta markers */}
        {pts.map((d, i) => actasList.includes(d.label) && (
          <line key={i} x1={toX(i)} y1={pad} x2={toX(i)} y2={H - pad} stroke="#FBC202" strokeWidth="1" strokeDasharray="4,3" opacity="0.4"/>
        ))}

        {/* Series lines */}
        {SERIES.filter(s => activeSeries.includes(s.key)).map(s => {
          const points = pts.map((d, i) => ({ x: toX(i), y: toY(d[s.key] ?? 0), label: d.label, value: d[s.key] ?? 0 }));
          const pathD = points.length > 1 ? "M " + points.map(p => `${p.x},${p.y}`).join(" L ") : "";
          return (
            <g key={s.key}>
              {pathD && <path d={pathD} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9"/>}
              {points.map((p, i) => {
                const isActa = actasList.includes(p.label);
                const showLabel = i === 0 || i === points.length - 1 || isActa;
                return (
                  <g key={i}>
                    <circle cx={p.x} cy={p.y} r={isActa ? 5 : 3} fill={isActa ? "#FBC202" : s.color} stroke="#0D0D0D" strokeWidth="1.5"/>
                    {showLabel && activeSeries.length === 1 && (
                      <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fontWeight="900" fill={s.color}>
                        {p.value.toFixed(1)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
