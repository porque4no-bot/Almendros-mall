import { useState } from 'react';
import { CAISSONS } from '../../data/constants';
import { useAuth } from '../../context/AuthContext';

const TIPOS_INCIDENCIA = [
  { key: "bloqueo_roca", label: "Bloqueo por Roca", color: "text-red-400", bg: "bg-red-500/20", border: "border-red-500/30", icon: "\u26D4" },
  { key: "filtracion", label: "Filtracion de Agua", color: "text-blue-400", bg: "bg-blue-500/20", border: "border-blue-500/30", icon: "\uD83D\uDCA7" },
  { key: "derrumbe", label: "Derrumbe", color: "text-orange-400", bg: "bg-orange-500/20", border: "border-orange-500/30", icon: "\u26A0\uFE0F" },
  { key: "equipo", label: "Falla de Equipo", color: "text-yellow-400", bg: "bg-yellow-500/20", border: "border-yellow-500/30", icon: "\uD83D\uDD27" },
  { key: "material", label: "Falta de Material", color: "text-purple-400", bg: "bg-purple-500/20", border: "border-purple-500/30", icon: "\uD83D\uDCE6" },
  { key: "seguridad", label: "Seguridad", color: "text-pink-400", bg: "bg-pink-500/20", border: "border-pink-500/30", icon: "\uD83D\uDEA8" },
  { key: "calidad", label: "Calidad", color: "text-cyan-400", bg: "bg-cyan-500/20", border: "border-cyan-500/30", icon: "\uD83D\uDD0D" },
  { key: "otro", label: "Otro", color: "text-white/60", bg: "bg-white/10", border: "border-white/20", icon: "\uD83D\uDCCB" },
];

export { TIPOS_INCIDENCIA };

const formatFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
};

function getTipo(key) {
  return TIPOS_INCIDENCIA.find(t => t.key === key) || TIPOS_INCIDENCIA[TIPOS_INCIDENCIA.length - 1];
}

export default function IncidenciasPanel({ incidencias, onCrear, onResolver, onClose, isViewer }) {
  const { user } = useAuth();
  const autorNombre = user?.displayName || user?.email || 'Usuario Desconocido';

  const [modo, setModo] = useState("lista");
  const [filtro, setFiltro] = useState("abiertas");
  const [selIncidencia, setSelIncidencia] = useState(null);

  // Form nueva
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [caissonId, setCaissonId] = useState("");
  const [tipo, setTipo] = useState("otro");
  const [imagenBase64, setImagenBase64] = useState("");

  // Resolver
  const [comentarioResolucion, setComentarioResolucion] = useState("");
  const [imagenResolucion, setImagenResolucion] = useState("");

  const resetForm = () => {
    setTitulo(""); setDescripcion(""); setCaissonId(""); setTipo("otro"); setImagenBase64("");
    setModo("lista");
  };

  const handleCrear = () => {
    if (!titulo.trim() || !caissonId) return;
    onCrear({
      id: Date.now().toString(),
      caissonId: parseInt(caissonId),
      tipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim(),
      imagenBase64,
      fechaCreacion: new Date().toISOString(),
      estado: "abierta",
      creadaPor: autorNombre,
      comentarioResolucion: "",
      fechaResolucion: null,
    });
    resetForm();
  };

  const handleResolver = () => {
    if (!selIncidencia) return;
    onResolver(selIncidencia.id, comentarioResolucion.trim(), imagenResolucion, autorNombre);
    setComentarioResolucion("");
    setImagenResolucion("");
    setSelIncidencia(null);
    setModo("lista");
  };

  const handleImagenResolucion = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImagenResolucion(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImagen = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImagenBase64(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const filtradas = incidencias.filter(inc => {
    if (filtro === "abiertas") return inc.estado === "abierta";
    if (filtro === "resueltas") return inc.estado === "resuelta";
    return true;
  }).sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

  // =================== DETALLE ===================
  if (modo === "detalle" && selIncidencia) {
    const tipoInfo = getTipo(selIncidencia.tipo);
    return (
      <div className="berlin-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => { setSelIncidencia(null); setModo("lista"); }} className="text-[10px] font-black uppercase text-muted hover:text-white transition">
            &larr; Volver
          </button>
          <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${selIncidencia.estado === "abierta" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-brand-sage/20 text-brand-sage border border-brand-sage/30"}`}>
            {selIncidencia.estado}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${tipoInfo.bg} ${tipoInfo.color} ${tipoInfo.border} border`}>
            {tipoInfo.icon} {tipoInfo.label}
          </span>
          <span className="text-[9px] font-black text-brand-red">K-{selIncidencia.caissonId}</span>
        </div>

        <h3 className="text-white font-black text-sm mb-1">{selIncidencia.titulo}</h3>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-[8px] font-black uppercase text-muted tracking-widest mb-1">Fecha de creacion</p>
            <p className="text-xs text-white/80">{formatFecha(selIncidencia.fechaCreacion)}</p>
            {selIncidencia.creadaPor && (
              <p className="text-[8px] text-white/40 mt-0.5">Reportado por: <span className="text-white/60 font-black">{selIncidencia.creadaPor}</span></p>
            )}
          </div>
          {selIncidencia.descripcion && (
            <div>
              <p className="text-[8px] font-black uppercase text-muted tracking-widest mb-1">Descripcion</p>
              <p className="text-xs text-white/70 whitespace-pre-wrap">{selIncidencia.descripcion}</p>
            </div>
          )}
          {selIncidencia.imagenBase64 && (
            <div>
              <p className="text-[8px] font-black uppercase text-muted tracking-widest mb-1">Foto</p>
              <img src={selIncidencia.imagenBase64} alt="Incidencia" className="w-full rounded-xl border border-white/10 max-h-64 object-cover" />
            </div>
          )}

          {selIncidencia.estado === "resuelta" && (
            <>
              <div className="border-t border-white/10 pt-3">
                <p className="text-[8px] font-black uppercase text-brand-sage tracking-widest mb-1">Fecha de resolucion</p>
                <p className="text-xs text-white/80">{formatFecha(selIncidencia.fechaResolucion)}</p>
                {selIncidencia.resueltaPor && (
                  <p className="text-[8px] text-brand-sage/60 mt-0.5">Solucionado por: <span className="text-brand-sage font-black">{selIncidencia.resueltaPor}</span></p>
                )}
              </div>
              {selIncidencia.comentarioResolucion && (
                <div>
                  <p className="text-[8px] font-black uppercase text-brand-sage tracking-widest mb-1">Solucion</p>
                  <p className="text-xs text-white/70 whitespace-pre-wrap">{selIncidencia.comentarioResolucion}</p>
                </div>
              )}
              {selIncidencia.imagenResolucion && (
                <div>
                  <p className="text-[8px] font-black uppercase text-brand-sage tracking-widest mb-1">Foto de resolucion</p>
                  <img src={selIncidencia.imagenResolucion} alt="Resolucion" className="w-full rounded-xl border border-brand-sage/30 max-h-64 object-cover" />
                </div>
              )}
            </>
          )}

          {selIncidencia.estado === "abierta" && !isViewer && (
            <div className="border-t border-white/10 pt-4 mt-4">
              <p className="text-[8px] font-black uppercase text-brand-sage tracking-widest mb-2">Resolver incidencia</p>
              <textarea
                id="inc-resolucion"
                name="resolucion"
                value={comentarioResolucion}
                onChange={(e) => setComentarioResolucion(e.target.value)}
                placeholder="Describe como se soluciono..."
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand-sage/50 resize-none"
              />
              <div className="mt-2">
                {imagenResolucion ? (
                  <div className="relative">
                    <img src={imagenResolucion} alt="Preview" className="w-full rounded-xl border border-brand-sage/30 max-h-40 object-cover" />
                    <button onClick={() => setImagenResolucion("")} className="absolute top-1 right-1 bg-black/70 text-white w-5 h-5 rounded-full text-[9px] hover:bg-red-600">&times;</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-14 bg-white/5 border border-dashed border-brand-sage/30 rounded-xl cursor-pointer hover:border-brand-sage/50 transition">
                    <span className="text-[9px] text-brand-sage/60">{'\uD83D\uDCF7'} Foto de la solucion (opcional)</span>
                    <input type="file" accept="image/*" onChange={handleImagenResolucion} className="hidden" />
                  </label>
                )}
              </div>
              <button
                onClick={handleResolver}
                className="w-full mt-3 bg-brand-sage/20 border border-brand-sage/40 text-brand-sage px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition hover:bg-brand-sage/30 active:scale-95"
              >
                Marcar como Resuelta
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =================== NUEVA ===================
  if (modo === "nueva") {
    return (
      <div className="berlin-card rounded-3xl p-6">
        <div className="flex items-center justify-between mb-6">
          <button onClick={resetForm} className="text-[10px] font-black uppercase text-muted hover:text-white transition">&larr; Cancelar</button>
          <h3 className="text-[10px] font-black uppercase tracking-widest text-white">Nueva Incidencia</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[8px] font-black uppercase text-muted tracking-widest block mb-1">Tipo *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TIPOS_INCIDENCIA.map(t => (
                <button key={t.key} onClick={() => setTipo(t.key)}
                  className={`px-2 py-2 rounded-lg text-[8px] font-black uppercase border transition text-left
                    ${tipo === t.key ? `${t.bg} ${t.color} ${t.border}` : 'bg-white/5 border-white/10 text-muted hover:bg-white/10'}`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="inc-caisson" className="text-[8px] font-black uppercase text-muted tracking-widest block mb-1">Caisson *</label>
            <select id="inc-caisson" name="caissonId" value={caissonId} onChange={(e) => setCaissonId(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-red/50">
              <option value="" className="bg-brand-black">Seleccionar caisson...</option>
              {CAISSONS.map(c => (<option key={c.k} value={c.k} className="bg-brand-black">K-{c.k}</option>))}
            </select>
          </div>
          <div>
            <label htmlFor="inc-titulo" className="text-[8px] font-black uppercase text-muted tracking-widest block mb-1">Titulo *</label>
            <input id="inc-titulo" name="titulo" type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Filtracion de agua en K-7"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand-red/50" />
          </div>
          <div>
            <label htmlFor="inc-desc" className="text-[8px] font-black uppercase text-muted tracking-widest block mb-1">Descripcion</label>
            <textarea id="inc-desc" name="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalla el problema..." rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-brand-red/50 resize-none" />
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-muted tracking-widest block mb-1">Foto (opcional)</label>
            {imagenBase64 ? (
              <div className="relative">
                <img src={imagenBase64} alt="Preview" className="w-full rounded-xl border border-white/10 max-h-48 object-cover" />
                <button onClick={() => setImagenBase64("")} className="absolute top-2 right-2 bg-black/70 text-white w-6 h-6 rounded-full text-xs hover:bg-red-600 transition">&times;</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-20 bg-white/5 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:border-white/20 transition">
                <span className="text-xl mb-0.5 opacity-40">{'\uD83D\uDCF7'}</span>
                <span className="text-[9px] text-muted">Click para agregar foto</span>
                <input type="file" accept="image/*" onChange={handleImagen} className="hidden" />
              </label>
            )}
          </div>
          <button onClick={handleCrear} disabled={!titulo.trim() || !caissonId}
            className={`w-full px-4 py-3 rounded-xl text-[10px] font-black uppercase transition active:scale-95
              ${titulo.trim() && caissonId ? 'bg-brand-red text-white hover:bg-red-700 shadow-lg shadow-brand-red/20' : 'bg-white/5 text-muted cursor-not-allowed'}`}>
            Crear Incidencia
          </button>
        </div>
      </div>
    );
  }

  // =================== LISTA GLOBAL ===================
  return (
    <div className="berlin-card rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted">Incidencias</h3>
          <button onClick={onClose} className="text-[9px] text-muted hover:text-white transition">&times; Cerrar</button>
        </div>
        {!isViewer && (
          <button onClick={() => setModo("nueva")}
            className="bg-brand-red px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-white hover:bg-red-700 transition active:scale-95">
            + Nueva
          </button>
        )}
      </div>

      <div className="flex bg-black rounded-lg p-0.5 border border-white/10 text-[8px] font-black uppercase mb-4">
        {[
          { key: "abiertas", label: `Abiertas (${incidencias.filter(i => i.estado === "abierta").length})` },
          { key: "resueltas", label: `Resueltas (${incidencias.filter(i => i.estado === "resuelta").length})` },
          { key: "todas", label: `Todas (${incidencias.length})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`flex-1 px-2 py-1.5 rounded-md transition ${filtro === f.key ? 'bg-brand-red text-white' : 'text-muted hover:text-white'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto sthin">
        {filtradas.length === 0 ? (
          <p className="text-center text-[10px] text-muted py-8">No hay incidencias {filtro !== "todas" ? filtro : ""}</p>
        ) : filtradas.map(inc => {
          const tipoInfo = getTipo(inc.tipo);
          return (
            <button key={inc.id} onClick={() => { setSelIncidencia(inc); setModo("detalle"); }}
              className="w-full text-left bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/10 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${inc.estado === "abierta" ? "bg-red-500" : "bg-brand-sage"}`}></span>
                    <span className="text-xs font-black text-white truncate">{inc.titulo}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[8px] text-muted flex-wrap">
                    <span className="text-brand-red font-black">K-{inc.caissonId}</span>
                    <span className={`${tipoInfo.color} font-black`}>{tipoInfo.icon} {tipoInfo.label}</span>
                    <span>{formatFecha(inc.fechaCreacion)}</span>
                    {inc.creadaPor && <span className="text-white/40">{inc.creadaPor}</span>}
                  </div>
                  {inc.estado === "resuelta" && inc.resueltaPor && (
                    <p className="text-[7px] text-brand-sage/60 mt-0.5">Resuelto por: <span className="font-black text-brand-sage">{inc.resueltaPor}</span></p>
                  )}
                </div>
                {inc.imagenBase64 && (
                  <img src={inc.imagenBase64} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-white/10" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
