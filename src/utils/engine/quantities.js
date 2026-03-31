/**
 * ENGINE / QUANTITIES.JS
 * Puerto directo de modules/cantidades.py
 *
 * Cálculos estáticos de profundidades, volumetría y dosificación.
 * Acepta overrides del estado real de la obra para actualizar proyecciones.
 */

import {
  SEQUENCE,
  CAMPANA_D, CAMPANA_H, VOL_CAMPANA_MAP,
  SACRIFICE_3, SACRIFICE_15,
  VOL_ANILLO_ML, VOL_FUSTE_ML, VOL_EXC_ML,
  RATE, CEM_ANILLO_BLT,
  CEM_CICL_BLT_M3, MIX_CICL_M3, ISOFLOW_L_M3, AIRTOC_L_M3, AGUA_L_M3,
  PESO_ACERO,
} from './config.js';

/* ─────────────────────────────────────────────────────────────────────────────
   PROFUNDIDADES
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Profundidad total de excavación del caisson k (fuste + campana).
 * Orden de prioridad:
 *   1. Override de medición real (pTR del dailyLog de la app)
 *   2. Grupos sacrificio (10 m o 8.5 m)
 *   3. Default (7.0 m)
 *
 * @param {number}  k
 * @param {Object}  currentTotalOverride  { [k]: profMetros }
 */
export function totalDepth(k, currentTotalOverride = {}) {
  if (currentTotalOverride[k] !== undefined) return currentTotalOverride[k];
  if (SACRIFICE_3.has(k))  return 10.0;
  if (SACRIFICE_15.has(k)) return 8.5;
  return 7.0;
}

/**
 * Profundidad del fuste (sin campana) = totalDepth − altCampana.
 */
export function shaftDepth(k, currentTotalOverride = {}) {
  return totalDepth(k, currentTotalOverride) - CAMPANA_H[k];
}

/**
 * Metros de fuste que aún faltan por excavar.
 *
 * @param {Object}  currentExcOverride    { [k]: metrosExcavados }
 * @param {Object}  currentTotalOverride  { [k]: profMetros }
 */
export function remainingShaft(k, currentExcOverride = {}, currentTotalOverride = {}) {
  const alreadyExc = currentExcOverride[k] ?? 0;
  return Math.max(0, shaftDepth(k, currentTotalOverride) - alreadyExc);
}

/**
 * Días hábiles necesarios para excavar el fuste de k.
 * Incluye 0.5 días extras por terraplén en caissons sacrificio no iniciados.
 * Puerto de exc_days() en cantidades.py.
 */
export function calcExcDays(k, currentExcOverride = {}, currentTotalOverride = {}) {
  const rem = remainingShaft(k, currentExcOverride, currentTotalOverride);
  if (rem <= 0) return 0;

  const isSacrifice = SACRIFICE_3.has(k) || SACRIFICE_15.has(k);
  const alreadyExc  = currentExcOverride[k] ?? 0;
  const terraplen   = (isSacrifice && alreadyExc === 0) ? 0.5 : 0;

  return Math.ceil(rem / RATE + terraplen);
}

/* ─────────────────────────────────────────────────────────────────────────────
   VOLUMETRÍA Y DOSIFICACIÓN
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Calcula todas las cantidades de materiales para el caisson k.
 * Puerto directo de calc_quantities() en cantidades.py.
 *
 * @param {number}  k
 * @param {Object}  currentTotalOverride  { [k]: profMetros }
 * @returns {Object} cantidades de materiales
 */
export function calcQuantities(k, currentTotalOverride = {}) {
  const td  = totalDepth(k, currentTotalOverride);
  const sh  = shaftDepth(k, currentTotalOverride);
  const cd  = CAMPANA_D[k];                        // diámetro (float)
  const cdKey = cd.toFixed(1);                      // clave string para mapas
  const ch  = CAMPANA_H[k];                         // altura campana
  const cv  = VOL_CAMPANA_MAP[cdKey];               // volumen campana

  // ── Volumen ciclópeo: campana + fuste lleno − 1 m superior ────────────────
  const sf       = Math.max(0, sh - 1.0);           // metros de fuste con relleno
  const volCicl  = cv + sf * VOL_FUSTE_ML;
  const volMez   = volCicl * 0.70;                  // 70% mezcla
  const volPied  = volCicl * 0.30;                  // 30% piedra de mano
  const volPiedAc = volPied / 0.70;                 // con factor 30% vacíos en acopio

  // ── Anillos ────────────────────────────────────────────────────────────────
  const volAnil  = sh * VOL_ANILLO_ML;

  // ── Escombro ───────────────────────────────────────────────────────────────
  const volExc   = sh * VOL_EXC_ML + cv;

  // ── Cemento ───────────────────────────────────────────────────────────────
  const anillosN = sh / RATE;                        // nº anillos aprox.
  const cemA     = anillosN * CEM_ANILLO_BLT;        // cemento anillos
  const cemC     = volMez * CEM_CICL_BLT_M3;         // cemento ciclópeo

  // ── Mixto ──────────────────────────────────────────────────────────────────
  const mixA     = volAnil * 1.0;
  const mixC     = volMez * MIX_CICL_M3;

  // ── Aditivos ciclópeo ─────────────────────────────────────────────────────
  const isoflow  = volMez * ISOFLOW_L_M3;
  const airtoc   = volMez * AIRTOC_L_M3;
  const agua     = volMez * AGUA_L_M3;

  // ── Escombro expandido ────────────────────────────────────────────────────
  const debris   = volExc * 1.30;

  return {
    totalDepth: td,
    shaft: sh,
    campanaD: cd,
    campanaH: ch,
    campanaVol: cv,
    shaftFill: sf,
    volCiclopeo: volCicl,
    volMezcla: volMez,
    volPiedra: volPied,
    volPiedraAcopio: volPiedAc,
    volAnillos: volAnil,
    volExc,
    cemAnillos: cemA,
    cemCiclopeo: cemC,
    cemTotal: cemA + cemC,
    mixtoAnillos: mixA,
    mixtoCiclopeo: mixC,
    mixtoTotal: mixA + mixC,
    isoflow,
    airtoc,
    agua,
    debris,
    aceroKg: PESO_ACERO[k],
  };
}

/**
 * Pre-calcula cantidades para TODOS los caissons de la secuencia.
 * Retorna un mapa { [k]: cantidades }.
 *
 * @param {Object} currentTotalOverride   profundidades reales si se tienen
 */
export function buildQuantitiesMap(currentTotalOverride = {}) {
  return Object.fromEntries(
    SEQUENCE.map(k => [k, calcQuantities(k, currentTotalOverride)])
  );
}
