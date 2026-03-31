/**
 * useSimulation.js
 *
 * Custom hook que encapsula el motor de simulación del cronograma.
 *
 * El motor (runSimulation) es puro JS sincrónico y típicamente termina
 * en < 5 ms para 26 caissons. Para el loop de Monte Carlo (100 corridas)
 * el tiempo total sigue siendo < 200 ms, aceptable dentro de un setTimeout.
 *
 * Uso básico:
 *   const { runSim, result, loading, error, clear } = useSimulation();
 *   runSim(processed, '2026-03-26', cuadrillas);
 *
 * Con Monte Carlo:
 *   runSim(processed, '2026-03-26', cuadrillas, {
 *     today:       '2026-03-29',
 *     monteCarlo:  100,
 *     mcSigma:     0.08,
 *   });
 *   // result.monteCarlo → { runs, p50, p80, p90, p95, min, max, histogram }
 */

import { useState, useCallback } from 'react';
import { runSimulation } from '../utils/engine/simulation';
import { getToday } from '../utils/caissonUtils';

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS ESTADÍSTICOS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Box-Muller transform → número normalmente distribuido con μ=0, σ=1.
 * Evita u=0 para log seguro.
 */
function normalRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Estadísticas percentiles sobre un array de fechas ISO ya ordenadas.
 *
 * @param {string[]} sorted   Fechas YYYY-MM-DD ordenadas ascendente
 * @returns {{ runs, p50, p80, p90, p95, min, max, histogram }}
 */
function computeMCStats(sorted) {
  const n = sorted.length;
  if (!n) return null;

  // Percentil: índice = floor(pct/100 * n), clamped a [0, n-1]
  const pct = (p) => sorted[Math.min(n - 1, Math.floor((p / 100) * n))];

  // Histograma mensual (YYYY-MM → conteo)
  const histogram = {};
  for (const d of sorted) {
    const key = d.slice(0, 7);                             // 'YYYY-MM'
    histogram[key] = (histogram[key] || 0) + 1;
  }

  return {
    runs:      n,
    p50:       pct(50),
    p80:       pct(80),
    p90:       pct(90),
    p95:       pct(95),
    min:       sorted[0],
    max:       sorted[n - 1],
    histogram,
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   HOOK
   ───────────────────────────────────────────────────────────────────────────── */

export function useSimulation() {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  /**
   * Ejecuta la simulación (determinista + Monte Carlo opcional).
   *
   * @param {Array}   caissonsData   Salida de processed (calcC) del App.
   * @param {string}  startDate      'YYYY-MM-DD'. Por defecto: hoy.
   * @param {Array}   cuadrillas     Array de cuadrillas del proyecto.
   * @param {Object}  options        Opciones adicionales:
   *   @param {string}  options.today               Fecha real "hoy" (para curvas de aprendizaje)
   *   @param {number}  options.monteCarlo           Nº de corridas MC (0 = desactivado)
   *   @param {number}  options.mcSigma              Desviación estándar del weatherFactor (default 0.08)
   *   @param {Object}  options.incidencias          Override de caissons bloqueados
   *   @param {number}  options.weatherFactor        Factor climático base (default 1.0)
   *   @param {Object}  options.performanceFactors   Factores de rendimiento por pareja
   *   @param {number}  options.compressorBufferDays Buffer de compresor en días hábiles (default 3)
   */
  const runSim = useCallback((caissonsData, startDate, cuadrillas, options = {}) => {
    setLoading(true);
    setError(null);

    // Ceder el hilo para que React pueda re-renderizar "loading" antes de calcular.
    setTimeout(() => {
      try {
        const {
          monteCarlo = 0,
          mcSigma    = 0.08,
          ...simOptions
        } = options;

        /* ── 1. Corrida determinista base ── */
        const simResult = runSimulation(
          caissonsData || [],
          startDate    || getToday(),
          cuadrillas   || [],
          simOptions,
        );

        /* ── 2. Monte Carlo (opcional) ── */
        if (monteCarlo > 0 && simResult) {
          // Reutilizar los factores de rendimiento ya calculados por la corrida base
          // para que el MC solo varíe el weatherFactor, no recalcule curvas aprendizaje.
          const perfFactors = simResult.pairPerformance || {};
          const endDates    = [];

          for (let i = 0; i < monteCarlo; i++) {
            // weatherFactor ~ N(1, σ²), clamped a [0.50, 1.80]
            const wf = Math.max(0.50, Math.min(1.80, 1.0 + normalRandom() * mcSigma));

            const mcRun = runSimulation(
              caissonsData || [],
              startDate    || getToday(),
              cuadrillas   || [],
              {
                ...simOptions,
                weatherFactor:        wf,
                performanceFactors:   perfFactors,
                today:                null,   // no recalcular curvas de aprendizaje
              },
            );

            if (mcRun?.summary?.projectedEndDate) {
              endDates.push(mcRun.summary.projectedEndDate);
            }
          }

          endDates.sort();   // orden lexicográfico ISO = orden cronológico
          simResult.monteCarlo = computeMCStats(endDates);
        }

        setResult(simResult);
      } catch (err) {
        console.error('[useSimulation] Error en simulación:', err);
        setError(err?.message || 'Error inesperado en la simulación.');
      } finally {
        setLoading(false);
      }
    }, 16); // 1 frame de gracia
  }, []);

  /** Limpia el resultado actual */
  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { runSim, result, loading, error, clear };
}
