/**
 * CuadrillasManager.jsx
 *
 * Modal de gestión de cuadrillas (parejas de obra).
 * Accesible para admin y editor. Los viewers no pueden acceder.
 *
 * Props:
 *   cuadrillas   — array de objetos { id, nombre, especialidad, activa }
 *   onSave(arr)  — callback para persistir el nuevo array
 *   onClose()    — cierra el modal
 *   role         — 'admin' | 'editor' | 'viewer'
 */
import { useState } from 'react';

/* ─── Especialidades disponibles ──────────────────────────────────────────── */
const ESPECIALIDADES = ['Excavación', 'Armado', 'Vaciado', 'General'];

const ESP_DOT = {
  'Excavación': '#FBC202',   // brand-yellow
  'Armado':     '#F68000',   // brand-orange
  'Vaciado':    '#80AF96',   // brand-sage
  'General':    'rgba(255,255,255,0.3)',
};

/* ─── Generador de ID simple (sin dependencia uuid) ──────────────────────── */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function CuadrillasManager({ cuadrillas, onSave, onClose, role }) {
  const [nombre,       setNombre]       = useState('');
  const [especialidad, setEspecialidad] = useState('Excavación');

  const canEdit = role === 'admin' || role === 'editor';

  /* ── Agregar nueva cuadrilla ── */
  const handleAdd = () => {
    const trim = nombre.trim();
    if (!trim) return;
    const nueva = { id: genId(), nombre: trim, especialidad, activa: true };
    onSave([...cuadrillas, nueva]);
    setNombre('');
    setEspecialidad('Excavación');
  };

  /* ── Activar / Desactivar ── */
  const handleToggle = (id) => {
    onSave(cuadrillas.map(q => q.id === id ? { ...q, activa: !q.activa } : q));
  };

  /* ── Eliminar ── */
  const handleDelete = (id) => {
    if (!confirm('¿Eliminar esta cuadrilla?\nLos caissons que la tenían asignada quedarán sin cuadrilla.')) return;
    onSave(cuadrillas.filter(q => q.id !== id));
  };

  /* ── Agrupar por especialidad (solo grupos no vacíos) ── */
  const grouped = ESPECIALIDADES
    .map(esp => ({ esp, items: cuadrillas.filter(q => q.especialidad === esp) }))
    .filter(g => g.items.length > 0);

  const excavCount = cuadrillas.filter(q => q.activa && q.especialidad === 'Excavación').length;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel */}
      <div
        className="w-full max-w-md max-h-[90vh] flex flex-col rounded-3xl overflow-hidden"
        style={{ background: 'rgba(11,11,11,0.98)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 32px 64px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Cabecera ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">Cuadrillas</h2>
            <p className="text-[8px] font-black uppercase tracking-wider text-muted mt-0.5">
              Gestión de equipos de obra
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 text-muted hover:text-white flex items-center justify-center text-lg transition"
          >
            &times;
          </button>
        </div>

        {/* ── Cuerpo scrollable ── */}
        <div className="flex-1 overflow-y-auto sthin p-5 space-y-5">

          {/* ── Formulario nuevo ── */}
          {canEdit && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-brand-yellow">
                ＋ Nueva cuadrilla
              </p>

              <input
                id="cq-nombre"
                name="nombre"
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder="Ej: Pareja 1 · Carlos y Miguel"
                maxLength={60}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-white/25 focus:outline-none focus:border-brand-yellow/50 transition"
              />

              <div className="flex gap-2">
                {/* Selector de especialidad */}
                <div className="relative flex-1">
                  <select
                    id="cq-especialidad"
                    name="especialidad"
                    value={especialidad}
                    onChange={e => setEspecialidad(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl pl-3 pr-7 py-2.5 text-[10px] font-black text-white focus:outline-none focus:border-brand-yellow/50 transition appearance-none cursor-pointer"
                  >
                    {ESPECIALIDADES.map(esp => (
                      <option key={esp} value={esp}>{esp}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted text-[8px]">▼</span>
                </div>

                {/* Botón agregar */}
                <button
                  onClick={handleAdd}
                  disabled={!nombre.trim()}
                  className={`px-5 rounded-xl text-[10px] font-black uppercase tracking-wide transition active:scale-95
                    ${nombre.trim()
                      ? 'bg-brand-red text-white hover:bg-red-700 shadow-lg shadow-brand-red/20'
                      : 'bg-white/5 text-muted cursor-not-allowed'
                    }`}
                >
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* ── Lista de cuadrillas ── */}
          {cuadrillas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 opacity-40 space-y-2">
              <span className="text-4xl">👷</span>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted text-center">
                Sin cuadrillas registradas
              </p>
              <p className="text-[8px] text-muted/60 text-center">
                Agrega tu primer equipo con el formulario de arriba
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ esp, items }) => (
                <div key={esp}>
                  {/* Separador de sección */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ESP_DOT[esp] }} />
                    <p className="text-[7px] font-black uppercase tracking-widest text-muted/60">{esp}</p>
                    <div className="flex-1 h-px bg-white/5" />
                    <p className="text-[7px] text-muted/40">{items.filter(q => q.activa).length}/{items.length} activas</p>
                  </div>

                  <div className="space-y-2">
                    {items.map(q => (
                      <div
                        key={q.id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition
                          ${q.activa ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5 opacity-50'}`}
                      >
                        {/* Indicador de especialidad */}
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 transition"
                          style={{ background: q.activa ? ESP_DOT[q.especialidad] : 'rgba(255,255,255,0.1)' }}
                        />

                        {/* Nombre */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-white truncate">{q.nombre}</p>
                          <p className="text-[7px] text-muted uppercase tracking-wide">{q.especialidad}</p>
                        </div>

                        {/* Acciones (solo admin/editor) */}
                        {canEdit && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleToggle(q.id)}
                              title={q.activa ? 'Desactivar cuadrilla' : 'Activar cuadrilla'}
                              className={`px-2.5 py-1 rounded-lg text-[7px] font-black uppercase tracking-wide transition
                                ${q.activa
                                  ? 'bg-brand-sage/15 text-brand-sage border border-brand-sage/30 hover:bg-brand-sage/25'
                                  : 'bg-white/5 text-muted border border-white/10 hover:bg-white/10'
                                }`}
                            >
                              {q.activa ? 'Activa' : 'Inactiva'}
                            </button>
                            <button
                              onClick={() => handleDelete(q.id)}
                              title="Eliminar cuadrilla"
                              className="w-7 h-7 rounded-lg bg-red-900/30 text-red-400/80 border border-red-800/30 hover:bg-red-900/60 hover:text-red-300 flex items-center justify-center text-sm font-black transition"
                            >
                              &times;
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Pie informativo ── */}
        <div className="px-5 py-3 border-t border-white/5 shrink-0">
          <p className="text-[7px] text-muted/50 font-black uppercase tracking-widest text-center">
            {excavCount} cuadrilla{excavCount !== 1 ? 's' : ''} de excavación activa{excavCount !== 1 ? 's' : ''}
            {' '}· usada{excavCount !== 1 ? 's' : ''} en simulación
          </p>
        </div>

      </div>
    </div>
  );
}
