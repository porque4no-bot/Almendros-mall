import { useEffect, useRef, useCallback, useState } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';

/**
 * Escucha en tiempo real el documento principal:
 * proyecto/almendros-mall
 *
 * Llama a onData({ dailyLog, actas, incidencias, cuadrillas }) cuando llegan datos nuevos.
 * Retorna { saveData } para guardado explícito.
 *
 * Estructura del campo cuadrillas (array):
 *   [{ id: string, nombre: string, especialidad: string, activa: boolean }, ...]
 *   — id:          UUID generado en cliente (Date.now + random)
 *   — nombre:      nombre de los integrantes, ej. "Pareja 1 · Juan y Pedro"
 *   — especialidad: "Excavación" | "Armado" | "Vaciado" | "General"
 *   — activa:      si false, la cuadrilla no aparece en selects ni en la simulación
 *
 * saveData acepta cualquier subset de campos; usa { merge: true } para no
 * sobreescribir campos no incluidos en la llamada.
 */
export function useFirestoreSync(onData, onLoaded) {
  const unsubRef = useRef(null);

  useEffect(() => {
    const docRef = doc(db, 'proyecto', 'almendros-mall');
    unsubRef.current = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        onData(snap.data());
      }
      onLoaded();
    }, () => {
      // Error handler — still mark as loaded
      onLoaded();
    });

    return () => {
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveData = useCallback(async (data) => {
    try {
      const docRef = doc(db, 'proyecto', 'almendros-mall');
      await setDoc(docRef, {
        ...data,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      console.log('Datos guardados en Firestore');
    } catch (error) {
      console.error('Error guardando a Firestore:', error);
    }
  }, []);

  /**
   * Elimina una fecha específica del dailyLog en Firestore.
   * Usa deleteField() porque setDoc con merge:true fusiona mapas
   * y no elimina claves anidadas.
   */
  const deleteRegistro = useCallback(async (date) => {
    try {
      const docRef = doc(db, 'proyecto', 'almendros-mall');
      await updateDoc(docRef, {
        [`dailyLog.${date}`]: deleteField(),
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error eliminando registro:', error);
    }
  }, []);

  return { saveData, deleteRegistro };
}

/**
 * Escucha el documento de Línea Base:  proyecto/lineaBase
 *
 * Este documento es inmutable desde la UI normal.
 * Solo se escribe a través de saveBaseline(), que requiere rol admin.
 *
 * Retorna:
 *   baselineData  — null mientras carga, luego el objeto del gantt o null si no existe
 *   loadingBaseline — true hasta primer snapshot
 *   saveBaseline(data) — guarda el documento (sin merge, reemplaza completo)
 */
export function useBaselineData() {
  const [baselineData,    setBaselineData]    = useState(null);
  const [loadingBaseline, setLoadingBaseline] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'proyecto', 'lineaBase');
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        setBaselineData(snap.exists() ? snap.data() : null);
        setLoadingBaseline(false);
      },
      () => setLoadingBaseline(false)
    );
    return () => unsub();
  }, []);

  /**
   * Guarda la línea base en Firestore.
   * Sobreescribe el documento completo (SIN merge) para que sea un
   * snapshot fijo e inmutable del cronograma planeado.
   */
  const saveBaseline = useCallback(async (data) => {
    const docRef = doc(db, 'proyecto', 'lineaBase');
    await setDoc(docRef, data); // no merge — reemplaza completamente
  }, []);

  return { baselineData, loadingBaseline, saveBaseline };
}
