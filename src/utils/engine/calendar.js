/**
 * ENGINE / CALENDAR.JS
 * Puerto directo de modules/calendario.py
 *
 * Manejo de días hábiles colombianos (festivos + sábados alternantes).
 * Todas las fechas se manejan como strings 'YYYY-MM-DD' para evitar
 * desfases de zona horaria. La conversión a Date usa hora local,
 * nunca UTC (new Date('YYYY-MM-DD') sería UTC midnight).
 */

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS INTERNOS DE FECHA
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Parsea 'YYYY-MM-DD' a un objeto Date en hora LOCAL (evita desfase UTC).
 * new Date('2026-03-26') => UTC midnight → puede dar día-1 en GMT-5.
 * new Date(2026, 2, 26)  => Local midnight ✓
 */
export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Formatea un objeto Date local a 'YYYY-MM-DD' */
export function formatDate(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Añade n días calendario (puede ser negativo) */
export function addCalDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/**
 * Máximo de dos strings YYYY-MM-DD (comparación lexicográfica = cronológica).
 * Más rápido y seguro que convertir a Date.
 */
export function dateMax(a, b) { return a >= b ? a : b; }
export function dateMin(a, b) { return a <= b ? a : b; }

/* ─────────────────────────────────────────────────────────────────────────────
   FESTIVOS COLOMBIANOS 2026
   ───────────────────────────────────────────────────────────────────────────── */
const HOLIDAYS_2026 = new Set([
  '2026-01-01', // Año Nuevo
  '2026-01-12', // Reyes Magos (traslado)
  '2026-03-23', // San José (traslado)
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajo
  '2026-05-18', // Ascensión (traslado)
  '2026-06-08', // Corpus Christi (traslado)
  '2026-06-15', // Sagrado Corazón (traslado)
  '2026-06-22', // San Pedro y San Pablo (traslado)
  '2026-06-29', // San Pedro y San Pablo
  '2026-07-20', // Independencia
  '2026-08-07', // Batalla de Boyacá
  '2026-08-17', // Asunción de la Virgen (traslado)
  '2026-10-12', // Día de la Raza (traslado)
  '2026-11-02', // Todos los Santos (traslado)
  '2026-11-16', // Independencia de Cartagena (traslado)
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
]);

/* ─────────────────────────────────────────────────────────────────────────────
   SÁBADOS NO LABORABLES
   Puerto exacto del bloque Python en config.py:
     SATURDAYS_OFF = {4-Apr, 11-Apr}
     Desde 18-Abr: alterna cada semana (18-Abr trabaja, 25-Abr off, 2-May trabaja…)
   ───────────────────────────────────────────────────────────────────────────── */
function buildSaturdaysOff() {
  const off = new Set(['2026-04-04', '2026-04-11']);
  let sat   = parseDate('2026-04-18');
  let works = true; // 18-Abr = trabaja
  const end = parseDate('2026-12-31');

  while (sat <= end) {
    if (!works) off.add(formatDate(sat));
    works = !works;
    // Avanzar 7 días (creamos nueva instancia para no mutar sat)
    const next = new Date(sat);
    next.setDate(sat.getDate() + 7);
    sat = next;
  }
  return off;
}

const SATURDAYS_OFF = buildSaturdaysOff();

/* ─────────────────────────────────────────────────────────────────────────────
   API PÚBLICA  (equivalentes a is_wd, next_wd, ensure_wd, add_wd, prev_wd, wd_between)
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * ¿Es dateStr un día hábil?
 * Excluye: domingos (getDay()===0), festivos y sábados-off.
 * Los sábados laborables (getDay()===6 pero no en SATURDAYS_OFF) SÍ son hábiles.
 */
export function isWorkDay(dateStr) {
  const dow = parseDate(dateStr).getDay(); // 0=Dom … 6=Sáb
  if (dow === 0)                  return false; // domingo
  if (HOLIDAYS_2026.has(dateStr)) return false; // festivo
  if (SATURDAYS_OFF.has(dateStr)) return false; // sábado off
  return true;
}

/**
 * Próximo día hábil DESPUÉS de dateStr (next_wd en Python).
 * No incluye dateStr mismo aunque sea hábil.
 */
export function nextWorkDay(dateStr) {
  let d = addCalDays(dateStr, 1);
  while (!isWorkDay(d)) d = addCalDays(d, 1);
  return d;
}

/**
 * Si dateStr no es hábil, avanza al próximo que sí lo sea (ensure_wd).
 * Si ya es hábil, devuelve dateStr sin cambio.
 */
export function ensureWorkDay(dateStr) {
  let d = dateStr;
  while (!isWorkDay(d)) d = addCalDays(d, 1);
  return d;
}

/**
 * Suma n días hábiles a startStr (add_wd de Python).
 *
 * Replica el comportamiento exacto de Python range(n-1):
 *   n=0 → startStr           (sin avance)
 *   n=1 → startStr           (trabaja en startStr, termina ese día)
 *   n=2 → nextWorkDay(start) (2 días de trabajo: start + siguiente)
 *   n=3 → 2do WD tras start  (3 días: start + sig + sig)
 *
 * PRE: startStr ya es un día hábil.
 */
export function addWorkDays(startStr, n) {
  if (n <= 0) return startStr;
  let d = startStr;
  for (let i = 0; i < n - 1; i++) d = nextWorkDay(d);
  return d;
}

/**
 * Día hábil anterior a dateStr (prev_wd).
 */
export function prevWorkDay(dateStr) {
  let d = addCalDays(dateStr, -1);
  while (!isWorkDay(d)) d = addCalDays(d, -1);
  return d;
}

/**
 * Cuenta días hábiles entre d1Str y d2Str, ambos inclusive (wd_between).
 */
export function workDaysBetween(d1Str, d2Str) {
  let count = 0;
  let d = d1Str;
  while (d <= d2Str) {
    if (isWorkDay(d)) count++;
    d = addCalDays(d, 1);
  }
  return count;
}

/**
 * Primer lunes en dateStr o posterior (útil para calcular fecha de entrega de acero).
 */
export function nextOrSameMonday(dateStr) {
  const d   = parseDate(dateStr);
  const dow = d.getDay(); // 0=Dom, 1=Lun…
  if (dow === 1) return dateStr;
  const daysToMon = (8 - dow) % 7 || 7; // días hasta el próximo lunes
  const next = new Date(d);
  next.setDate(d.getDate() + daysToMon);
  return formatDate(next);
}
