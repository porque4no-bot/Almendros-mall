/**
 * ENGINE / CONFIG.JS
 * Puerto directo de modules/config.py
 *
 * Reutilizamos CAISSONS de src/data/constants.js para derivar
 * CAMPANA_D y PESO_ACERO (evitamos duplicar geometría).
 * Mantenemos nuestras propias CAMPANA_H_SPEC / VOL_CAMPANA_MAP
 * porque difieren ligeramente de los valores de caissonUtils.js.
 */

import { CAISSONS } from '../../data/constants';

// ── Secuencia de ejecución ───────────────────────────────────────────────────
export const SEQUENCE = [7,8,12,11,15,16,23,24,25,26,20,19,6,10,14,18,22,21,17,13,9,5,1,2,3,4];

// ── Geometría de campana — derivada de constants.js ─────────────────────────
/** Diámetro de campana por caisson (float, ej. 2.0, 2.2…) */
export const CAMPANA_D = Object.fromEntries(CAISSONS.map(c => [c.k, c.campana]));

/**
 * Altura de campana por diámetro.
 * NOTA: Usa los valores de config.py (1.0m para ∅2.0), que difieren
 * ligeramente de profCampana de constants.js (0.9m para ∅2.0).
 * El motor de simulación usa estos valores para mantener coherencia interna.
 */
export const CAMPANA_H_SPEC = {
  '1.8': 1.0,
  '2.0': 1.0,
  '2.2': 1.1,
  '2.4': 1.3,
};

/** Altura de campana por caisson k (Number) → meters */
export const CAMPANA_H = Object.fromEntries(
  CAISSONS.map(c => [c.k, CAMPANA_H_SPEC[c.campana.toFixed(1)]])
);

/**
 * Volumen de campana por diámetro (m³).
 * Usa los valores de config.py (ligeramente distintos de REND.campana.vol).
 * Acceder con: VOL_CAMPANA_MAP[(diam).toFixed(1)]
 */
export const VOL_CAMPANA_MAP = {
  '1.8': 2.178,
  '2.0': 2.547,
  '2.2': 3.209,
  '2.4': 4.258,
};

// ── Peso de acero — derivado de constants.js ─────────────────────────────────
/** Peso de acero (kg) por caisson k */
export const PESO_ACERO = Object.fromEntries(CAISSONS.map(c => [c.k, c.peso]));

// ── Grupos especiales ────────────────────────────────────────────────────────
/** Caissons "sacrificio 3": prof. 10 m */
export const SACRIFICE_3  = new Set([1, 5, 9, 13, 17, 21]);
/** Caissons "sacrificio 15": prof. 8.5 m */
export const SACRIFICE_15 = new Set([2, 6, 10, 14, 18, 22]);
/** Caissons bloqueados por roca (requieren compresor) */
export const BLOCKED      = new Set([7, 15, 16]);

// ── Estado de excavación en fecha base (26/03/2026) ─────────────────────────
/** Excavación real medida en campo al inicio (metros del fuste) */
export const BASELINE_CURRENT_EXC = {
  7: 6.8, 8: 5.8, 12: 2.6, 11: 5.6, 15: 1.2, 16: 6.7,
};

/** Profundidad total real medida en campo para esos caissons (metros) */
export const BASELINE_CURRENT_TOTAL = {
  7: 7.8, 8: 7.5, 12: 7.6, 11: 7.5, 15: 7.6, 16: 7.7,
};

// ── Rendimientos y volumetría ─────────────────────────────────────────────────
export const VOL_ANILLO_ML = 0.377;   // m³ de anillo por metro lineal
export const VOL_FUSTE_ML  = 0.953;   // m³ de fuste por metro lineal
export const VOL_EXC_ML    = 1.33;    // m³ excavado por metro lineal
export const RATE           = 1.4;    // metros de fuste excavados por día hábil
export const CEM_ANILLO_BLT = 2.5;   // bultos de cemento por anillo (cada 1.4 m exc.)

// ── Dosificación ciclópeo (mezcla 4000 3-4 MIX IP6) ─────────────────────────
export const CEM_CICL_BLT_M3 = 7.8;    // bultos/m³ mezcla
export const MIX_CICL_M3     = 1.02;   // m³ mixto / m³ mezcla
export const ISOFLOW_L_M3    = 2.33;   // L Isoflow 7800 / m³ mezcla
export const AIRTOC_L_M3     = 0.50;   // L AIRTOC D / m³ mezcla
export const AGUA_L_M3       = 175.5;  // L agua / m³ mezcla

// ── Stocks iniciales al 26/03/2026 ───────────────────────────────────────────
export const INIT_CEM      = 40.0;  // bultos cemento
export const INIT_MIXTO    = 6.0;   // m³ mixto
export const INIT_PIEDRA   = 8.0;   // m³ piedra de mano
export const INIT_ESCOMBRO = 4.0;   // m³ escombro sin expandir

// ── Fechas clave (acero) ─────────────────────────────────────────────────────
/**
 * Primer lunes de disponibilidad de acero lote 1.
 * Se usa como fallback; runSimulation() lo recalcula dinámicamente
 * como el primer lunes >= startDate.
 */
export const STEEL1_FALLBACK_DATE = '2026-03-30';
