import { clamp } from '../../utils/caissonUtils';

export default function ExcBar({ desplante, pTR, currentExc, height = 14 }) {
  const fill = clamp((currentExc / pTR) * 100, 0, 100);
  const p1 = (desplante / pTR) * 100;
  return (
    <div className="relative w-full bg-white/10 rounded-full overflow-hidden border border-white/5" style={{ height: height + "px" }}>
      <div className="absolute top-0 left-0 h-full bg-brand-yellow" style={{ width: fill + "%" }}></div>
      <div className="absolute top-0 left-0 h-full border-r border-brand-red bg-brand-red/20" style={{ width: p1 + "%" }}></div>
    </div>
  );
}
