import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../../config/firebase';
import CaissonDraw from '../ui/CaissonDraw';
import { defEntry, findC } from '../../utils/caissonUtils';
import { TIPOS_INCIDENCIA } from './IncidenciasPanel';
import { useAuth } from '../../context/AuthContext';

function getTipo(key) {
  return TIPOS_INCIDENCIA.find(t => t.key === key) || TIPOS_INCIDENCIA[TIPOS_INCIDENCIA.length - 1];
}

const formatFecha = (iso) => {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
};

const UNLOCK_PASSWORD = "ppleapok8749";

export default function CaissonDetailPanel({ selData, selK, dailyLog, selDate, handleUpdate, handleRemateCheck, incidencias, onCrearIncidencia, onResolverIncidencia, isLastDate, isViewer, cuadrillas = [], unsaved = false, onSave }) {
  const { user } = useAuth();
  const autorNombre = user?.displayName || user?.email || 'Usuario Desconocido';

  const [incMode, setIncMode] = useState(null); // null | "nueva" | incidenciaId
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tipo, setTipo] = useState("otro");
  const [imagenBase64, setImagenBase64] = useState("");
  const [comentarioRes, setComentarioRes] = useState("");
  const [imagenRes, setImagenRes] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  if (!selData) {
    return (
      <div className="berlin-card rounded-3xl p-6 sticky top-24 max-h-[88vh] overflow-y-auto sthin">
        <div className="py-20 text-center flex flex-col items-center opacity-30">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-2xl">{'\uD83C\uDFD7\uFE0F'}</div>
          <p className="text-[9px] font-black uppercase tracking-widest leading-loose">Selecciona unidad<br/>en el plano</p>
        </div>
      </div>
    );
  }

  const selEntry = (dailyLog[selDate] && dailyLog[selDate][selData.k]) ? dailyLog[selDate][selData.k] : defEntry(findC(selData.k));
  const obs = selEntry.observaciones || "";
  const imgB64 = selEntry.imagenBase64 || "";
  const barras = selEntry.barrasColocadas || 0;
  const vueltas = selEntry.vueltasChipa || 0;
  const remChecks = selEntry.remateChecks || { nivelacion:false, plomada:false, recubrimiento:false, superficie:false, curado:false };
  const remChecksCount = Object.values(remChecks).filter(Boolean).length;
  const remChecksPct = Math.round((remChecksCount / 5) * 100);
  const LONG_CHIPA = 35 * Math.PI * 0.85;
  const PESO_CHIPA = LONG_CHIPA * 0.994;
  const PESO_LONG  = 12 * 6 * 3.973;
  const PESO_TOTAL = PESO_CHIPA + PESO_LONG;

  // Permisos de edicion — viewer nunca puede editar
  const isPastDay = !isLastDate;
  const canEdit = !isViewer && (!isPastDay || unlocked);
  const excDone = selData.excD; // excavacion >= pTR o manual
  const canEditExc = canEdit && (!excDone || unlocked);
  const canEditArmado = canEdit;
  const canEditRemate = canEdit && excDone && selData.armado;
  const canEditVaciado = canEdit && excDone;

  // Fase activa para UI
  const currentPhase = !selData.preop ? "preop"
    : !excDone ? "excavacion"
    : !selData.armado ? "armado"
    : selData.vacP < 100 ? "vaciado"
    : !selData.remate ? "remate"
    : "completado";

  const tryUnlock = () => {
    const pass = prompt("Ingrese la contrasena para editar registros anteriores:");
    if (pass === UNLOCK_PASSWORD) {
      setUnlocked(true);
    } else if (pass !== null) {
      alert("Contrasena incorrecta");
    }
  };

  // Incidencias de este caisson
  const caissonInc = (incidencias || []).filter(i => i.caissonId === selData.k);
  const abiertas = caissonInc.filter(i => i.estado === "abierta");
  const resueltas = caissonInc.filter(i => i.estado === "resuelta");
  const hasBloqueoRoca = abiertas.some(i => i.tipo === "bloqueo_roca");

  const resetIncForm = () => {
    setTitulo(""); setDescripcion(""); setTipo("otro"); setImagenBase64("");
    setIncMode(null);
  };

  const handleCrear = () => {
    if (!titulo.trim()) return;
    onCrearIncidencia({
      id: Date.now().toString(),
      caissonId: selData.k,
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
    resetIncForm();
  };

  const handleResolver = (id) => {
    onResolverIncidencia(id, comentarioRes.trim(), imagenRes, autorNombre);
    setComentarioRes("");
    setImagenRes("");
    setIncMode(null);
  };

  const handleImagenRes = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setImagenRes(ev.target.result);
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

  // Si estamos resolviendo una incidencia
  const resolving = incMode && incMode !== "nueva" ? caissonInc.find(i => i.id === incMode) : null;

  return (
    <div className="berlin-card rounded-3xl p-6 sticky top-24 max-h-[88vh] overflow-y-auto sthin">
      <div className="space-y-6">
        <div className="border-b border-white/10 pb-4">
          <span className="text-[8px] font-black text-brand-red uppercase tracking-widest block mb-1">Unidad Seleccionada</span>
          <div className="flex items-center gap-2">
            <h2 className="text-4xl font-black tracking-tighter text-white">{"K-"+selData.k}</h2>
            {hasBloqueoRoca && (
              <span className="bg-brand-red text-white text-[8px] font-black px-2 py-1 rounded-lg uppercase tracking-widest animate-pulse">
                {'\u26D4'} ROCA
              </span>
            )}
            {abiertas.length > 0 && (
              <span className="bg-red-500/20 text-red-400 text-[8px] font-black px-2 py-1 rounded-lg border border-red-500/30">
                {abiertas.length} incid.
              </span>
            )}
          </div>
          <div className="inline-block mt-2 bg-white/5 px-2 py-1 rounded text-[9px] font-black uppercase text-secondary border border-white/10">
            {selData.ey+"-"+selData.ex}
          </div>
          {isPastDay && !unlocked && (
            <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center justify-between">
              <span className="text-[9px] font-black text-yellow-400 uppercase">{'\uD83D\uDD12'} {isViewer ? 'Solo lectura' : 'Registro bloqueado'}</span>
              {!isViewer && (
                <button onClick={tryUnlock} className="text-[8px] font-black uppercase text-yellow-400 bg-yellow-500/20 px-2 py-1 rounded-lg hover:bg-yellow-500/30 transition">Desbloquear</button>
              )}
            </div>
          )}
          {isPastDay && unlocked && (
            <div className="mt-3 bg-brand-sage/10 border border-brand-sage/30 rounded-xl p-2">
              <span className="text-[8px] font-black text-brand-sage uppercase">{'\uD83D\uDD13'} Registro desbloqueado</span>
            </div>
          )}
          {isViewer && !isPastDay && (
            <div className="mt-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
              <span className="text-[9px] font-black text-yellow-400 uppercase">{'\uD83D\uDD12'} Solo lectura</span>
            </div>
          )}
          {canEdit && unsaved && (
            <div className="mt-3 bg-brand-red/15 border border-brand-red/40 rounded-xl p-3 flex items-center justify-between gap-2">
              <span className="text-[9px] font-black text-brand-red uppercase">⚠ Cambios sin guardar</span>
              <button
                onClick={onSave}
                className="text-[8px] font-black uppercase text-white bg-brand-red px-3 py-1.5 rounded-lg hover:bg-brand-red/80 transition shrink-0"
              >
                Guardar
              </button>
            </div>
          )}
        </div>

        {/* ========== CUADRILLA ASIGNADA ========== */}
        {cuadrillas.length > 0 && (
          <div>
            <label htmlFor="cdp-cuadrilla" className="text-[7px] font-black text-muted uppercase tracking-widest block mb-1.5">
              Cuadrilla Asignada
            </label>
            <div className="relative">
              <select
                id="cdp-cuadrilla"
                name="cuadrillaId"
                value={selEntry.cuadrillaId || ''}
                onChange={e => {
                  if (canEdit) handleUpdate(selData.k, 'cuadrillaId', e.target.value || null);
                }}
                disabled={!canEdit}
                className={`w-full bg-black/40 border rounded-xl pl-3 pr-8 py-2.5 text-[10px] font-black text-white focus:outline-none transition appearance-none
                  ${!canEdit
                    ? 'border-white/5 opacity-50 cursor-not-allowed'
                    : selEntry.cuadrillaId
                      ? 'border-brand-yellow/40 hover:border-brand-yellow/60 cursor-pointer focus:border-brand-yellow/70'
                      : 'border-white/10 hover:border-white/20 cursor-pointer focus:border-brand-yellow/50'
                  }`}
              >
                <option value="">— Sin asignar —</option>
                {cuadrillas.filter(q => q.activa).map(q => (
                  <option key={q.id} value={q.id}>{q.nombre}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[8px]">▼</span>
            </div>
            {selEntry.cuadrillaId && (() => {
              const cq = cuadrillas.find(q => q.id === selEntry.cuadrillaId);
              return cq ? (
                <p className="text-[7px] font-black text-brand-yellow/70 uppercase tracking-wide mt-1.5">
                  {'\uD83D\uDC77'} {cq.especialidad}
                </p>
              ) : null;
            })()}
          </div>
        )}

        {/* ========== INCIDENCIAS DEL CAISSON ========== */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[8px] font-black text-brand-orange uppercase tracking-widest">Incidencias ({abiertas.length} abiertas)</p>
            {!isViewer && (
              <button onClick={() => setIncMode("nueva")}
                className="text-[8px] font-black uppercase text-brand-red hover:text-red-400 transition">+ Nueva</button>
            )}
          </div>

          {/* Form nueva incidencia inline */}
          {incMode === "nueva" && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 mb-3 space-y-3">
              <div className="grid grid-cols-2 gap-1">
                {TIPOS_INCIDENCIA.map(t => (
                  <button key={t.key} onClick={() => setTipo(t.key)}
                    className={`px-1.5 py-1.5 rounded-lg text-[7px] font-black uppercase border transition
                      ${tipo === t.key ? `${t.bg} ${t.color} ${t.border}` : 'bg-white/5 border-white/10 text-muted hover:bg-white/10'}`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <input id="cdp-inc-titulo" name="titulo" type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Titulo de la incidencia..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/30 focus:outline-none" />
              <textarea id="cdp-inc-desc" name="descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripcion..." rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/30 focus:outline-none resize-none" />
              <div>
                {imagenBase64 ? (
                  <div className="relative">
                    <img src={imagenBase64} alt="" className="w-full rounded-lg border border-white/10 max-h-32 object-cover" />
                    <button onClick={() => setImagenBase64("")} className="absolute top-1 right-1 bg-black/70 text-white w-5 h-5 rounded-full text-[9px] hover:bg-red-600">&times;</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-14 bg-white/5 border border-dashed border-white/10 rounded-lg cursor-pointer hover:border-white/20 transition">
                    <span className="text-[9px] text-muted">{'\uD83D\uDCF7'} Agregar foto</span>
                    <input type="file" accept="image/*" onChange={handleImagen} className="hidden" />
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={resetIncForm} className="flex-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase text-muted bg-white/5 hover:bg-white/10 transition">Cancelar</button>
                <button onClick={handleCrear} disabled={!titulo.trim()}
                  className={`flex-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase transition
                    ${titulo.trim() ? 'bg-brand-red text-white hover:bg-red-700' : 'bg-white/5 text-muted cursor-not-allowed'}`}>Crear</button>
              </div>
            </div>
          )}

          {/* Resolviendo incidencia */}
          {resolving && (
            <div className="bg-white/5 border border-brand-sage/30 rounded-xl p-3 mb-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className={`${getTipo(resolving.tipo).color} text-[8px] font-black`}>{getTipo(resolving.tipo).icon}</span>
                <span className="text-xs font-black text-white">{resolving.titulo}</span>
              </div>
              <p className="text-[8px] text-muted">Creada: {formatFecha(resolving.fechaCreacion)}{resolving.creadaPor ? ` · por ${resolving.creadaPor}` : ''}</p>
              {resolving.imagenBase64 && (
                <img src={resolving.imagenBase64} alt="" className="w-full rounded-lg border border-white/10 max-h-32 object-cover" />
              )}
              {resolving.descripcion && <p className="text-[9px] text-white/60">{resolving.descripcion}</p>}
              <textarea value={comentarioRes} onChange={(e) => setComentarioRes(e.target.value)}
                placeholder="Describe la solucion aplicada..."
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/30 focus:outline-none resize-none" />
              <div>
                {imagenRes ? (
                  <div className="relative">
                    <img src={imagenRes} alt="" className="w-full rounded-lg border border-brand-sage/30 max-h-28 object-cover" />
                    <button onClick={() => setImagenRes("")} className="absolute top-1 right-1 bg-black/70 text-white w-5 h-5 rounded-full text-[9px] hover:bg-red-600">&times;</button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full h-10 bg-white/5 border border-dashed border-brand-sage/30 rounded-lg cursor-pointer hover:border-brand-sage/50 transition">
                    <span className="text-[8px] text-brand-sage/60">{'\uD83D\uDCF7'} Foto solucion</span>
                    <input type="file" accept="image/*" onChange={handleImagenRes} className="hidden" />
                  </label>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setIncMode(null); setComentarioRes(""); setImagenRes(""); }} className="flex-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase text-muted bg-white/5 hover:bg-white/10 transition">Cancelar</button>
                <button onClick={() => handleResolver(resolving.id)}
                  className="flex-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase bg-brand-sage/20 text-brand-sage border border-brand-sage/40 hover:bg-brand-sage/30 transition">Resolver</button>
              </div>
            </div>
          )}

          {/* Lista de incidencias abiertas */}
          {abiertas.length > 0 && !resolving && incMode !== "nueva" && (
            <div className="space-y-1.5 mb-2">
              {abiertas.map(inc => {
                const t = getTipo(inc.tipo);
                return (
                  <div key={inc.id} className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${t.border} ${t.bg} transition`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px]">{t.icon}</span>
                        <span className="text-[9px] font-black text-white truncate">{inc.titulo}</span>
                      </div>
                      <span className="text-[7px] text-muted">{formatFecha(inc.fechaCreacion)}</span>
                      {inc.creadaPor && (
                        <span className="text-[7px] text-white/40">Reportado por: <span className="text-white/60 font-black">{inc.creadaPor}</span></span>
                      )}
                    </div>
                    {!isViewer && (
                      <button onClick={() => setIncMode(inc.id)}
                        className="shrink-0 px-2 py-1 rounded-lg text-[7px] font-black uppercase bg-brand-sage/20 text-brand-sage border border-brand-sage/40 hover:bg-brand-sage/30 transition">
                        Resolver
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Historial resueltas (colapsable) */}
          {resueltas.length > 0 && (
            <details className="mb-2">
              <summary className="text-[8px] font-black text-muted uppercase tracking-widest cursor-pointer hover:text-white transition">
                Historial ({resueltas.length} resueltas)
              </summary>
              <div className="space-y-1.5 mt-2">
                {resueltas.sort((a,b) => new Date(b.fechaResolucion) - new Date(a.fechaResolucion)).map(inc => {
                  const t = getTipo(inc.tipo);
                  return (
                    <div key={inc.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px]">{t.icon}</span>
                        <span className="text-[9px] font-black text-white/60 line-through">{inc.titulo}</span>
                      </div>
                      <p className="text-[7px] text-muted">Creada: {formatFecha(inc.fechaCreacion)}</p>
                      {inc.creadaPor && (
                        <p className="text-[7px] text-white/40">Por: <span className="text-white/60 font-black">{inc.creadaPor}</span></p>
                      )}
                      <p className="text-[7px] text-brand-sage">Resuelta: {formatFecha(inc.fechaResolucion)}</p>
                      {inc.resueltaPor && (
                        <p className="text-[7px] text-brand-sage/70">Por: <span className="font-black">{inc.resueltaPor}</span></p>
                      )}
                      {inc.comentarioResolucion && (
                        <p className="text-[8px] text-white/50 mt-1">{inc.comentarioResolucion}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {abiertas.length === 0 && resueltas.length === 0 && incMode !== "nueva" && (
            <p className="text-[9px] text-muted/50 text-center py-2">Sin incidencias</p>
          )}
        </div>

        {/* FASE ACTIVA INDICATOR */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id:"preop", l:"PRE", ok:selData.preop, color:"#80AF96" },
            { id:"excavacion", l:"EXC", ok:excDone, color:"#FBC202" },
            { id:"armado", l:"ACE", ok:selData.armado, color:"#F68000" },
            { id:"vaciado", l:"VAC", ok:selData.vacP>=100, color:"#80AF96" },
            { id:"remate", l:"REM", ok:selData.remate, color:"#D32237" },
          ].map(ph => (
            <div key={ph.id} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[7px] font-black uppercase border transition
              ${currentPhase === ph.id ? 'border-white/40 bg-white/10 text-white scale-105' : ph.ok ? 'border-transparent bg-white/5 text-white/40' : 'border-transparent bg-white/3 text-white/20'}`}>
              <div className="w-2 h-2 rounded-full" style={{background: ph.ok ? ph.color : currentPhase === ph.id ? ph.color : "rgba(255,255,255,0.1)"}}></div>
              {ph.l}
            </div>
          ))}
        </div>

        <div className="bg-black/40 rounded-2xl p-4 border border-white/5 flex justify-center h-48">
          <CaissonDraw
            status={selData.st} pTR={selData.pTR} desplante={selData.desplante} campana={selData.campana}
            exc={selData.exc} vacP={selData.vacP} excD={selData.excD}
            armado={selData.armado} preop={selData.preop} remate={selData.remate}
          />
        </div>

        {/* ===== FASE 1: PREOPERACIONALES ===== */}
        <div className={`rounded-2xl border p-3 transition ${currentPhase === "preop" ? 'border-brand-sage/50 bg-brand-sage/5' : 'border-white/5 bg-white/5'}`}>
          <div
            onClick={() => canEdit && handleUpdate(selData.k, "preop", !selData.preop)}
            className={`flex items-center gap-3 p-2 rounded-xl transition ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
          >
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0
              ${selData.preop ? 'bg-brand-sage text-black' : 'border-2 border-white/30'}`}>
              {selData.preop ? '\u2713' : ''}
            </div>
            <span className="text-[10px] font-black uppercase text-white">Preoperacionales</span>
            {currentPhase === "preop" && <span className="ml-auto text-[7px] font-black text-brand-sage uppercase animate-pulse">Fase activa</span>}
          </div>
        </div>

        {/* ===== FASE 2: EXCAVACION ===== */}
        <details open={currentPhase === "excavacion" || currentPhase === "preop"}>
          <summary className={`rounded-2xl border p-3 cursor-pointer transition list-none
            ${currentPhase === "excavacion" ? 'border-brand-yellow/50 bg-brand-yellow/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-white">{'\u26A1'} Excavacion</span>
                {excDone && <span className="text-[7px] font-black text-brand-sage bg-brand-sage/20 px-1.5 py-0.5 rounded">{'\u2713'}</span>}
                {currentPhase === "excavacion" && <span className="text-[7px] font-black text-brand-yellow uppercase animate-pulse">Activa</span>}
              </div>
              <span className="text-[9px] font-black text-brand-yellow">{selData.exc.toFixed(1)} / {selData.pTR.toFixed(1)} m</span>
            </div>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                { label:"Excavacion (m)", field:"exc", color:"text-brand-yellow" },
                { label:"Anillos (m)", field:"anillos", color:"text-white" },
                { label:"Suelo Nat. (m)", field:"sueloNatural", color:"text-brand-sage" },
                { label:"Desplante (m)", field:"desplante", color:"text-brand-red" },
              ].map(({ label, field, color }) => (
                <div key={field} className={`bg-white/5 p-2.5 rounded-xl border border-white/5 ${!canEditExc ? 'opacity-50' : ''}`}>
                  <label htmlFor={`cdp-${field}`} className="text-[7px] font-black text-muted uppercase block mb-0.5">{label}</label>
                  <input id={`cdp-${field}`} name={field} type="number" step="0.1" value={selData[field]}
                    onChange={e => canEditExc && handleUpdate(selData.k, field, e.target.value)}
                    readOnly={!canEditExc}
                    className={`w-full bg-transparent text-base font-black outline-none ${color} ${!canEditExc ? 'cursor-not-allowed' : ''}`} />
                </div>
              ))}
            </div>
            {/* Marcar excavacion completa manualmente */}
            {!selData.excD && canEdit && (
              <div
                onClick={() => handleUpdate(selData.k, "excManualComplete", !selEntry.excManualComplete)}
                className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition text-[9px] font-black uppercase
                  ${selEntry.excManualComplete ? 'bg-brand-yellow/20 border-brand-yellow/50 text-brand-yellow' : 'bg-white/5 border-white/10 text-muted hover:bg-white/10'}`}
              >
                <div className={`w-4 h-4 rounded flex items-center justify-center text-[8px] shrink-0
                  ${selEntry.excManualComplete ? 'bg-brand-yellow text-black' : 'border border-white/30'}`}>
                  {selEntry.excManualComplete ? '\u2713' : ''}
                </div>
                Marcar excavacion completa (sin alcanzar prof.)
              </div>
            )}
          </div>
        </details>

        {/* ===== FASE 3: ARMADO (siempre visible, editable en paralelo) ===== */}
        <details open={currentPhase === "armado" || currentPhase === "excavacion"}>
          <summary className={`rounded-2xl border p-3 cursor-pointer transition list-none
            ${currentPhase === "armado" ? 'border-brand-orange/50 bg-brand-orange/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-white">{'\u26D3\uFE0F'} Armado</span>
                {selData.armado && <span className="text-[7px] font-black text-brand-sage bg-brand-sage/20 px-1.5 py-0.5 rounded">{'\u2713'}</span>}
                {currentPhase === "armado" && <span className="text-[7px] font-black text-brand-orange uppercase animate-pulse">Activa</span>}
              </div>
              <span className="text-[9px] font-black text-brand-orange">{Math.round(((barras/12+vueltas/35)/2)*100)}%</span>
            </div>
          </summary>
          <div className={`mt-3 space-y-3 ${!canEditArmado ? 'opacity-50' : ''}`}>
            {/* Barras */}
            <div>
              <div className="flex justify-between text-[8px] font-black mb-1">
                <span className="text-muted uppercase">Barras N7</span>
                <span className="text-white">{barras}/12</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/10 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-brand-orange h-full rounded-full transition-all" style={{width: Math.min(100, (barras/12)*100) + "%"}}></div>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={!canEditArmado} onClick={() => canEditArmado && handleUpdate(selData.k, "barrasColocadas", Math.max(0, barras-1))} className="w-5 h-5 bg-white/10 rounded text-white font-black text-[9px] hover:bg-white/20">{'\u2212'}</button>
                  <span className="text-[9px] font-black text-white w-5 text-center">{barras}</span>
                  <button disabled={!canEditArmado} onClick={() => canEditArmado && handleUpdate(selData.k, "barrasColocadas", Math.min(12, barras+1))} className="w-5 h-5 bg-white/10 rounded text-white font-black text-[9px] hover:bg-white/20">+</button>
                </div>
              </div>
            </div>
            {/* Chipa */}
            <div>
              <div className="flex justify-between text-[8px] font-black mb-1">
                <span className="text-muted uppercase">Chipa N4</span>
                <span className="text-white">{vueltas}/35 vueltas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/10 h-2.5 rounded-full overflow-hidden">
                  <div className="bg-brand-yellow h-full rounded-full transition-all" style={{width: Math.min(100, (vueltas/35)*100) + "%"}}></div>
                </div>
                <div className="flex items-center gap-1">
                  <button disabled={!canEditArmado} onClick={() => canEditArmado && handleUpdate(selData.k, "vueltasChipa", Math.max(0, vueltas-1))} className="w-5 h-5 bg-white/10 rounded text-white font-black text-[9px] hover:bg-white/20">{'\u2212'}</button>
                  <span className="text-[9px] font-black text-white w-5 text-center">{vueltas}</span>
                  <button disabled={!canEditArmado} onClick={() => canEditArmado && handleUpdate(selData.k, "vueltasChipa", Math.min(35, vueltas+1))} className="w-5 h-5 bg-white/10 rounded text-white font-black text-[9px] hover:bg-white/20">+</button>
                </div>
              </div>
            </div>
            {/* Check armado completo */}
            <div
              onClick={() => canEditArmado && handleUpdate(selData.k, "armado", !selData.armado)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border transition text-[9px] font-black uppercase
                ${!canEditArmado ? 'cursor-not-allowed' : 'cursor-pointer'}
                ${selData.armado ? 'bg-brand-sage/20 border-brand-sage text-white' : 'bg-white/5 border-white/10 text-muted hover:bg-white/10'}`}
            >
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0
                ${selData.armado ? 'bg-brand-sage text-black' : 'border border-white/30'}`}>
                {selData.armado ? '\u2713' : ''}
              </div>
              Armado Completo
            </div>
            {/* Detalle pesos colapsable */}
            <details>
              <summary className="text-[7px] font-black text-muted uppercase tracking-widest cursor-pointer hover:text-white transition">Detalle de pesos</summary>
              <div className="mt-2 space-y-1 text-[8px] font-black">
                <div className="flex justify-between"><span className="text-white/50">Peso chipa</span><span className="text-brand-sage">{PESO_CHIPA.toFixed(1)} kg</span></div>
                <div className="flex justify-between"><span className="text-white/50">Peso longitudinal</span><span className="text-brand-sage">{PESO_LONG.toFixed(1)} kg</span></div>
                <div className="flex justify-between border-t border-white/10 pt-1 mt-1"><span className="text-white">Total</span><span className="text-brand-red">{PESO_TOTAL.toFixed(1)} kg</span></div>
              </div>
            </details>
          </div>
        </details>

        {/* ===== FASE 4: VACIADO ===== */}
        <details open={currentPhase === "vaciado"}>
          <summary className={`rounded-2xl border p-3 cursor-pointer transition list-none
            ${currentPhase === "vaciado" ? 'border-brand-sage/50 bg-brand-sage/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-white">{'\uD83D\uDCA7'} Vaciado</span>
                {selData.vacP >= 100 && <span className="text-[7px] font-black text-brand-sage bg-brand-sage/20 px-1.5 py-0.5 rounded">{'\u2713'}</span>}
                {currentPhase === "vaciado" && <span className="text-[7px] font-black text-brand-sage uppercase animate-pulse">Activa</span>}
              </div>
              <span className="text-[9px] font-black text-brand-sage">{selData.vacP.toFixed(0)}%</span>
            </div>
          </summary>
          <div className="mt-3">
            <div className={`bg-white/5 p-3 rounded-xl border border-white/5 ${!canEditVaciado ? 'opacity-50' : ''}`}>
              <label htmlFor="cdp-restante" className="text-[7px] font-black text-muted uppercase block mb-0.5">Restante por vaciar (m)</label>
              {!excDone ? (
                <div className="w-full text-lg font-black text-brand-red/60">
                  {selData.pTR.toFixed(2)} <span className="text-[7px] text-muted font-medium">(auto: prof + desplante)</span>
                </div>
              ) : (
                <input id="cdp-restante" name="restante" type="number" step="0.1" value={selData.restante}
                  onChange={e => canEditVaciado && handleUpdate(selData.k, "restante", e.target.value)}
                  readOnly={!canEditVaciado}
                  className={`w-full bg-transparent text-lg font-black outline-none text-brand-red ${!canEditVaciado ? 'cursor-not-allowed' : ''}`} />
              )}
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 bg-white/10 h-3 rounded-full overflow-hidden">
                  <div className="bg-brand-sage h-full rounded-full transition-all" style={{width: selData.vacP + "%"}}></div>
                </div>
                <span className="text-[9px] font-black text-brand-sage">{selData.vacP.toFixed(0)}%</span>
              </div>
              <p className="text-[7px] text-muted mt-1">Prof. total: {selData.pTR.toFixed(2)} m</p>
            </div>
          </div>
        </details>

        {/* ===== FASE 5: REMATE ===== */}
        <details open={currentPhase === "remate" || currentPhase === "completado"}>
          <summary className={`rounded-2xl border p-3 cursor-pointer transition list-none
            ${currentPhase === "remate" ? 'border-brand-red/50 bg-brand-red/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-white">{'\u2728'} Remate</span>
                {selData.remate && <span className="text-[7px] font-black text-brand-sage bg-brand-sage/20 px-1.5 py-0.5 rounded">{'\u2713'}</span>}
                {currentPhase === "remate" && <span className="text-[7px] font-black text-brand-red uppercase animate-pulse">Activa</span>}
              </div>
              <span className="text-[9px] font-black text-brand-red">{remChecksPct}%</span>
            </div>
          </summary>
          <div className="mt-3 space-y-1.5">
            {[
              { key:"nivelacion", label:"Nivelacion" },
              { key:"plomada", label:"Plomada" },
              { key:"recubrimiento", label:"Recubrimiento" },
              { key:"superficie", label:"Superficie" },
              { key:"curado", label:"Curado" },
            ].map(({ key, label }) => (
              <div key={key}
                onClick={() => canEditRemate && handleRemateCheck(selData.k, key, !remChecks[key])}
                className={`flex items-center gap-2 p-2 rounded-lg border transition text-[9px] font-black uppercase
                  ${!canEditRemate ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${remChecks[key] ? 'bg-brand-sage/10 border-brand-sage/50 text-brand-sage' : 'bg-white/3 border-white/5 text-muted hover:bg-white/8'}`}>
                <div className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[7px] shrink-0
                  ${remChecks[key] ? 'bg-brand-sage text-black' : 'border border-white/25'}`}>
                  {remChecks[key] ? '\u2713' : ''}
                </div>
                {label}
              </div>
            ))}
            {/* Check remate final */}
            <div
              onClick={() => canEditRemate && handleUpdate(selData.k, "remate", !selData.remate)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border transition text-[9px] font-black uppercase mt-2
                ${!canEditRemate ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                ${selData.remate ? 'bg-brand-red/20 border-brand-red text-white' : 'bg-white/5 border-white/10 text-muted hover:bg-white/10'}`}>
              <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] shrink-0
                ${selData.remate ? 'bg-brand-red text-white' : 'border border-white/30'}`}>
                {selData.remate ? '\u2713' : ''}
              </div>
              Remate Completado
            </div>
          </div>
        </details>

        {/* OBSERVACIONES */}
        <div className={!canEdit ? 'opacity-50' : ''}>
          <p className="text-[8px] font-black text-muted uppercase tracking-widest mb-2">Observaciones</p>
          <textarea
            id="cdp-obs"
            name="observaciones"
            rows={2}
            value={obs}
            onChange={e => canEdit && handleUpdate(selData.k, "observaciones", e.target.value)}
            readOnly={!canEdit}
            placeholder="Notas, inconvenientes, avances..."
            className={`w-full bg-white/5 border border-white/10 rounded-xl p-3 text-[10px] text-white font-black outline-none resize-none placeholder:text-muted/50 focus:border-white/30 ${!canEdit ? 'cursor-not-allowed' : ''}`}
          />
          <div className="mt-2">
            <p className="text-[8px] font-black text-muted uppercase mb-1.5">Foto / Imagen</p>
            <label className={`block ${uploadingFoto ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <div className={`w-full border border-dashed rounded-xl p-3 text-center text-[9px] font-black uppercase transition
                ${uploadingFoto ? 'border-brand-yellow/50 bg-brand-yellow/5 animate-pulse' :
                  imgB64 ? 'border-brand-sage/50 bg-brand-sage/5' : 'border-white/20 hover:border-white/40 hover:bg-white/5'}`}>
                {uploadingFoto ? '⏳ Cargando...' : imgB64 ? '✓ Imagen cargada — click para cambiar' : '📷 Seleccionar imagen / cámara'}
              </div>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={uploadingFoto}
                onChange={async e => {
                  const file = e.target.files[0];
                  if (!file) return;
                  e.target.value = '';
                  setUploadingFoto(true);
                  try {
                    const path = `fotos_caissons/${selDate}/K${selData.k}.jpg`;
                    const storageRef = ref(storage, path);
                    await uploadBytes(storageRef, file, { contentType: file.type });
                    const url = await getDownloadURL(storageRef);
                    handleUpdate(selData.k, "imagenBase64", url);
                  } catch (err) {
                    console.error("Error subiendo foto:", err);
                    alert("Error al subir la imagen. Intenta de nuevo.");
                  } finally {
                    setUploadingFoto(false);
                  }
                }}
              />
            </label>
            {imgB64 && (
              <div className="mt-2 relative">
                <img src={imgB64} alt="Observación" className="w-full rounded-xl object-cover" style={{maxHeight:"160px"}}/>
                <button
                  onClick={() => handleUpdate(selData.k, "imagenBase64", "")}
                  className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-6 h-6 text-[10px] font-black flex items-center justify-center hover:bg-brand-red"
                >✕</button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-white/10 space-y-2">
          <div className="flex justify-between text-[9px] font-black uppercase">
            <span className="text-muted">Vol. Excavado</span>
            <span className="text-white">{selData.volExc.toFixed(2)} m&sup3;</span>
          </div>
          <div className="flex justify-between text-[9px] font-black uppercase">
            <span className="text-muted">Vol. Concreto</span>
            <span className="text-brand-sage">{selData.volCon.toFixed(2)} m&sup3;</span>
          </div>
          <div className="flex justify-between text-[9px] font-black uppercase">
            <span className="text-muted">Prof. Total</span>
            <span className="text-white">{selData.pTR.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between text-[9px] font-black uppercase">
            <span className="text-muted">Campana &oslash;</span>
            <span className="text-brand-yellow">{selData.campana} m</span>
          </div>
        </div>
      </div>
    </div>
  );
}
