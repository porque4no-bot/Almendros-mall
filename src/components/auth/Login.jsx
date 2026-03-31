import { useState } from 'react';
import { useAuth, ALLOWED_DOMAIN } from '../../context/AuthContext';
import BerlinLogo from '../ui/BerlinLogo';

/* ── Mensajes de error amigables ────────────────────────────────────────── */
function parseFirebaseError(code) {
  switch (code) {
    case 'auth/email-not-verified':
      return 'Debes verificar tu correo electrónico para poder ingresar. Revisa tu bandeja de entrada.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo. Inicia sesión directamente.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Verifica tu internet e intenta de nuevo.';
    default:
      return 'Ocurrió un error inesperado. Intenta de nuevo.';
  }
}

/* ── Spinner inline ─────────────────────────────────────────────────────── */
function Spinner() {
  return <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin shrink-0" />;
}

/* ── Icono Google ───────────────────────────────────────────────────────── */
function GoogleIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

/* ── Campo de formulario reutilizable ───────────────────────────────────── */
function Field({ label, icon, children, htmlFor }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="text-[8px] font-black uppercase tracking-widest text-muted block">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none select-none">
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Login() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuth();

  /* ── Modo: login | registro ─────────────────────────────────────────── */
  const [isRegistering, setIsRegistering] = useState(false);

  /* ── Campos compartidos ─────────────────────────────────────────────── */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  /* ── Campos exclusivos del registro ────────────────────────────────── */
  const [nombre,   setNombre]   = useState('');
  const [telefono, setTelefono] = useState('');

  /* ── Estados UI ─────────────────────────────────────────────────────── */
  const [loadingEmail,  setLoadingEmail]  = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error,         setError]         = useState(null);
  const [successMsg,    setSuccessMsg]    = useState(null);

  /* ── Helpers ────────────────────────────────────────────────────────── */
  const clearFeedback = () => { setError(null); setSuccessMsg(null); };

  const clearForm = () => {
    setEmail(''); setPassword(''); setNombre(''); setTelefono('');
    setShowPass(false);
    clearFeedback();
  };

  const switchMode = () => {
    clearForm();
    setIsRegistering(p => !p);
  };

  const validateDomain = (e) => {
    if (!e.endsWith(ALLOWED_DOMAIN)) {
      setError(`Solo se permite el acceso a personal con correo corporativo ${ALLOWED_DOMAIN}.`);
      return false;
    }
    return true;
  };

  const isLoading = loadingEmail || loadingGoogle;

  /* ── Login con email ────────────────────────────────────────────────── */
  const handleEmailLogin = async () => {
    clearFeedback();
    if (!email || !password) { setError('Completa todos los campos.'); return; }
    if (!validateDomain(email)) return;

    setLoadingEmail(true);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setError(parseFirebaseError(err.code));
    } finally {
      setLoadingEmail(false);
    }
  };

  /* ── Registro con email ─────────────────────────────────────────────── */
  const handleEmailRegister = async () => {
    clearFeedback();
    if (!nombre.trim())    { setError('El nombre completo es obligatorio.');   return; }
    if (!telefono.trim())  { setError('El número de teléfono es obligatorio.'); return; }
    if (!email || !password) { setError('Completa todos los campos.');          return; }
    if (!validateDomain(email)) return;
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }

    setLoadingEmail(true);
    try {
      await registerWithEmail(email, password, {
        nombre:   nombre.trim(),
        telefono: telefono.trim(),
      });
      clearForm();
      setIsRegistering(false); // Vuelve al login tras registro exitoso
      setSuccessMsg('Cuenta creada. Revisa tu bandeja de entrada y verifica tu correo antes de iniciar sesión.');
    } catch (err) {
      setError(parseFirebaseError(err.code));
    } finally {
      setLoadingEmail(false);
    }
  };

  /* ── Login con Google ───────────────────────────────────────────────── */
  const handleGoogle = async () => {
    clearFeedback();
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError(parseFirebaseError(err.code));
      }
    } finally {
      setLoadingGoogle(false);
    }
  };

  /* ── Enter: login en modo login, registro en modo registro ─────────── */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') isRegistering ? handleEmailRegister() : handleEmailLogin();
  };

  /* ─────────────────────────── RENDER ──────────────────────────────── */
  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-black bg-grid px-4 py-8">
      <div className="berlin-card rounded-3xl p-8 sm:p-10 w-full max-w-sm">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2 mb-7">
          <BerlinLogo height={44} />
          <div className="text-center">
            <h1 className="text-xl font-black tracking-widest uppercase text-white leading-none">
              BERL&Iacute;N<sup className="text-[9px]">&deg;</sup>
            </h1>
            <p className="text-[8px] font-black mt-1 tracking-[0.2em] uppercase" style={{ color: '#80AF96' }}>
              Gesti&oacute;n Estructural
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="h-px w-12 bg-white/10" />
            <span className="text-[7px] font-black uppercase tracking-widest text-muted">
              Almendros Mall · Tronio Etapa 3
            </span>
            <div className="h-px w-12 bg-white/10" />
          </div>
        </div>

        {/* ── Título de modo ────────────────────────────────────────────── */}
        <div className="mb-5 text-center">
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted">
            {isRegistering ? '— Crear cuenta nueva —' : '— Iniciar sesión —'}
          </p>
        </div>

        {/* ── Feedback ──────────────────────────────────────────────────── */}
        {successMsg && (
          <div className="flex items-start gap-2.5 bg-brand-sage/10 border border-brand-sage/30 rounded-2xl px-4 py-3 mb-5">
            <span className="text-brand-sage shrink-0 mt-0.5">✓</span>
            <p className="text-[10px] font-black text-brand-sage leading-relaxed">{successMsg}</p>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2.5 bg-brand-red/10 border border-brand-red/30 rounded-2xl px-4 py-3 mb-5">
            <span className="text-brand-red shrink-0 mt-0.5 font-black">!</span>
            <p className="text-[10px] font-black text-brand-red leading-relaxed">{error}</p>
          </div>
        )}

        {/* ── Formulario ────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Campos adicionales solo en modo registro */}
          {isRegistering && (
            <div className="space-y-3 pb-1 border-b border-white/5">
              <Field label="Nombre completo *" icon="👤" htmlFor="login-nombre">
                <input
                  id="login-nombre"
                  name="nombre"
                  type="text"
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); clearFeedback(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ej: Juan Pérez García"
                  disabled={isLoading}
                  autoComplete="name"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-xs text-white placeholder:text-white/20 outline-none focus:border-brand-red/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </Field>
              <Field label="Número de teléfono *" icon="📱" htmlFor="login-telefono">
                <input
                  id="login-telefono"
                  name="telefono"
                  type="tel"
                  value={telefono}
                  onChange={e => { setTelefono(e.target.value); clearFeedback(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ej: +57 300 000 0000"
                  disabled={isLoading}
                  autoComplete="tel"
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-xs text-white placeholder:text-white/20 outline-none focus:border-brand-red/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </Field>
            </div>
          )}

          {/* Email */}
          <Field label="Correo corporativo" icon="✉" htmlFor="login-email">
            <input
              id="login-email"
              name="email"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); clearFeedback(); }}
              onKeyDown={handleKeyDown}
              placeholder={`usuario${ALLOWED_DOMAIN}`}
              disabled={isLoading}
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-xs text-white placeholder:text-white/20 outline-none focus:border-brand-red/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </Field>

          {/* Contraseña */}
          <Field label="Contraseña" icon="🔒" htmlFor="login-password">
            <input
              id="login-password"
              name="password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); clearFeedback(); }}
              onKeyDown={handleKeyDown}
              placeholder="Mínimo 6 caracteres"
              disabled={isLoading}
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-10 py-3 text-xs text-white placeholder:text-white/20 outline-none focus:border-brand-red/50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted hover:text-white transition"
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </Field>

          {/* Botón principal */}
          <button
            onClick={isRegistering ? handleEmailRegister : handleEmailLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 mt-1 px-6 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-wider bg-brand-red text-white hover:bg-red-700 active:scale-95 transition shadow-lg shadow-brand-red/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {loadingEmail
              ? <><Spinner />{isRegistering ? 'Creando cuenta...' : 'Ingresando...'}</>
              : isRegistering ? '✦ Crear cuenta' : '→ Iniciar Sesión'
            }
          </button>

          {/* Hint de dominio */}
          <p className="text-[7px] text-muted/40 text-center pt-0.5">
            Acceso exclusivo · <span className="font-black text-muted/60">{ALLOWED_DOMAIN}</span>
          </p>
        </div>

        {/* ── Divisor OR ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-white/8" />
          <span className="text-[8px] font-black uppercase tracking-widest text-muted/40">O</span>
          <div className="flex-1 h-px bg-white/8" />
        </div>

        {/* ── Botón Google ─────────────────────────────────────────────── */}
        <button
          onClick={handleGoogle}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-wider bg-white text-brand-black hover:bg-white/90 active:scale-95 transition shadow-lg shadow-white/5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {loadingGoogle
            ? <><Spinner /> Conectando...</>
            : <><GoogleIcon /> Continuar con Google</>
          }
        </button>

        {/* ── Toggle Login ↔ Registro ───────────────────────────────────── */}
        <div className="mt-6 text-center">
          <button
            onClick={switchMode}
            disabled={isLoading}
            className="text-[9px] font-black text-muted hover:text-white transition disabled:opacity-40"
          >
            {isRegistering
              ? '¿Ya tienes cuenta? Inicia sesión aquí'
              : '¿No tienes cuenta? Regístrate aquí'
            }
          </button>
        </div>

      </div>
    </div>
  );
}
