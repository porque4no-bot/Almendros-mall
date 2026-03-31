import { createContext, useContext, useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';

const ALLOWED_DOMAIN = '@constructoraberlin.com';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [role, setRole]               = useState('viewer');
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Bloquear usuarios con email no verificado (excepto Google, que llega pre-verificado)
        if (!firebaseUser.emailVerified) {
          await signOut(auth);
          setUser(null);
          setRole('viewer');
          setLoadingAuth(false);
          return;
        }

        setUser(firebaseUser);
        try {
          const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
          setRole(snap.exists() && snap.data().role ? snap.data().role : 'viewer');
        } catch {
          setRole('viewer');
        }
      } else {
        setUser(null);
        setRole('viewer');
      }
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  /** Login con Google (mantiene comportamiento existente) */
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  /**
   * Registro con email corporativo.
   * Crea el usuario → actualiza perfil → guarda doc en Firestore
   *   → envía verificación → cierra sesión de inmediato.
   * El usuario NO entra al sistema hasta que verifique su correo.
   *
   * @param {string} email
   * @param {string} password
   * @param {{ nombre: string, telefono: string }} userData
   */
  const registerWithEmail = async (email, password, userData) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const { user } = credential;

    // 1 — Actualizar displayName en Firebase Auth
    await updateProfile(user, { displayName: userData.nombre });

    // 2 — Crear documento en Firestore con role 'viewer' por defecto
    await setDoc(doc(db, 'usuarios', user.uid), {
      email,
      nombre:    userData.nombre,
      telefono:  userData.telefono,
      role:      'viewer',
      createdAt: new Date().toISOString(),
    });

    // 3 — Enviar verificación y forzar cierre de sesión
    await sendEmailVerification(user);
    await signOut(auth); // No puede entrar hasta verificar
  };

  /**
   * Login con email/contraseña.
   * Verifica que el email esté confirmado antes de dejar entrar.
   */
  const loginWithEmail = async (email, password) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    if (!result.user.emailVerified) {
      await signOut(auth);
      const err = new Error('email-not-verified');
      err.code = 'auth/email-not-verified';
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      user, role, loadingAuth,
      loginWithGoogle,
      loginWithEmail,
      registerWithEmail,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export { ALLOWED_DOMAIN };
