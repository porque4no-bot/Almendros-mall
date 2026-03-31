import { useMemo } from 'react';
import BerlinLogo from '../ui/BerlinLogo';

const ROLE_LABELS = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
const ROLE_COLORS = { admin: 'bg-brand-red', editor: 'bg-brand-orange', viewer: 'bg-white/20' };

export default function Header({
  selDate, selActa, actas, sortedDates, showCalendar, isDarkMode,
  calendarMonth, monthName, getCalendarDays,
  onSetShowCalendar, onSetSelDate, onSetSelActa, onSetViewMode, onSetCalendarMonth,
  onCrearDia, onCortarActa, onEliminarRegistro, onToggleDarkMode,
  showIncidencias, onToggleIncidencias, incidenciasAbiertas,
  isViewer, user, role, onLogout,
  hasBaseline, savingBaseline, onFijarLineaBase,
}) {
  return (
    <header className="bg-brand-black border-b border-white/10 px-6 py-4 sticky top-0 z-50 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <BerlinLogo height={40} />
          <div className="h-8 w-px bg-white/10 mx-1"></div>
          <div>
            <h1 className="text-lg font-black tracking-widest uppercase leading-none text-white">
              BERL&Iacute;N<sup className="text-[10px]">&deg;</sup>
            </h1>
            <p className="text-[9px] font-black mt-0.5 tracking-[0.2em] uppercase" style={{color:"#80AF96"}}>
              Gesti&oacute;n Estructural
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 px-4 hidden md:block">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/50 truncate">
            Almendros Mall &ndash; Tronio Etapa 3
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Calendar + Actas Selector */}
          <div className="relative">
            <button
              onClick={() => onSetShowCalendar(!showCalendar)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white transition-all border border-white/20 hover:bg-white/5"
              style={{background:"rgba(255,255,255,0.07)"}}
            >
              {'\uD83D\uDCC5'} {selActa ? `Acta ${actas.indexOf(selActa) + 1}` : selDate.slice(5)}
              <span className={`text-xs transition-transform ${showCalendar ? 'rotate-180' : ''}`}>{'\u25BC'}</span>
            </button>

            {showCalendar && (
              <div className="absolute top-12 z-50 bg-brand-black border border-white/20 rounded-2xl p-4 shadow-2xl"
                style={{left:"8px", width:"calc(100vw - 16px)", maxWidth:"450px", background:"rgba(13,13,13,0.98)", backdropFilter:"blur(20px)", maxHeight:"600px", overflowY:"auto"}}>

                {/* CALENDAR */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={() => onSetCalendarMonth(m => ({ ...m, month: m.month === 0 ? 11 : m.month - 1, year: m.month === 0 ? m.year - 1 : m.year }))} className="p-2 hover:bg-white/10 rounded-lg transition text-white/60 hover:text-white">{'\u25C0'}</button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">{monthName}</span>
                    <button onClick={() => onSetCalendarMonth(m => ({ ...m, month: m.month === 11 ? 0 : m.month + 1, year: m.month === 11 ? m.year + 1 : m.year }))} className="p-2 hover:bg-white/10 rounded-lg transition text-white/60 hover:text-white">{'\u25B6'}</button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"].map(d => (
                      <div key={d} className="text-center text-[8px] font-black text-muted uppercase py-1">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {getCalendarDays.map((day, idx) => {
                      const dateStr = day.toISOString().split('T')[0];
                      const isCurrentMonth = day.getMonth() === calendarMonth.month;
                      const isSelected = dateStr === selDate && !selActa;
                      const hasActa = actas.includes(dateStr);
                      const hasLog = sortedDates.includes(dateStr);

                      return (
                        <button
                          key={idx}
                          onClick={() => {
                            if (hasLog || hasActa) {
                              onSetSelDate(dateStr);
                              onSetViewMode(hasActa ? "acta" : "plano");
                              if (hasActa) onSetSelActa(dateStr);
                              else onSetSelActa(null);
                              onSetShowCalendar(false);
                            }
                          }}
                          disabled={!hasLog && !hasActa}
                          className={`py-2 rounded text-[9px] font-black transition-all
                            ${isSelected ? 'bg-brand-red text-white' : hasActa ? 'bg-brand-yellow text-black hover:bg-yellow-400' : hasLog ? 'bg-white/5 text-white hover:bg-white/10' : 'text-white/20 cursor-not-allowed'}
                            ${!isCurrentMonth && !hasLog && !hasActa ? 'opacity-30' : ''}
                          `}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ACTAS GENERADAS */}
                {actas.length > 0 && (
                  <div className="border-t border-white/10 pt-4">
                    <p className="text-[9px] font-black uppercase text-muted mb-3 tracking-widest">Actas Generadas</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto sthin">
                      {actas.map((a, idx) => (
                        <button
                          key={a}
                          onClick={() => { onSetSelActa(a); onSetViewMode("acta"); onSetShowCalendar(false); }}
                          className={`w-full px-3 py-2 rounded-lg text-[10px] font-black transition-all text-left
                            ${selActa === a ? 'bg-brand-yellow text-black' : 'bg-white/5 text-muted hover:text-white'}`}
                        >
                          {'\uD83D\uDCCB'} Acta {idx + 1} &middot; {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons — hidden for viewers */}
          {!isViewer && (
            <>
              <button
                onClick={onCrearDia}
                className="bg-brand-red px-4 py-2 rounded-xl text-[10px] font-black uppercase text-white shadow-lg shadow-brand-red/20 transition-transform active:scale-95 hover:bg-red-700"
              >
                + Registro
              </button>

              <button
                onClick={onCortarActa}
                className="bg-brand-yellow px-4 py-2 rounded-xl text-[10px] font-black uppercase text-black transition-transform active:scale-95 hover:bg-yellow-400"
              >
                Cortar Acta
              </button>
            </>
          )}

          <button
            onClick={onToggleIncidencias}
            className={`relative px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-transform active:scale-95
              ${showIncidencias ? 'bg-brand-orange text-white' : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'}`}
          >
            Incidencias
            {incidenciasAbiertas > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                {incidenciasAbiertas}
              </span>
            )}
          </button>

          {!isViewer && (
            <button
              onClick={onEliminarRegistro}
              className="bg-red-900/50 border border-red-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase text-red-300 transition-transform active:scale-95 hover:bg-red-900"
              title="Eliminar registro"
            >
              {'\uD83D\uDDD1\uFE0F'} Eliminar
            </button>
          )}

          <button
            onClick={onToggleDarkMode}
            className="bg-white/10 border border-white/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 hover:bg-white/20"
            title={isDarkMode ? "Modo Diurno" : "Modo Nocturno"}
          >
            {isDarkMode ? '\u2600\uFE0F Diurno' : '\uD83C\uDF19 Nocturno'}
          </button>

          {/* ── Botón Línea Base (solo admin) ── */}
          {role === 'admin' && (
            <button
              onClick={onFijarLineaBase}
              disabled={savingBaseline}
              title={hasBaseline ? 'Línea Base activa — click para regenerar' : 'Fijar Línea Base del proyecto'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-wider transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                hasBaseline
                  ? 'bg-brand-sage/15 border border-brand-sage/30 text-brand-sage hover:bg-brand-sage/25'
                  : 'bg-brand-yellow/15 border border-brand-yellow/40 text-brand-yellow hover:bg-brand-yellow/25 animate-pulse'
              }`}
            >
              {savingBaseline ? (
                <><div className="w-3 h-3 border-2 border-current/30 border-t-current rounded-full animate-spin" />Fijando...</>
              ) : hasBaseline ? (
                <>{'\u2713'} LB Activa</>
              ) : (
                <>{'\uD83D\uDCCC'} Fijar LB</>
              )}
            </button>
          )}

          {/* User indicator + logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full border border-white/20" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white">
                {(user?.displayName || user?.email || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="hidden sm:block">
              <p className="text-[8px] font-black text-white truncate max-w-[100px]">
                {user?.displayName || user?.email}
              </p>
              <span className={`inline-block px-1.5 py-0.5 rounded text-[6px] font-black uppercase text-white ${ROLE_COLORS[role] || 'bg-white/20'}`}>
                {ROLE_LABELS[role] || role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="bg-white/5 border border-white/10 p-1.5 rounded-lg text-[9px] text-muted hover:text-white hover:bg-white/10 transition"
              title="Cerrar sesion"
            >
              {'\uD83D\uDEAA'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
