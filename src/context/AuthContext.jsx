import { createContext, useContext, useState, useEffect, useRef } from 'react';
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
  const [approved, setApproved]       = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Flag para evitar que onAuthStateChanged cierre sesión durante el registro
  const isRegisteringRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // No cerrar sesión si estamos en medio de un registro
        if (!firebaseUser.emailVerified && !isRegisteringRef.current) {
          await signOut(auth);
          setUser(null);
          setRole('viewer');
          setApproved(false);
          setLoadingAuth(false);
          return;
        }

        // Si estamos registrando, no actualizar estado aún
        if (isRegisteringRef.current) {
          setLoadingAuth(false);
          return;
        }

        setUser(firebaseUser);
        try {
          const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
          if (snap.exists()) {
            const data = snap.data();
            setRole(data.role || 'viewer');
            setApproved(data.approved === true);
          } else {
            setRole('viewer');
            setApproved(false);
          }
        } catch {
          setRole('viewer');
          setApproved(false);
        }
      } else {
        setUser(null);
        setRole('viewer');
        setApproved(false);
      }
      setLoadingAuth(false);
    });
    return unsub;
  }, []);

  /** Login con Google */
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const googleEmail = result.user.email || '';
    const isCorporate = googleEmail.endsWith(ALLOWED_DOMAIN);

    const userDocRef = doc(db, 'usuarios', result.user.uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
      await setDoc(userDocRef, {
        email:     googleEmail,
        nombre:    result.user.displayName || '',
        telefono:  '',
        role:      'viewer',
        approved:  isCorporate,
        createdAt: new Date().toISOString(),
      });
    }
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
    isRegisteringRef.current = true;
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const { user: newUser } = credential;
      const isCorporate = email.endsWith(ALLOWED_DOMAIN);

      await updateProfile(newUser, { displayName: userData.nombre });

      await setDoc(doc(db, 'usuarios', newUser.uid), {
        email,
        nombre:    userData.nombre,
        telefono:  userData.telefono,
        role:      'viewer',
        approved:  isCorporate,
        createdAt: new Date().toISOString(),
      });

      await sendEmailVerification(newUser);
      await signOut(auth);
    } finally {
      isRegisteringRef.current = false;
    }
  };

  /**
   * Login con email/contraseña.
   * Verifica que el email esté confirmado antes de dejar entrar.
   */
  const loginWithEmail = async (email, password) => {
    const res = await signInWithEmailAndPassword(auth, email, password);
    if (!res.user.emailVerified) {
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
      user, role, approved, loadingAuth,
      loginWithGoogle, loginWithEmail, registerWithEmail, logout,
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
