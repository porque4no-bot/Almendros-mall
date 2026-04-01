/**
 * exportGanttExcel.js
 *
 * Exporta la simulación (gantt + resumen) a un archivo .xlsx
 * con diagrama de Gantt visual usando celdas coloreadas.
 */
import * as XLSX from 'xlsx';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const parseLocal = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const fmtDate = (s) => {
  if (!s) return '';
  const d = parseLocal(s);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};
const daysBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / 86400000);

/* ── colores ARGB para xlsx ──────────────────────────────────────────────── */
const CLR_EXC     = 'FFFBC602'; // amarillo — excavación
const CLR_CAMPANA = 'FFF68000'; // naranja — campana+acero
const CLR_VACIADO = 'FF80AF96'; // sage — vaciado
const CLR_CRIT    = 'FFD32237'; // rojo — ruta crítica
const CLR_HDR     = 'FF1A1A1A'; // negro — header
const CLR_LIGHT   = 'FF2A2A2A'; // gris oscuro alterno

/**
 * @param {Object}  result       — resultado de runSimulation()
 * @param {Object}  [baselineData] — lineaBase (opcional)
 * @param {string}  [projectName]  — nombre del proyecto
 */
export function exportGanttToExcel(result, baselineData, projectName = 'Almendros Mall') {
  if (!result?.gantt?.length) {
    alert('No hay datos de simulación para exportar.');
    return;
  }

  const { gantt, summary, criticalPath = [], pairNames = {} } = result;
  const critSet = new Set(criticalPath);
  const wb = XLSX.utils.book_new();

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 1: PROGRAMACIÓN DETALLADA
     ════════════════════════════════════════════════════════════════════════ */
  const detailRows = gantt.map(r => ({
    'Caisson':            `K-${r.k}`,
    'Pareja':             pairNames[r.pair] || r.pair || '—',
    'Inicio Exc.':        fmtDate(r.startExc),
    'Fin Exc.':           fmtDate(r.endShaft),
    'Días Exc.':          r.excDays,
    'Campana + Acero':    fmtDate(r.campanaAceroDay),
    'Vaciado':            fmtDate(r.vaciadoDay),
    'Holgura (días)':     r.totalFloat || 0,
    'Ruta Crítica':       critSet.has(r.k) ? 'SI' : '',
    'Lote Acero':         r.loteAcero || '',
    'Sacrificio':         r.isSacrifice3 ? 'S3 (10m)' : r.isSacrifice15 ? 'S15 (8.5m)' : '',
    'Bloqueado (roca)':   r.isBlocked ? 'SI' : '',
  }));

  const ws1 = XLSX.utils.json_to_sheet(detailRows);
  ws1['!cols'] = [
    {wch:10},{wch:16},{wch:12},{wch:12},{wch:10},{wch:16},{wch:12},{wch:14},{wch:12},{wch:10},{wch:14},{wch:14}
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Programación');

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 2: DIAGRAMA GANTT (celdas coloreadas)
     ════════════════════════════════════════════════════════════════════════ */
  const allDates = gantt.flatMap(r => [r.startExc, r.endShaft, r.campanaAceroDay, r.vaciadoDay, r.floatEndDate]).filter(Boolean);
  const minDate  = allDates.reduce((a,b) => a < b ? a : b);
  const maxDate  = allDates.reduce((a,b) => a > b ? a : b);
  const totalDays = daysBetween(minDate, maxDate) + 1;

  // Generar columnas de fechas
  const dateCols = [];
  for (let i = 0; i < totalDays; i++) {
    const d = parseLocal(minDate);
    d.setDate(d.getDate() + i);
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    dateCols.push(`${dd}/${mm}`);
  }

  // Header row
  const headerRow = ['Caisson', 'Pareja', 'Inicio', 'Fin Vaciado', ...dateCols];

  // Data rows con marcas
  const ganttData = [headerRow];
  for (const r of gantt) {
    const row = [
      `K-${r.k}`,
      pairNames[r.pair] || r.pair || '—',
      fmtDate(r.startExc),
      fmtDate(r.vaciadoDay),
    ];

    const isCrit = critSet.has(r.k);

    for (let i = 0; i < totalDays; i++) {
      const d = parseLocal(minDate);
      d.setDate(d.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      if (r.vaciadoDay && ds === r.vaciadoDay) {
        row.push(isCrit ? 'V★' : 'V');
      } else if (r.campanaAceroDay && ds === r.campanaAceroDay) {
        row.push('C');
      } else if (r.startExc && r.endShaft && ds >= r.startExc && ds <= r.endShaft) {
        row.push('E');
      } else {
        row.push('');
      }
    }
    ganttData.push(row);
  }

  const ws2 = XLSX.utils.aoa_to_sheet(ganttData);

  // Ancho de columnas
  const ganttCols = [
    {wch:10},{wch:14},{wch:12},{wch:12},
    ...dateCols.map(() => ({wch:5})),
  ];
  ws2['!cols'] = ganttCols;

  XLSX.utils.book_append_sheet(wb, ws2, 'Gantt Visual');

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 3: CUADRILLAS (programación por pareja)
     ════════════════════════════════════════════════════════════════════════ */
  const pairRows = [];
  const pairGroups = {};
  for (const r of gantt) {
    const pid = r.pair || '?';
    if (!pairGroups[pid]) pairGroups[pid] = [];
    pairGroups[pid].push(r);
  }

  for (const [pid, items] of Object.entries(pairGroups)) {
    const name = pairNames[pid] || pid;
    for (const r of items) {
      pairRows.push({
        'Pareja':     name,
        'Caisson':    `K-${r.k}`,
        'Inicio':     fmtDate(r.startExc),
        'Fin Exc.':   fmtDate(r.endShaft),
        'Días':       r.excDays,
        'Campana':    fmtDate(r.campanaAceroDay),
        'Vaciado':    fmtDate(r.vaciadoDay),
      });
    }
  }

  const ws3 = XLSX.utils.json_to_sheet(pairRows);
  ws3['!cols'] = [{wch:16},{wch:10},{wch:12},{wch:12},{wch:8},{wch:12},{wch:12}];
  XLSX.utils.book_append_sheet(wb, ws3, 'Cuadrillas');

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 4: RESUMEN DEL PROYECTO
     ════════════════════════════════════════════════════════════════════════ */
  const summaryRows = [
    { 'Parámetro': 'Proyecto', 'Valor': projectName },
    { 'Parámetro': 'Fecha de exportación', 'Valor': new Date().toLocaleDateString('es-CO') },
    { 'Parámetro': '', 'Valor': '' },
    { 'Parámetro': 'Inicio de obra', 'Valor': fmtDate(summary?.startDate) },
    { 'Parámetro': 'Fin proyectado', 'Valor': fmtDate(summary?.projectedEndDate) },
    { 'Parámetro': 'Días calendario', 'Valor': summary?.totalCalDays || '' },
    { 'Parámetro': 'Días hábiles', 'Valor': summary?.totalWorkDays || '' },
    { 'Parámetro': 'Total caissons', 'Valor': summary?.caissonCount || gantt.length },
    { 'Parámetro': 'Parejas de excavación', 'Valor': summary?.pairCount || '' },
    { 'Parámetro': '', 'Valor': '' },
    { 'Parámetro': 'Lote acero 1', 'Valor': fmtDate(summary?.steel1Date) },
    { 'Parámetro': 'Lote acero 2', 'Valor': fmtDate(summary?.steel2Date) },
    { 'Parámetro': '', 'Valor': '' },
    { 'Parámetro': 'Caissons en ruta crítica', 'Valor': criticalPath.length },
    { 'Parámetro': 'Ruta crítica', 'Valor': criticalPath.map(k => `K-${k}`).join(', ') },
  ];

  if (baselineData?.summary) {
    summaryRows.push(
      { 'Parámetro': '', 'Valor': '' },
      { 'Parámetro': '── LÍNEA BASE ──', 'Valor': '' },
      { 'Parámetro': 'Fin baseline', 'Valor': fmtDate(baselineData.summary.projectedEndDate) },
      { 'Parámetro': 'Generada', 'Valor': baselineData.generatedAt || '' },
      { 'Parámetro': 'Por', 'Valor': baselineData.generatedBy || '' },
    );
  }

  const ws4 = XLSX.utils.json_to_sheet(summaryRows);
  ws4['!cols'] = [{wch:30},{wch:40}];
  XLSX.utils.book_append_sheet(wb, ws4, 'Resumen');

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 5: LEYENDA
     ════════════════════════════════════════════════════════════════════════ */
  const legendRows = [
    { 'Símbolo': 'E', 'Significado': 'Día de excavación' },
    { 'Símbolo': 'C', 'Significado': 'Campana + instalación acero' },
    { 'Símbolo': 'V', 'Significado': 'Vaciado de concreto ciclópeo' },
    { 'Símbolo': 'V★', 'Significado': 'Vaciado (ruta crítica)' },
    { 'Símbolo': '', 'Significado': '' },
    { 'Símbolo': 'S3', 'Significado': 'Sacrificio grupo 3 — profundidad 10.0 m' },
    { 'Símbolo': 'S15', 'Significado': 'Sacrificio grupo 15 — profundidad 8.5 m' },
    { 'Símbolo': '⛔', 'Significado': 'Bloqueado por roca (requiere compresor)' },
  ];

  const ws5 = XLSX.utils.json_to_sheet(legendRows);
  ws5['!cols'] = [{wch:10},{wch:44}];
  XLSX.utils.book_append_sheet(wb, ws5, 'Leyenda');

  /* ════════════════════════════════════════════════════════════════════════
     DESCARGAR
     ════════════════════════════════════════════════════════════════════════ */
  const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const fileName = `Programacion_Gantt_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
