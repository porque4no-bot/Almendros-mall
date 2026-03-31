/**
 * InventarioModule.jsx
 *
 * Módulo completo de Inventario, Pedidos y Stock.
 * Replica la lógica del Excel (6 hojas) como módulo principal.
 *
 * Sub-tabs:
 *   1. Resumen — KPIs, alertas, totales
 *   2. Log Diario — consumo diario de materiales
 *   3. Pedidos — gestión completa de órdenes
 *   4. Entregas Cemento — detalle entregas con vida útil
 *   5. Lotes Acero — lotes dinámicos con caissons
 *   6. Stock Proyectado — balance diario con entradas/salidas/déficit
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSimulation } from '../../hooks/useSimulation';
import { getToday } from '../../utils/caissonUtils';
import { buildProcurementPlan } from '../../utils/engine/procurement';

/* ── Helpers ─────────────────────────────────────────────────────────────────── */
function fmtDate(str) {
  if (!str) return '—';
  const [, m, d] = str.split('-');
  return `${d}/${m}`;
}

function fmtDateFull(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-').map(Number);
  const dow = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const dt = new Date(y, m - 1, d);
  return `${dow[dt.getDay()]} ${d}/${m}`;
}

function fmtQty(n, dec = 1) {
  if (n == null || isNaN(n)) return '—';
  if (n === 0) return '0';
  return n.toFixed(dec).replace(/\.0$/, '');
}

function fmtQty0(n) { return fmtQty(n, 0); }

const STATUS_STYLES = {
  sugerido:   'bg-brand-yellow/20 text-brand-yellow border-brand-yellow/30',
  confirmado: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  entregado:  'bg-brand-sage/20 text-brand-sage border-brand-sage/30',
  cancelado:  'bg-white/5 text-muted border-white/10 line-through',
};

const MAT_COLORS = {
  Cemento: 'text-brand-yellow',
  Acero:   'text-brand-orange',
  Mixto:   'text-brand-sage',
  Piedra:  'text-white',
};

const MAT_BG = {
  Cemento: 'bg-brand-yellow/10 border-brand-yellow/20',
  Acero:   'bg-brand-orange/10 border-brand-orange/20',
  Mixto:   'bg-brand-sage/10 border-brand-sage/20',
  Piedra:  'bg-white/5 border-white/10',
};

/* ── Tooltip para desglose ──────────────────────────────────────────────────── */
function Tip({ lines, children, className = '' }) {
  if (!lines || !lines.length) return <td className={`px-3 py-1.5 text-[9px] ${className}`}>{children}</td>;
  return (
    <td className={`px-3 py-1.5 text-[9px] group/tip relative cursor-default ${className}`}>
      {children}
      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/tip:block pointer-events-none">
        <div className="bg-[#1a1a1a] border border-white/20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
          {lines.map((l, i) => (
            <p key={i} className={`text-[8px] ${l.startsWith('─') ? 'text-white/20 leading-tight' : l.startsWith('=') ? 'font-black text-white mt-0.5' : 'text-white/70'}`}>
              {l.startsWith('─') ? '────────────────' : l.startsWith('=') ? l.slice(1) : l}
            </p>
          ))}
        </div>
      </div>
    </td>
  );
}

/* ── Tabla genérica ─────────────────────────────────────────────────────────── */
function TH({ children, className = '', tip }) {
  if (!tip) return <th className={`text-left px-3 py-2 text-[7px] font-black text-muted uppercase tracking-wide ${className}`}>{children}</th>;
  return (
    <th className={`text-left px-3 py-2 text-[7px] font-black text-muted uppercase tracking-wide group/th relative cursor-default ${className}`}>
      {children}
      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/th:block pointer-events-none">
        <div className="bg-[#1a1a1a] border border-white/20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
          <p className="text-[8px] text-white/70">{tip}</p>
        </div>
      </div>
    </th>
  );
}
function TD({ children, className = '' }) {
  return <td className={`px-3 py-1.5 text-[9px] ${className}`}>{children}</td>;
}

/* ── Builders de líneas de tooltip ─────────────────────────────────────────── */
function buildExcTip(detail) {
  if (!detail?.exc?.length) return null;
  const lines = detail.exc.map(e =>
    `K-${e.k} exc: ${fmtQty(e.cemBlt)} blt cem + ${fmtQty(e.mixtoM3)} m³ mix + ${fmtQty(e.debrisM3)} m³ esc`
  );
  return lines;
}

function buildCemTip(detail) {
  if (!detail) return null;
  const lines = [];
  if (detail.exc?.length) {
    for (const e of detail.exc) lines.push(`K-${e.k} anillo: ${fmtQty(e.cemBlt)} blt`);
  }
  if (detail.vaciado?.length) {
    lines.push('─');
    for (const v of detail.vaciado) lines.push(`K-${v.k} vaciado: ${fmtQty(v.cemBlt)} blt`);
  }
  if (!lines.length) return null;
  const total = (detail.exc || []).reduce((s, e) => s + e.cemBlt, 0)
    + (detail.vaciado || []).reduce((s, v) => s + v.cemBlt, 0);
  lines.push('─');
  lines.push(`=Total: ${fmtQty(total)} blt`);
  return lines;
}

function buildMixTip(detail) {
  if (!detail) return null;
  const lines = [];
  if (detail.exc?.length) {
    for (const e of detail.exc) lines.push(`K-${e.k} anillo: ${fmtQty(e.mixtoM3)} m³`);
  }
  if (detail.vaciado?.length) {
    lines.push('─');
    for (const v of detail.vaciado) lines.push(`K-${v.k} vaciado: ${fmtQty(v.mixtoM3)} m³`);
  }
  if (!lines.length) return null;
  const total = (detail.exc || []).reduce((s, e) => s + e.mixtoM3, 0)
    + (detail.vaciado || []).reduce((s, v) => s + v.mixtoM3, 0);
  lines.push('─');
  lines.push(`=Total: ${fmtQty(total)} m³`);
  return lines;
}

function buildPiedraTip(detail) {
  if (!detail?.vaciado?.length) return null;
  const lines = detail.vaciado.map(v => `K-${v.k} vaciado: ${fmtQty(v.piedraM3)} m³`);
  const total = detail.vaciado.reduce((s, v) => s + v.piedraM3, 0);
  lines.push('─');
  lines.push(`=Total: ${fmtQty(total)} m³`);
  return lines;
}

function buildAceroTip(detail) {
  if (!detail?.campana?.length) return null;
  return detail.campana.map(c => `K-${c.k} canasta: ${fmtQty0(c.aceroKg)} kg`);
}

function buildDebrisTip(detail) {
  if (!detail?.exc?.length) return null;
  const lines = detail.exc.map(e => `K-${e.k}: ${fmtQty(e.debrisM3)} m³`);
  const total = detail.exc.reduce((s, e) => s + e.debrisM3, 0);
  lines.push('─');
  lines.push(`=Total: ${fmtQty(total)} m³`);
  return lines;
}

function buildVacTip(detail) {
  if (!detail?.vaciado?.length) return null;
  return detail.vaciado.map(v =>
    `K-${v.k}: ${fmtQty(v.cemBlt)} blt cem · ${fmtQty(v.mixtoM3)} m³ mix · ${fmtQty(v.piedraM3)} m³ piedra`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 1: RESUMEN
   ═══════════════════════════════════════════════════════════════════════════════ */
function ResumenTab({ plan }) {
  const totCem = plan.cementOrders.reduce((s, o) => s + o.qty, 0);
  const totAce = plan.steelOrders.reduce((s, o) => s + o.qty, 0);
  const totMix = plan.mixtoOrders.reduce((s, o) => s + o.qty, 0);
  const totPie = plan.piedraOrders.reduce((s, o) => s + o.qty, 0);
  const totalOrders = plan.allOrders.length;
  const totalDeliveries = plan.cementDeliveries.length;

  // Alertas
  const alerts = [];
  const deficitDays = plan.stockForecast.filter(f => f.cemDeficit > 0);
  if (deficitDays.length) alerts.push({ type: 'error', msg: `${deficitDays.length} días con déficit de cemento` });
  const mixDeficit = plan.stockForecast.filter(f => f.mixStock < 0);
  if (mixDeficit.length) alerts.push({ type: 'error', msg: `${mixDeficit.length} días con déficit de mixto` });
  const pieDeficit = plan.stockForecast.filter(f => f.pieStock < 0);
  if (pieDeficit.length) alerts.push({ type: 'error', msg: `${pieDeficit.length} días con déficit de piedra` });
  const expiredDays = plan.stockForecast.filter(f => f.cemExpired > 0);
  if (expiredDays.length) alerts.push({ type: 'warn', msg: `${expiredDays.reduce((s, f) => s + f.cemExpired, 0)} bultos se vencen (${expiredDays.length} días)` });

  // Escombro
  const lastDay = plan.stockForecast[plan.stockForecast.length - 1];
  const totalDebrisTrips = lastDay?.debrisTotalTrips || 0;

  return (
    <div className="space-y-4">
      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((a, i) => (
            <div key={i} className={`px-4 py-2 rounded-xl text-[9px] font-black border ${
              a.type === 'error'
                ? 'bg-brand-red/10 text-brand-red border-brand-red/20'
                : 'bg-brand-yellow/10 text-brand-yellow border-brand-yellow/20'
            }`}>
              {a.type === 'error' ? '⚠' : '⚡'} {a.msg}
            </div>
          ))}
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Pedidos Totales', val: totalOrders, sub: `${totalDeliveries} entregas cem.`, color: 'text-white' },
          { label: 'Cemento Total', val: `${fmtQty0(totCem)} blt`, sub: `${plan.cementOrders.length} pedidos`, color: 'text-brand-yellow' },
          { label: 'Acero Total', val: `${fmtQty0(totAce)} kg`, sub: `${plan.steelOrders.length} lotes`, color: 'text-brand-orange' },
          { label: 'Escombro', val: `${totalDebrisTrips} viajes`, sub: `~${fmtQty(totalDebrisTrips * 8)} m³`, color: 'text-muted' },
        ].map((card, i) => (
          <div key={i} className="berlin-card rounded-xl p-4">
            <p className="text-[7px] font-black text-muted uppercase tracking-widest">{card.label}</p>
            <p className={`text-lg font-black ${card.color} mt-1`}>{card.val}</p>
            <p className="text-[7px] text-muted mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Detalle de materiales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Mixto Total', val: `${fmtQty(totMix)} m³`, sub: `${plan.mixtoOrders.length} pedidos · ${plan.mixtoOrders.reduce((s, o) => s + (o.trucks || 0), 0)} volq.`, color: 'text-brand-sage' },
          { label: 'Piedra Total', val: `${fmtQty(totPie)} m³`, sub: `${plan.piedraOrders.length} pedidos · ${plan.piedraOrders.reduce((s, o) => s + (o.trucks || 0), 0)} volq.`, color: 'text-white' },
          { label: 'Isoflow', val: `${fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.isoflow, 0))} L`, sub: 'total proyecto', color: 'text-blue-400' },
          { label: 'AIRTOC D', val: `${fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.airtoc, 0))} L`, sub: 'total proyecto', color: 'text-purple-400' },
        ].map((card, i) => (
          <div key={i} className="berlin-card rounded-xl p-4">
            <p className="text-[7px] font-black text-muted uppercase tracking-widest">{card.label}</p>
            <p className={`text-base font-black ${card.color} mt-1`}>{card.val}</p>
            <p className="text-[7px] text-muted mt-0.5">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Timeline resumen de pedidos */}
      <div className="berlin-card rounded-2xl p-4">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-3">Línea de Tiempo de Pedidos</p>
        <div className="space-y-1">
          {plan.allOrders.map(o => (
            <div key={o.id} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg border ${MAT_BG[o.material]}`}>
              <span className={`text-[8px] font-black w-16 ${MAT_COLORS[o.material]}`}>{o.id}</span>
              <span className="text-[8px] font-black text-white w-14">{fmtQty0(o.qty)} {o.unit}</span>
              <span className="text-[8px] text-muted w-20">{o.source || '—'}</span>
              <span className="text-[8px] font-black text-white">{fmtDateFull(o.expectedDelivery)}</span>
              <span className={`ml-auto text-[7px] font-black uppercase px-2 py-0.5 rounded border ${STATUS_STYLES[o.status]}`}>
                {o.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 2: LOG DIARIO
   ═══════════════════════════════════════════════════════════════════════════════ */
function LogDiarioTab({ plan }) {
  return (
    <div className="berlin-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <p className="text-[8px] font-black text-muted uppercase tracking-widest">
          Consumo Diario de Materiales
        </p>
        <p className="text-[7px] text-muted mt-0.5">
          Una fila por día hábil · Excavación, campana, vaciado y consumo de materiales
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[8px] whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/10">
              <TH className="sticky left-0 bg-[#0a0a0a] z-10">Fecha</TH>
              <TH className="text-center" tip="Caissons en excavación de fuste">Exc</TH>
              <TH className="text-center" tip="Caissons en campana + armado de acero">Camp</TH>
              <TH className="text-center" tip="Caissons en vaciado de ciclópeo">Vac</TH>
              <TH className="text-right text-brand-yellow" tip="Cemento para anillos: 2.5 blt por 1.4m excavado">Cem Anil</TH>
              <TH className="text-right text-brand-yellow" tip="Cemento para ciclópeo: 7.8 blt/m³ de mezcla">Cem Cicl</TH>
              <TH className="text-right text-brand-yellow" tip="Cemento total = anillos + ciclópeo">Cem Total</TH>
              <TH className="text-right text-brand-sage" tip="Mixto para anillos: 0.377 m³/ml × 1.4 m/día">Mix Anil</TH>
              <TH className="text-right text-brand-sage" tip="Mixto para ciclópeo: 1.02 m³/m³ mezcla">Mix Cicl</TH>
              <TH className="text-right text-brand-sage" tip="Mixto total = anillos + ciclópeo">Mix Total</TH>
              <TH className="text-right" tip="Piedra de mano para ciclópeo (30% vol / 0.70 factor)">Piedra</TH>
              <TH className="text-right text-brand-orange" tip="Peso de canasta de acero instalada">Acero</TH>
              <TH className="text-right" tip="Escombro generado: 1.4 m/día × 1.33 × 1.30">Escombro</TH>
              <TH className="text-right text-blue-400" tip="Isoflow 7800: 2.33 L/m³ mezcla">Isoflow</TH>
              <TH className="text-right text-purple-400" tip="AIRTOC D: 0.50 L/m³ mezcla">AIRTOC</TH>
              <TH className="text-right" tip="Agua: 175.5 L/m³ mezcla">Agua</TH>
            </tr>
          </thead>
          <tbody>
            {plan.dailyConsumption.map((d, i) => {
              const hasVac = d.vK.length > 0;
              const det = d.detail;
              return (
                <tr key={d.date} className={`border-b border-white/5 ${hasVac ? 'bg-brand-sage/5' : i % 2 ? 'bg-white/[0.01]' : ''}`}>
                  <TD className="font-black text-muted sticky left-0 bg-[#0a0a0a] z-10">{fmtDateFull(d.date)}</TD>
                  <Tip lines={det.exc.length ? det.exc.map(e => `K-${e.k} excavación`) : null} className="text-center text-white">{d.excK.length || ''}</Tip>
                  <Tip lines={buildAceroTip(det)} className="text-center text-brand-sage">{d.caK.length || ''}</Tip>
                  <Tip lines={buildVacTip(det)} className="text-center text-blue-400">{d.vK.length || ''}</Tip>
                  <Tip lines={det.exc.length ? det.exc.map(e => `K-${e.k}: ${fmtQty(e.cemBlt)} blt`) : null} className="text-right text-brand-yellow">{d.cemAnillos > 0 ? fmtQty(d.cemAnillos) : ''}</Tip>
                  <Tip lines={det.vaciado.length ? det.vaciado.map(v => `K-${v.k}: ${fmtQty(v.cemBlt)} blt`) : null} className="text-right text-brand-yellow">{d.cemCiclopeo > 0 ? fmtQty(d.cemCiclopeo) : ''}</Tip>
                  <Tip lines={buildCemTip(det)} className="text-right font-black text-brand-yellow">{d.cemTotal > 0 ? fmtQty(d.cemTotal) : ''}</Tip>
                  <Tip lines={det.exc.length ? det.exc.map(e => `K-${e.k}: ${fmtQty(e.mixtoM3)} m³`) : null} className="text-right text-brand-sage">{d.mixtoAnillos > 0 ? fmtQty(d.mixtoAnillos) : ''}</Tip>
                  <Tip lines={det.vaciado.length ? det.vaciado.map(v => `K-${v.k}: ${fmtQty(v.mixtoM3)} m³`) : null} className="text-right text-brand-sage">{d.mixtoCiclopeo > 0 ? fmtQty(d.mixtoCiclopeo) : ''}</Tip>
                  <Tip lines={buildMixTip(det)} className="text-right font-black text-brand-sage">{d.mixtoTotal > 0 ? fmtQty(d.mixtoTotal) : ''}</Tip>
                  <Tip lines={buildPiedraTip(det)} className="text-right text-white">{d.piedra > 0 ? fmtQty(d.piedra) : ''}</Tip>
                  <Tip lines={buildAceroTip(det)} className="text-right text-brand-orange">{d.aceroKg > 0 ? fmtQty0(d.aceroKg) : ''}</Tip>
                  <Tip lines={buildDebrisTip(det)} className="text-right text-muted">{d.debrisDay > 0 ? fmtQty(d.debrisDay) : ''}</Tip>
                  <Tip lines={det.vaciado.length ? det.vaciado.map(v => `K-${v.k}: ${fmtQty(v.isoflowL)} L`) : null} className="text-right text-blue-400">{d.isoflow > 0 ? fmtQty(d.isoflow) : ''}</Tip>
                  <Tip lines={det.vaciado.length ? det.vaciado.map(v => `K-${v.k}: ${fmtQty(v.airtocL, 2)} L`) : null} className="text-right text-purple-400">{d.airtoc > 0 ? fmtQty(d.airtoc, 2) : ''}</Tip>
                  <Tip lines={det.vaciado.length ? det.vaciado.map(v => `K-${v.k}: ${fmtQty0(v.aguaL)} L`) : null} className="text-right text-muted">{d.agua > 0 ? fmtQty0(d.agua) : ''}</Tip>
                </tr>
              );
            })}
          </tbody>
          {/* Totales */}
          <tfoot>
            <tr className="border-t-2 border-white/20 bg-white/[0.03]">
              <TD className="font-black text-white sticky left-0 bg-[#111] z-10">TOTAL</TD>
              <TD />
              <TD />
              <TD />
              <TD className="text-right font-black text-brand-yellow">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.cemAnillos, 0))}</TD>
              <TD className="text-right font-black text-brand-yellow">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.cemCiclopeo, 0))}</TD>
              <TD className="text-right font-black text-brand-yellow">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.cemTotal, 0))}</TD>
              <TD className="text-right font-black text-brand-sage">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.mixtoAnillos, 0))}</TD>
              <TD className="text-right font-black text-brand-sage">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.mixtoCiclopeo, 0))}</TD>
              <TD className="text-right font-black text-brand-sage">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.mixtoTotal, 0))}</TD>
              <TD className="text-right font-black text-white">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.piedra, 0))}</TD>
              <TD className="text-right font-black text-brand-orange">{fmtQty0(plan.dailyConsumption.reduce((s, d) => s + d.aceroKg, 0))}</TD>
              <TD className="text-right font-black text-muted">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.debrisDay, 0))}</TD>
              <TD className="text-right font-black text-blue-400">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.isoflow, 0))}</TD>
              <TD className="text-right font-black text-purple-400">{fmtQty(plan.dailyConsumption.reduce((s, d) => s + d.airtoc, 0), 2)}</TD>
              <TD className="text-right font-black text-muted">{fmtQty0(plan.dailyConsumption.reduce((s, d) => s + d.agua, 0))}</TD>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 3: PEDIDOS
   ═══════════════════════════════════════════════════════════════════════════════ */
function PedidosTab({ plan, orderOverrides, onActualDate, onStatus, editingId, setEditingId }) {
  const [filterMat, setFilterMat] = useState('todos');
  const materials = ['todos', 'Cemento', 'Acero', 'Mixto', 'Piedra'];

  const filtered = filterMat === 'todos'
    ? plan.allOrders
    : plan.allOrders.filter(o => o.material === filterMat);

  return (
    <div className="space-y-3">
      {/* Filtro de material */}
      <div className="flex gap-1 flex-wrap">
        {materials.map(m => (
          <button key={m} onClick={() => setFilterMat(m)}
            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition ${
              filterMat === m
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-muted hover:text-white border border-transparent'
            }`}>
            {m}
          </button>
        ))}
      </div>

      {/* Tabla de pedidos */}
      <div className="berlin-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10">
                <TH>ID</TH>
                <TH>Material</TH>
                <TH className="text-right">Cantidad</TH>
                <TH>Fuente</TH>
                <TH>Ventana</TH>
                <TH>Fecha Pedido</TH>
                <TH>Entrega Est.</TH>
                <TH>Entrega Real</TH>
                <TH>Estado</TH>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const ovr = orderOverrides[order.id] || {};
                const status = ovr.status || order.status;
                return (
                  <tr key={order.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <TD className="font-black text-muted">{order.id}</TD>
                    <TD className={`font-black ${MAT_COLORS[order.material]}`}>{order.material}</TD>
                    <TD className="text-right font-black text-white">{fmtQty0(order.qty)} {order.unit}</TD>
                    <TD className="text-muted">{order.source || '—'}</TD>
                    <TD className="text-muted">
                      {order.windowStart ? `${fmtDate(order.windowStart)}→${fmtDate(order.windowEnd)}` : '—'}
                    </TD>
                    <TD className="text-muted">{fmtDate(order.orderDate)}</TD>
                    <TD className="font-black text-white">{fmtDate(order.expectedDelivery)}</TD>
                    <TD>
                      {editingId === order.id ? (
                        <input
                          id={`del-${order.id}`}
                          name="actualDelivery"
                          type="date"
                          defaultValue={ovr.actualDelivery || ''}
                          onBlur={e => { onActualDate(order.id, e.target.value); setEditingId(null); }}
                          onKeyDown={e => e.key === 'Enter' && onActualDate(order.id, e.target.value)}
                          autoFocus
                          className="bg-white/5 border border-white/20 rounded px-1.5 py-0.5 text-[9px] text-white outline-none w-28"
                        />
                      ) : (
                        <button onClick={() => setEditingId(order.id)}
                          className="text-[9px] text-brand-sage hover:text-white transition">
                          {ovr.actualDelivery ? fmtDate(ovr.actualDelivery) : '+ fecha'}
                        </button>
                      )}
                    </TD>
                    <TD>
                      <select
                        id={`st-${order.id}`}
                        name="orderStatus"
                        value={status}
                        onChange={e => onStatus(order.id, e.target.value)}
                        className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-lg border cursor-pointer outline-none ${STATUS_STYLES[status]}`}>
                        <option value="sugerido">Sugerido</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="entregado">Entregado</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen por ventana de cemento */}
      {(filterMat === 'todos' || filterMat === 'Cemento') && plan.cementOrders.length > 0 && (
        <div className="berlin-card rounded-2xl p-4">
          <p className="text-[8px] font-black text-brand-yellow uppercase tracking-widest mb-3">
            Resumen por Ventana de Pedido (Cemento · 14 días)
          </p>
          <div className="space-y-2">
            {plan.cementOrders.map(o => {
              const dels = plan.cementDeliveries.filter(d => d.orderId === o.id);
              return (
                <div key={o.id} className="px-3 py-2 rounded-xl bg-brand-yellow/5 border border-brand-yellow/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-brand-yellow">{o.id}</span>
                      <span className="text-[8px] text-muted">
                        {fmtDate(o.windowStart)} → {fmtDate(o.windowEnd)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-white">{fmtQty0(o.qty)} blt</span>
                      <span className="text-[8px] text-muted">{o.source}</span>
                      <span className="text-[8px] font-black text-white">Entrega: {fmtDate(o.expectedDelivery)}</span>
                    </div>
                  </div>
                  {dels.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {dels.map(d => (
                        <span key={d.id} className="px-2 py-0.5 rounded bg-brand-yellow/10 text-brand-yellow text-[7px] font-black">
                          {d.id}: {d.qty} blt · {fmtDate(d.expectedDate)} · vence {fmtDate(d.expiry)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 4: ENTREGAS CEMENTO
   ═══════════════════════════════════════════════════════════════════════════════ */
function EntregasCementoTab({ plan }) {
  return (
    <div className="space-y-3">
      <div className="berlin-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[8px] font-black text-brand-yellow uppercase tracking-widest">
            Entregas de Cemento — Clusters de 6 días (vida útil)
          </p>
          <p className="text-[7px] text-muted mt-0.5">
            Cada entrega cubre máx 6 días de consumo. Se entrega 1 día hábil antes del primer uso.
            Cero desperdicio: se pide exactamente lo que se consume.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10">
                <TH>ID</TH>
                <TH>Pedido</TH>
                <TH className="text-right">Total Blt</TH>
                <TH className="text-right">Cementera</TH>
                <TH className="text-right">Coord.</TH>
                <TH>Entrega</TH>
                <TH>Vence</TH>
                <TH>Cubre</TH>
              </tr>
            </thead>
            <tbody>
              {plan.cementDeliveries.map((del, i) => {
                const isLast = i === plan.cementDeliveries.length - 1;
                return (
                  <tr key={del.id} className={`border-b border-white/5 hover:bg-white/[0.02] ${isLast ? '' : ''}`}>
                    <TD className="font-black text-brand-yellow">{del.id}</TD>
                    <TD className="text-muted">{del.orderId}</TD>
                    <TD className="text-right font-black text-white">{del.qty}</TD>
                    <TD className="text-right text-muted">{del.fromFactory || '—'}</TD>
                    <TD className="text-right text-muted">{del.fromCoord || '—'}</TD>
                    <TD className="font-black text-white">{fmtDateFull(del.expectedDate)}</TD>
                    <TD className="text-brand-red font-black">{fmtDate(del.expiry)}</TD>
                    <TD className="text-muted">{fmtDate(del.clusterStart)} → {fmtDate(del.clusterEnd)}</TD>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-white/20 bg-white/[0.03]">
                <TD className="font-black text-white" colSpan={2}>TOTAL</TD>
                <TD className="text-right font-black text-brand-yellow">
                  {plan.cementDeliveries.reduce((s, d) => s + d.qty, 0)}
                </TD>
                <TD className="text-right font-black text-muted">
                  {plan.cementDeliveries.reduce((s, d) => s + (d.fromFactory || 0), 0)}
                </TD>
                <TD className="text-right font-black text-muted">
                  {plan.cementDeliveries.reduce((s, d) => s + (d.fromCoord || 0), 0)}
                </TD>
                <TD colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 5: LOTES ACERO
   ═══════════════════════════════════════════════════════════════════════════════ */
function LotesAceroTab({ plan }) {
  return (
    <div className="space-y-3">
      {plan.steelOrders.length === 0 && (
        <p className="text-[9px] text-muted text-center py-10">No hay lotes de acero programados</p>
      )}
      {plan.steelOrders.map(order => (
        <div key={order.id} className="berlin-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-brand-orange">{order.id}</span>
              <span className="text-[9px] font-black text-white">
                {fmtQty0(order.qty)} kg — {order.count} canastas
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[8px] text-muted">
                Entrega: <span className="font-black text-white">{fmtDateFull(order.expectedDelivery)}</span>
              </span>
              <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded-lg border ${STATUS_STYLES[order.status]}`}>
                {order.status}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {order.caissons.map(k => (
              <span key={k} className="px-2 py-0.5 rounded bg-brand-orange/20 text-brand-orange text-[8px] font-black">
                K-{k}
              </span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[6px] font-black text-muted uppercase">Peso Total</p>
              <p className="text-[9px] font-black text-brand-orange">{fmtQty0(order.qty)} kg</p>
            </div>
            <div>
              <p className="text-[6px] font-black text-muted uppercase">Canastas</p>
              <p className="text-[9px] font-black text-white">{order.count}</p>
            </div>
            <div>
              <p className="text-[6px] font-black text-muted uppercase">Promedio/Canasta</p>
              <p className="text-[9px] font-black text-white">{fmtQty(order.qty / order.count)} kg</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-TAB 6: STOCK PROYECTADO
   ═══════════════════════════════════════════════════════════════════════════════ */
function StockTab({ plan }) {
  const [view, setView] = useState('completo');

  return (
    <div className="space-y-3">
      {/* Selector de vista */}
      <div className="flex gap-1">
        {[
          { key: 'completo', label: 'Completo' },
          { key: 'cemento',  label: 'Cemento' },
          { key: 'mixto',    label: 'Mixto + Piedra' },
          { key: 'escombro', label: 'Escombro' },
        ].map(v => (
          <button key={v.key} onClick={() => setView(v.key)}
            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-wide transition ${
              view === v.key
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-muted hover:text-white border border-transparent'
            }`}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="berlin-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10">
          <p className="text-[8px] font-black text-muted uppercase tracking-widest">
            Stock Proyectado Diario — Balance con Entradas y Salidas
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[8px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-white/10">
                <TH className="sticky left-0 bg-[#0a0a0a] z-10">Fecha</TH>
                <TH className="text-center">Exc</TH>
                <TH className="text-center">Vac</TH>

                {(view === 'completo' || view === 'cemento') && <>
                  <TH className="text-right text-brand-yellow">Cem Lleg</TH>
                  <TH className="text-right text-brand-yellow">Cem Cons</TH>
                  <TH className="text-right text-brand-red">Cem Venc</TH>
                  <TH className="text-right text-brand-yellow">Cem Stock</TH>
                  <TH className="text-right">Próx Vence</TH>
                </>}

                {(view === 'completo' || view === 'mixto') && <>
                  <TH className="text-right text-brand-sage">Mix Lleg</TH>
                  <TH className="text-right text-brand-sage">Mix Cons</TH>
                  <TH className="text-right text-brand-sage">Mix Stock</TH>
                  <TH className="text-right">Pie Lleg</TH>
                  <TH className="text-right">Pie Cons</TH>
                  <TH className="text-right">Pie Stock</TH>
                </>}

                {(view === 'completo' || view === 'escombro') && <>
                  <TH className="text-right">Escombro +</TH>
                  <TH className="text-right">Acum</TH>
                  <TH className="text-right">Viajes</TH>
                </>}
              </tr>
            </thead>
            <tbody>
              {plan.stockForecast.map((f, i) => {
                const hasCemAlert = f.cemDeficit > 0;
                const hasMixAlert = f.mixStock < 0;
                const hasPieAlert = f.pieStock < 0;
                const hasAlert = hasCemAlert || hasMixAlert || hasPieAlert;
                const hasCemArrival = f.cemArrived > 0;
                const det = f.consumption.detail;

                return (
                  <tr key={f.date} className={`border-b border-white/5 ${
                    hasAlert ? 'bg-brand-red/10' :
                    hasCemArrival ? 'bg-blue-500/5' :
                    i % 2 ? 'bg-white/[0.01]' : ''
                  }`}>
                    <TD className="font-black text-muted sticky left-0 bg-[#0a0a0a] z-10">{fmtDateFull(f.date)}</TD>
                    <Tip lines={det.exc.length ? det.exc.map(e => `K-${e.k} excavación`) : null} className="text-center text-white">
                      {f.consumption.excK.length || ''}
                    </Tip>
                    <Tip lines={buildVacTip(det)} className="text-center text-blue-400">
                      {f.consumption.vK.length || ''}
                    </Tip>

                    {(view === 'completo' || view === 'cemento') && <>
                      <TD className={`text-right ${hasCemArrival ? 'font-black text-blue-400' : 'text-muted'}`}>
                        {f.cemArrived > 0 ? `+${fmtQty0(f.cemArrived)}` : ''}
                      </TD>
                      <Tip lines={buildCemTip(det)} className="text-right text-brand-yellow">
                        {f.cemConsumed > 0 ? fmtQty(f.cemConsumed) : ''}
                      </Tip>
                      <TD className="text-right text-brand-red">
                        {f.cemExpired > 0 ? fmtQty(f.cemExpired) : ''}
                      </TD>
                      <TD className={`text-right font-black ${hasCemAlert ? 'text-brand-red' : 'text-brand-yellow'}`}>
                        {hasCemAlert ? `-${fmtQty(f.cemDeficit)}` : fmtQty(f.cemStock)}
                      </TD>
                      <TD className="text-right text-muted text-[7px]">{f.cemNextExpiry ? fmtDate(f.cemNextExpiry) : ''}</TD>
                    </>}

                    {(view === 'completo' || view === 'mixto') && <>
                      <TD className={`text-right ${f.mixArrived > 0 ? 'font-black text-blue-400' : 'text-muted'}`}>
                        {f.mixArrived > 0 ? `+${fmtQty(f.mixArrived)}` : ''}
                      </TD>
                      <Tip lines={buildMixTip(det)} className="text-right text-brand-sage">
                        {f.mixConsumed > 0 ? fmtQty(f.mixConsumed) : ''}
                      </Tip>
                      <TD className={`text-right font-black ${hasMixAlert ? 'text-brand-red' : 'text-brand-sage'}`}>
                        {fmtQty(f.mixStock)}
                      </TD>
                      <TD className={`text-right ${f.pieArrived > 0 ? 'font-black text-blue-400' : 'text-muted'}`}>
                        {f.pieArrived > 0 ? `+${fmtQty(f.pieArrived)}` : ''}
                      </TD>
                      <Tip lines={buildPiedraTip(det)} className="text-right text-white">
                        {f.pieConsumed > 0 ? fmtQty(f.pieConsumed) : ''}
                      </Tip>
                      <TD className={`text-right font-black ${hasPieAlert ? 'text-brand-red' : 'text-white'}`}>
                        {fmtQty(f.pieStock)}
                      </TD>
                    </>}

                    {(view === 'completo' || view === 'escombro') && <>
                      <Tip lines={buildDebrisTip(det)} className="text-right text-muted">
                        {f.debrisDay > 0 ? `+${fmtQty(f.debrisDay)}` : ''}
                      </Tip>
                      <TD className="text-right text-muted">{fmtQty(f.debrisAccum)}</TD>
                      <TD className="text-right text-muted">{f.debrisTrips > 0 ? f.debrisTrips : ''}</TD>
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════════ */

export default function InventarioModule({ processed, selDate, cuadrillas, incidencias, dailyLog, gantt: externalGantt, startDate: externalStart }) {
  const [subTab, setSubTab] = useState('resumen');
  const [orderOverrides, setOrderOverrides] = useState({});
  const [editingId, setEditingId] = useState(null);

  // Run own simulation if no external gantt provided
  const { runSim, result, loading } = useSimulation();
  const today = getToday();
  const startDate = externalStart || selDate || today;
  const prevSigRef = useRef('');

  useEffect(() => {
    if (externalGantt?.length) return; // use external data
    if (!processed?.length) return;
    const sig = JSON.stringify([processed.length, startDate, cuadrillas?.length]);
    if (sig === prevSigRef.current) return;
    prevSigRef.current = sig;

    const blockedIds = (incidencias || [])
      .filter(i => i.tipo === 'bloqueo_roca' && i.estado === 'abierta')
      .map(i => Number(i.caissonId))
      .filter(n => !isNaN(n));

    runSim(processed, startDate, cuadrillas || [], {
      today,
      monteCarlo: 0,
      incidencias: blockedIds,
    });
  }, [processed, startDate, cuadrillas, incidencias, externalGantt, runSim, today]);

  const gantt = externalGantt || result?.gantt;

  const plan = useMemo(() => {
    if (!gantt?.length || !startDate) return null;
    return buildProcurementPlan(gantt, startDate);
  }, [gantt, startDate]);

  if (loading) {
    return (
      <div className="p-10 text-center text-[9px] font-black text-muted uppercase">
        Calculando plan de inventario...
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="p-10 text-center text-[9px] font-black text-muted uppercase">
        Ejecuta la simulación para ver el plan de inventario
      </div>
    );
  }

  const SUB_TABS = [
    { key: 'resumen',   label: 'Resumen'          },
    { key: 'log',       label: 'Log Diario'       },
    { key: 'pedidos',   label: 'Pedidos'          },
    { key: 'entregas',  label: 'Entregas Cemento' },
    { key: 'acero',     label: 'Lotes Acero'      },
    { key: 'stock',     label: 'Stock Proyectado' },
  ];

  const handleActualDate = (id, date) => {
    setOrderOverrides(prev => ({ ...prev, [id]: { ...prev[id], actualDelivery: date } }));
    setEditingId(null);
  };

  const handleStatus = (id, status) => {
    setOrderOverrides(prev => ({ ...prev, [id]: { ...prev[id], status } }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="berlin-card rounded-3xl p-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-white leading-none">
          Inventario · Pedidos · Stock
        </h2>
        <p className="text-[9px] text-muted mt-1">
          Planificación de materiales basada en la simulación ·{' '}
          {plan.allOrders.length} pedidos · {plan.stockForecast.length} días proyectados
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SUB_TABS.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-wide transition shrink-0 ${
              subTab === t.key
                ? 'bg-white/10 text-white border border-white/20'
                : 'text-muted hover:text-white hover:bg-white/5 border border-transparent'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {subTab === 'resumen' && <ResumenTab plan={plan} />}
      {subTab === 'log' && <LogDiarioTab plan={plan} />}
      {subTab === 'pedidos' && (
        <PedidosTab
          plan={plan}
          orderOverrides={orderOverrides}
          onActualDate={handleActualDate}
          onStatus={handleStatus}
          editingId={editingId}
          setEditingId={setEditingId}
        />
      )}
      {subTab === 'entregas' && <EntregasCementoTab plan={plan} />}
      {subTab === 'acero' && <LotesAceroTab plan={plan} />}
      {subTab === 'stock' && <StockTab plan={plan} />}
    </div>
  );
}
