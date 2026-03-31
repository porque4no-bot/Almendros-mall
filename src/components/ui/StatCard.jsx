export default function StatCard({ label, value, color, delta, deltaActa, deltaActaUnit, icon, imgSrc, subtext, deltaUnit }) {
  const unit = deltaUnit || "%";
  const actaUnit = deltaActaUnit || unit;
  const subtextLines = subtext ? subtext.split('\n') : [];
  return (
    <div className="berlin-card p-4 rounded-2xl relative overflow-hidden group">
      <div className={`absolute top-0 right-0 w-1 h-full ${color}`}></div>
      <div className="flex justify-between items-start mb-2">
        <span className="text-[9px] font-black text-muted uppercase tracking-widest">{label}</span>
        {imgSrc
          ? <img src={imgSrc} alt="" className="w-12 h-12 object-contain opacity-75 group-hover:opacity-100 transition-opacity" />
          : <span className="text-xl opacity-60 group-hover:opacity-100 transition-opacity">{icon}</span>
        }
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-xl font-black text-white">{value}</span>
        {delta !== undefined && delta !== null && (
          <span className={`text-[9px] font-black ${delta >= 0 ? 'text-brand-sage' : 'text-brand-red'}`}>
            {delta > 0 ? '\u25B2' : delta < 0 ? '\u25BC' : '\u2014'}{Math.abs(delta).toFixed(1)} {unit}
          </span>
        )}
      </div>
      {deltaActa !== undefined && deltaActa !== null && (
        <p className="text-[7px] font-black text-brand-yellow mt-0.5">
          {deltaActa > 0 ? '+' : ''}{deltaActa.toFixed(1)} {actaUnit}
        </p>
      )}
      {subtextLines.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {subtextLines.map((line, i) => (
            <p key={i} className="text-[8px] font-black text-muted uppercase tracking-tighter">{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
