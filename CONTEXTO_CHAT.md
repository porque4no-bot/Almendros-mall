# Contexto del Proyecto — Almendros Mall BERLÍN° Infraestructura
**Proyecto:** `C:\tmp\almendros-refactored`
**Stack:** React 18 + Vite 5 + Tailwind CSS + Firebase 11 (Firestore + Storage)
**Plan Firebase:** Blaze (activo)

---

## 1. Descripción General
App web de seguimiento de obra para **26 caissons** (pilotes tipo caja). Permite registrar avance diario por caisson, gestionar incidencias, generar actas de cobro y visualizar progreso global.

---

## 2. Estructura de Firebase

### Firestore — documento principal
```
proyecto/almendros-mall {
  dailyLog: { "YYYY-MM-DD": { "K-XX": { ...campos } } }
  actas:    ["YYYY-MM-DD", ...]
  incidencias: [ { id, caissonId, tipo, titulo, ... } ]
}
```

### Firestore — colección optimizada (nueva, Plan Blaze)
```
proyectos/almendros-mall/dailyLogs/{YYYY-MM-DD} → datos del día
```

### Storage (activo, Plan Blaze)
```
fotos_caissons/{YYYY-MM-DD}/K{id}.jpg  ← fotos de observaciones
```

---

## 3. Archivos Clave

### `src/config/firebase.js`
Exporta `db` (Firestore) y `storage` (Storage).

### `src/hooks/useFirebaseData.js` ← NUEVO
Hook `useDailyLogSnapshot(selDate, onDayData)` — escucha con `onSnapshot` solo el doc del día activo. Pendiente integrar en App.jsx reemplazando la carga actual.

### `src/utils/caissonUtils.js`
Motor de cálculo principal:
- `defEntry(c)` — valores por defecto de un caisson
- `calcC(c, inp)` — calcula todos los campos derivados (pTR, vacP, gP, bill, etc.)
- `calcGlobal(log, date)` — progreso global de la fecha

**Campos en `defEntry`:**
```js
{ exc, anillos, restante, desplante, sueloNatural, preop, armado, remate,
  excManualComplete, bloqueadoRoca, observaciones, imagenBase64,
  barrasColocadas, vueltasChipa, remateChecks }
```

**Lógica crítica:**
- `excD = exc >= pTR || excManualComplete`
- `pTR = prof + desplante` (profundidad total real)
- `vacP = excD ? clamp((pTR - restante) / pTR * 100, 0, 100) : 0`
- `restante` se auto-calcula como `pTR` mientras `!excD` (no editable durante excavación)
- `vC` y `vF` (volúmenes campana/fuste) solo se calculan cuando `excD = true`

### `src/App.jsx`
Componente principal. Estado global:
- `dailyLog`, `selDate`, `selK`, `actas`, `incidencias`
- `viewMode`: "plano" | "tabla" | "acta"
- `showIncidencias`, `selActa`

**useMemo relevantes:**
- `processed` — array calcC de todos los caissons para `selDate`
- `prevDayProcessed` — calcC del día anterior
- `lastActaProcessed` — calcC de la última acta
- `dash` — KPIs globales (pG, pE, pV, pCa, pCs, pR, totalExc, totalPTR, totalME, cE, cAnillos, cAnillosM, totalAnillosM, cFC, totalFC, cCamM3, cCasKg, cCam, cCas)
- `prevDash` — KPIs del día anterior
- `lastActaDash` — KPIs de la última acta (para deltas)
- `chartData` — series por etapa: global, excavacion, vaciado, armado, campanas

**`handleUpdate(k, field, val)`:**
- Auto-calcula `restante = pTR` cuando `!excDone` y cambia exc/desplante/excManualComplete
- Si `excDone` y cambia desplante, solo actualiza restante si no fue modificado

**Contraseña registros anteriores:** `ppleapok8749`

### `src/components/caissons/CaissonDetailPanel.jsx`
Panel lateral de detalle por caisson. Secciones colapsables por fase:
- **PRE** — Preoperacionales (checkbox)
- **EXC** — Excavación: metros, anillos, excManualComplete. `canEditExc = canEdit && !excDone`
- **ACE** — Armado: barras, vueltas chipa. `canEditArmado = canEdit` (siempre)
- **VAC** — Vaciado: restante (solo si excDone). `canEditVaciado = canEdit && excDone`
- **REM** — Remate: 5 checks + botón completar. `canEditRemate = canEdit && excDone && armado`

**Upload de foto → Firebase Storage:**
- Ruta: `fotos_caissons/${selDate}/K${selK}.jpg`
- Estado `uploadingFoto` muestra "⏳ Cargando..." durante la subida
- Guarda URL de descarga (no base64) en `imagenBase64`

**Incidencias inline:** crear, resolver (con imagen), historial por caisson.

### `src/components/caissons/IncidenciasPanel.jsx`
Panel global de incidencias. Tipos:
```
bloqueo_roca, filtracion, derrumbe, equipo, material, seguridad, calidad, otro
```
Filtros: Abiertas / Resueltas / Todas. Exporta `TIPOS_INCIDENCIA`.

### `src/components/charts/ProgressChart.jsx`
Gráfica SVG auto-escalada con toggles por etapa (Global, Excavación, Vaciado, Armado, Campanas). Marcadores amarillos en fechas de acta.

### `src/components/ui/StatCard.jsx`
Props: `label, value, color, delta, deltaActa, deltaActaUnit, icon, imgSrc, subtext, deltaUnit`
- `delta` → verde/rojo vs día anterior
- `deltaActa` → amarillo vs última acta
- `subtext` soporta `\n` para múltiples líneas

---

## 4. KPI Cards — Layout

**Fila 1** (4 columnas): Avance Global · Campanas · Armado · Remate
**Fila 2** (3 columnas): Excavación · Anillos · Vaciado

**Unidades en delta vs acta:**
| KPI | Unidad acta |
|---|---|
| Avance Global | % |
| Excavación | m³ |
| Campanas | m³ (concreto) |
| Armado | kg (acero) |
| Anillos | m³ |
| Vaciado | m³ |
| Remate | % |

---

## 5. Tabla de Caissons
Columnas: ID · Sección · Excavación · Anillos · Vaciado F+C · Fases · Avance

Debajo de cada barra se muestran deltas:
- Verde `d` = vs día anterior
- Amarillo `a` = vs última acta
- Excavación en metros lineales, Anillos y Vaciado en m³

---

## 6. Lógica de Fases
```
Preop → Excavación → Armado → Vaciado → Remate
```
- Campos de excavación bloqueados una vez `excDone`
- Registros de días anteriores requieren contraseña para editar
- La app carga el **último día con registro** al iniciar (no hoy)

---

## 7. InteractiveMap
Detecta bloqueo por roca desde incidencias (no campo `bloqueadoRoca`):
```js
const isBlocked = incidencias.some(i => i.caissonId === c.k && i.tipo === 'bloqueo_roca' && i.estado === 'abierta');
```

---

## 8. Pendientes / Próximos pasos
- [ ] Integrar `useDailyLogSnapshot` en App.jsx para escucha en tiempo real
- [ ] Deploy a Netlify
- [ ] Configurar reglas de Storage en Firebase Console

---

## 9. Imagen mixer
`public/mixer.png` — ícono para la tarjeta KPI de Vaciado (imagen de hormigonera amarilla).
