import { CAISSON_MAP, REND, CAISSONS, CAISSON_COORDS } from '../data/constants';

export const stColor = s => s === "completed" ? "#80AF96" : s === "active" ? "#FBC202" : "#64748B";

export const getToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const defEntry = c => ({
  exc:0, anillos:0, restante:c.prof+0.58, desplante:0.58, sueloNatural:0, preop:false, armado:false, remate:false,
  excManualComplete:false,
  bloqueadoRoca:false,
  observaciones:"",
  imagenBase64:"",
  barrasColocadas:0,
  vueltasChipa:0,
  cuadrillaId: null,          // ID de la cuadrilla asignada (de la colección cuadrillas[])
  remateChecks:{ nivelacion:false, plomada:false, recubrimiento:false, superficie:false, curado:false }
});

export const findC = k => CAISSON_MAP[k] || CAISSONS[0];

export const getCDef = c => REND.campana[c.campana.toFixed(1)] || REND.campana["2.0"];

export const clamp = (v, mn, mx) => Math.max(mn, Math.min(mx, v));

export function calcC(c, inp) {
  const cd = getCDef(c);
  const pTR = c.prof + inp.desplante;
  const tr = pTR - cd.alt;
  const seg = (mn, mx) => Math.max(0, Math.min(mx, inp.exc) - mn) * REND.exc;
  const e03 = seg(0, 3);
  const e36 = seg(3, 6);
  const e69 = seg(6, 9);
  const excD  = inp.exc >= pTR || inp.excManualComplete;
  const vEC = inp.exc >= pTR ? cd.vol : 0;
  const vA  = inp.anillos * REND.anillo;
  const vC  = excD && inp.restante < pTR ? cd.vol : 0;
  const mlF = excD ? Math.min(c.profFuste, Math.max(0, pTR - cd.alt - inp.restante)) : 0;
  const vF  = mlF * REND.fuste;
  let volExc = inp.exc <= tr
    ? inp.exc * REND.exc
    : (tr * REND.exc) + ((Math.min(cd.alt, inp.exc - tr) / cd.alt) * cd.vol);
  const volCon = vA + vC + vF;
  const mE = (tr * REND.exc) + cd.vol;
  const mC = cd.vol + (tr * REND.anillo) + (c.profFuste * REND.fuste);
  const vacP  = excD ? clamp(((pTR - inp.restante) / pTR) * 100, 0, 100) : 0;
  const allD  = inp.preop && excD && inp.armado && vacP >= 100 && inp.remate;
  const st    = allD ? "completed" : (inp.preop || inp.exc > 0 || inp.armado || vacP > 0 || inp.remate) ? "active" : "idle";
  const excPct = Math.min(1, inp.exc / pTR);
  const gP = (inp.preop ? 5 : 0) + (excPct * 45) + (excD ? 15 : 0) + (inp.armado ? 15 : 0) + (vacP * 0.15) + (inp.remate ? 5 : 0);
  const co = CAISSON_COORDS[c.k] || { x:0, y:0, ex:"?", ey:"?" };
  return {
    ...c, ...inp, pTR, tr, cd,
    bill: { vE:e03+e36+e69+vEC, vA, vF, vC, vT:vA+vF+vC, e03, e36, e69, vEC, acero:inp.armado?c.peso:0 },
    volExc, volCon, mE, mC, vacP, excD, st, gP, ...co
  };
}

export function calcGlobal(log, date) {
  let total = 0;
  for (const c of CAISSONS) {
    total += calcC(c, (log[date] && log[date][c.k]) ? log[date][c.k] : defEntry(c)).gP;
  }
  return total / CAISSONS.length;
}
