/**
 * exportGanttExcel.js
 *
 * Exporta la simulación a .xlsx con grafismo profesional usando ExcelJS.
 * Colores de marca Berlín: negro #111, rojo #D32237, sage #80AF96, amarillo #FBC602, naranja #F68000
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/* ── helpers ─────────────────────────────────────────────────────────────── */
const parseLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtD = (s) => {
  if (!s) return '';
  const d = parseLocal(s);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const daysBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / 86400000);
const addDays = (s, n) => { const d = parseLocal(s); d.setDate(d.getDate() + n); return d; };
const toYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── paleta Berlín ───────────────────────────────────────────────────────── */
const PAL = {
  black:     '111111',
  darkGray:  '1A1A1A',
  midGray:   '2A2A2A',
  lightGray: '3A3A3A',
  border:    '444444',
  muted:     '888888',
  white:     'FFFFFF',
  red:       'D32237',
  sage:      '80AF96',
  yellow:    'FBC602',
  orange:    'F68000',
  softRed:   'F2D5D9',
  softSage:  'D9EDE2',
  softYellow:'FDF3D0',
  softOrange:'FDEAD0',
};

/* ── estilos reutilizables ───────────────────────────────────────────────── */
const FONT_TITLE  = { name: 'Calibri', size: 14, bold: true, color: { argb: PAL.white } };
const FONT_HDR    = { name: 'Calibri', size: 9,  bold: true, color: { argb: PAL.white } };
const FONT_CELL   = { name: 'Calibri', size: 9,  color: { argb: PAL.darkGray } };
const FONT_CELL_B = { name: 'Calibri', size: 9,  bold: true, color: { argb: PAL.darkGray } };
const FONT_SMALL  = { name: 'Calibri', size: 8,  color: { argb: PAL.muted } };
const FONT_GANTT  = { name: 'Calibri', size: 7,  bold: true, color: { argb: PAL.white } };

const FILL_HDR    = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.darkGray } };
const FILL_ALT    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F5F5F5' } };
const FILL_WHITE  = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.white } };
const FILL_EXC    = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.yellow } };
const FILL_CAMP   = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.orange } };
const FILL_VAC    = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.sage } };
const FILL_CRIT   = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.red } };
const FILL_WE     = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EFEFEF' } };

const BORDER_THIN = {
  top:    { style: 'thin', color: { argb: 'DDDDDD' } },
  bottom: { style: 'thin', color: { argb: 'DDDDDD' } },
  left:   { style: 'thin', color: { argb: 'DDDDDD' } },
  right:  { style: 'thin', color: { argb: 'DDDDDD' } },
};
const BORDER_HDR = {
  bottom: { style: 'medium', color: { argb: PAL.red } },
};
const ALIGN_C = { horizontal: 'center', vertical: 'middle' };
const ALIGN_L = { horizontal: 'left', vertical: 'middle' };

function applyHeaderRow(ws, row, colCount) {
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = FONT_HDR;
    cell.fill = FILL_HDR;
    cell.alignment = ALIGN_C;
    cell.border = BORDER_HDR;
  }
  row.height = 24;
}

function applyDataRows(ws, startRow, endRow, colCount) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    const isAlt = (r - startRow) % 2 === 1;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = c === 1 ? FONT_CELL_B : FONT_CELL;
      cell.fill = isAlt ? FILL_ALT : FILL_WHITE;
      cell.border = BORDER_THIN;
      cell.alignment = c <= 2 ? ALIGN_L : ALIGN_C;
    }
    row.height = 20;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT PRINCIPAL
   ═══════════════════════════════════════════════════════════════════════════ */

export async function exportGanttToExcel(result, baselineData, projectName = 'Almendros Mall') {
  if (!result?.gantt?.length) {
    alert('No hay datos de simulación para exportar.');
    return;
  }

  const { gantt, summary, criticalPath = [], pairNames = {} } = result;
  const critSet = new Set(criticalPath);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Constructora Berlín';
  wb.created = new Date();

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 1: RESUMEN DEL PROYECTO
     ════════════════════════════════════════════════════════════════════════ */
  const wsR = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: PAL.red } } });
  wsR.columns = [{ width: 32 }, { width: 42 }];

  // Título
  wsR.mergeCells('A1:B1');
  const titleCell = wsR.getCell('A1');
  titleCell.value = `${projectName} — Resumen de Programación`;
  titleCell.font = FONT_TITLE;
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.black } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  wsR.getRow(1).height = 36;

  // Subtítulo
  wsR.mergeCells('A2:B2');
  const subCell = wsR.getCell('A2');
  subCell.value = `Exportado: ${new Date().toLocaleDateString('es-CO')} · Constructora Berlín`;
  subCell.font = { ...FONT_SMALL, italic: true };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.midGray } };
  subCell.font = { ...FONT_SMALL, color: { argb: PAL.muted }, italic: true };
  wsR.getRow(2).height = 22;

  const summaryItems = [
    ['', ''],
    ['CRONOGRAMA', ''],
    ['Inicio de obra', fmtD(summary?.startDate)],
    ['Fin proyectado', fmtD(summary?.projectedEndDate)],
    ['Días calendario', summary?.totalCalDays || ''],
    ['Días hábiles', summary?.totalWorkDays || ''],
    ['', ''],
    ['RECURSOS', ''],
    ['Total caissons', summary?.caissonCount || gantt.length],
    ['Parejas de excavación', summary?.pairCount || ''],
    ['Lote acero 1', fmtD(summary?.steel1Date)],
    ['Lote acero 2', fmtD(summary?.steel2Date)],
    ['', ''],
    ['RUTA CRÍTICA', ''],
    ['Caissons en ruta crítica', criticalPath.length],
    ['Detalle', criticalPath.map(k => `K-${k}`).join(', ')],
  ];

  if (baselineData?.summary) {
    summaryItems.push(
      ['', ''],
      ['LÍNEA BASE', ''],
      ['Fin baseline', fmtD(baselineData.summary.projectedEndDate)],
      ['Generada', baselineData.generatedAt || ''],
      ['Por', baselineData.generatedBy || ''],
    );
  }

  let sRow = 3;
  for (const [label, val] of summaryItems) {
    sRow++;
    const row = wsR.getRow(sRow);
    // Section headers
    if (val === '' && label && !label.startsWith(' ')) {
      wsR.mergeCells(`A${sRow}:B${sRow}`);
      const c = row.getCell(1);
      c.value = label;
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PAL.red } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F9F0F1' } };
      c.border = { bottom: { style: 'thin', color: { argb: PAL.red } } };
      row.height = 22;
    } else if (label) {
      row.getCell(1).value = label;
      row.getCell(1).font = FONT_CELL;
      row.getCell(1).border = BORDER_THIN;
      row.getCell(2).value = val;
      row.getCell(2).font = FONT_CELL_B;
      row.getCell(2).alignment = ALIGN_L;
      row.getCell(2).border = BORDER_THIN;
      row.height = 20;
    }
  }

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 2: PROGRAMACIÓN DETALLADA
     ════════════════════════════════════════════════════════════════════════ */
  const wsP = wb.addWorksheet('Programación', { properties: { tabColor: { argb: PAL.sage } } });
  const pCols = [
    { header: 'Caisson',        key: 'caisson',   width: 10 },
    { header: 'Pareja',         key: 'pareja',    width: 18 },
    { header: 'Inicio Exc.',    key: 'inicioExc', width: 13 },
    { header: 'Fin Exc.',       key: 'finExc',    width: 13 },
    { header: 'Días Exc.',      key: 'diasExc',   width: 10 },
    { header: 'Campana+Acero',  key: 'campana',   width: 15 },
    { header: 'Vaciado',        key: 'vaciado',   width: 13 },
    { header: 'Holgura',        key: 'holgura',   width: 10 },
    { header: 'Ruta Crítica',   key: 'critica',   width: 12 },
    { header: 'Lote Acero',     key: 'lote',      width: 11 },
    { header: 'Grupo',          key: 'grupo',     width: 16 },
  ];
  wsP.columns = pCols;

  // Header
  applyHeaderRow(wsP, wsP.getRow(1), pCols.length);

  // Data
  for (const r of gantt) {
    const isCrit = critSet.has(r.k);
    const row = wsP.addRow({
      caisson:   `K-${r.k}`,
      pareja:    pairNames[r.pair] || r.pair || '—',
      inicioExc: fmtD(r.startExc),
      finExc:    fmtD(r.endShaft),
      diasExc:   r.excDays,
      campana:   fmtD(r.campanaAceroDay),
      vaciado:   fmtD(r.vaciadoDay),
      holgura:   r.totalFloat || 0,
      critica:   isCrit ? 'SI' : '',
      lote:      r.loteAcero || '',
      grupo:     r.isSacrifice3 ? 'S3 (10m)' : r.isSacrifice15 ? 'S15 (8.5m)' : 'Normal',
    });

    // Highlight ruta crítica
    if (isCrit) {
      row.getCell('critica').font = { ...FONT_CELL_B, color: { argb: PAL.red } };
      row.getCell('critica').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.softRed } };
    }
  }
  applyDataRows(wsP, 2, wsP.rowCount, pCols.length);

  // Re-highlight critical after general styling
  for (let i = 0; i < gantt.length; i++) {
    if (critSet.has(gantt[i].k)) {
      const row = wsP.getRow(i + 2);
      row.getCell('critica').font = { ...FONT_CELL_B, color: { argb: PAL.red } };
      row.getCell('critica').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.softRed } };
    }
  }

  // Autofilter
  wsP.autoFilter = { from: 'A1', to: `K${wsP.rowCount}` };

  // Freeze header
  wsP.views = [{ state: 'frozen', ySplit: 1 }];

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 3: GANTT VISUAL (celdas coloreadas)
     ════════════════════════════════════════════════════════════════════════ */
  const wsG = wb.addWorksheet('Gantt Visual', { properties: { tabColor: { argb: PAL.yellow } } });

  const allDates = gantt.flatMap(r => [r.startExc, r.endShaft, r.campanaAceroDay, r.vaciadoDay, r.floatEndDate]).filter(Boolean);
  const minDate = allDates.reduce((a, b) => a < b ? a : b);
  const maxDate = allDates.reduce((a, b) => a > b ? a : b);
  const totalDays = daysBetween(minDate, maxDate) + 1;

  // Fixed columns
  const fixedCols = 4;
  wsG.getColumn(1).width = 9;
  wsG.getColumn(2).width = 16;
  wsG.getColumn(3).width = 11;
  wsG.getColumn(4).width = 11;

  // Date columns
  for (let i = 0; i < totalDays; i++) {
    wsG.getColumn(fixedCols + 1 + i).width = 3.5;
  }

  // === ROW 1: Month headers (merged) ===
  const monthRow = wsG.getRow(1);
  monthRow.height = 18;
  // Fixed headers
  for (let c = 1; c <= fixedCols; c++) {
    const cell = monthRow.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.black } };
  }

  let curMonth = -1, monthStart = -1;
  const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  for (let i = 0; i <= totalDays; i++) {
    const d = i < totalDays ? addDays(minDate, i) : null;
    const mo = d ? d.getMonth() : -2;

    if (mo !== curMonth) {
      // Close previous month merge
      if (monthStart >= 0 && i > monthStart) {
        const fromCol = fixedCols + 1 + monthStart;
        const toCol = fixedCols + i; // i-1 + 1
        if (toCol > fromCol) {
          wsG.mergeCells(1, fromCol, 1, toCol);
        }
        const mc = monthRow.getCell(fromCol);
        const prevD = addDays(minDate, monthStart);
        mc.value = `${MESES[prevD.getMonth()]} ${prevD.getFullYear()}`;
        mc.font = { name: 'Calibri', size: 8, bold: true, color: { argb: PAL.white } };
        mc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.black } };
        mc.alignment = ALIGN_C;
      }
      curMonth = mo;
      monthStart = i;
    }
  }

  // === ROW 2: Day numbers + day-of-week ===
  const dayHdrRow = wsG.getRow(2);
  dayHdrRow.height = 20;

  // Fixed column headers in row 2
  const fixedHeaders = ['Caisson', 'Pareja', 'Inicio', 'Vaciado'];
  for (let c = 0; c < fixedCols; c++) {
    const cell = dayHdrRow.getCell(c + 1);
    cell.value = fixedHeaders[c];
    cell.font = FONT_HDR;
    cell.fill = FILL_HDR;
    cell.alignment = ALIGN_C;
    cell.border = BORDER_HDR;
  }

  const DIAS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(minDate, i);
    const cell = dayHdrRow.getCell(fixedCols + 1 + i);
    const dow = d.getDay();
    const isWe = dow === 0 || dow === 6;
    cell.value = d.getDate();
    cell.font = { name: 'Calibri', size: 7, bold: true, color: { argb: isWe ? PAL.red : PAL.white } };
    cell.fill = FILL_HDR;
    cell.alignment = ALIGN_C;
    cell.border = { bottom: { style: 'thin', color: { argb: isWe ? PAL.red : PAL.border } } };

    // Add comment with day name
    cell.note = { texts: [{ text: DIAS[dow], font: { size: 8 } }] };
  }

  // === DATA ROWS ===
  for (let ri = 0; ri < gantt.length; ri++) {
    const r = gantt[ri];
    const isCrit = critSet.has(r.k);
    const isAlt = ri % 2 === 1;
    const dataRow = wsG.getRow(3 + ri);
    dataRow.height = 18;

    // Fixed cells
    const cellK = dataRow.getCell(1);
    cellK.value = `K-${r.k}`;
    cellK.font = { name: 'Calibri', size: 8, bold: true, color: { argb: isCrit ? PAL.red : PAL.darkGray } };
    cellK.fill = isAlt ? FILL_ALT : FILL_WHITE;
    cellK.alignment = ALIGN_C;
    cellK.border = BORDER_THIN;

    const cellP = dataRow.getCell(2);
    cellP.value = pairNames[r.pair] || r.pair || '—';
    cellP.font = { ...FONT_CELL, size: 8 };
    cellP.fill = isAlt ? FILL_ALT : FILL_WHITE;
    cellP.alignment = ALIGN_L;
    cellP.border = BORDER_THIN;

    const cellS = dataRow.getCell(3);
    cellS.value = fmtD(r.startExc);
    cellS.font = { ...FONT_SMALL };
    cellS.fill = isAlt ? FILL_ALT : FILL_WHITE;
    cellS.alignment = ALIGN_C;
    cellS.border = BORDER_THIN;

    const cellV = dataRow.getCell(4);
    cellV.value = fmtD(r.vaciadoDay);
    cellV.font = { ...FONT_SMALL };
    cellV.fill = isAlt ? FILL_ALT : FILL_WHITE;
    cellV.alignment = ALIGN_C;
    cellV.border = BORDER_THIN;

    // Gantt bars
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(minDate, i);
      const ds = toYMD(d);
      const dow = d.getDay();
      const isWe = dow === 0 || dow === 6;
      const cell = dataRow.getCell(fixedCols + 1 + i);
      cell.border = { left: { style: 'hair', color: { argb: 'E0E0E0' } } };

      if (r.vaciadoDay && ds === r.vaciadoDay) {
        cell.value = 'V';
        cell.font = FONT_GANTT;
        cell.fill = isCrit ? FILL_CRIT : FILL_VAC;
        cell.alignment = ALIGN_C;
      } else if (r.campanaAceroDay && ds === r.campanaAceroDay) {
        cell.value = 'C';
        cell.font = FONT_GANTT;
        cell.fill = FILL_CAMP;
        cell.alignment = ALIGN_C;
      } else if (r.startExc && r.endShaft && ds >= r.startExc && ds <= r.endShaft) {
        cell.value = '';
        cell.fill = FILL_EXC;
      } else if (isWe) {
        cell.fill = FILL_WE;
      } else {
        cell.fill = isAlt ? FILL_ALT : FILL_WHITE;
      }
    }
  }

  // Freeze panes: fixed cols + header rows
  wsG.views = [{ state: 'frozen', xSplit: fixedCols, ySplit: 2 }];

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 4: CUADRILLAS
     ════════════════════════════════════════════════════════════════════════ */
  const wsC = wb.addWorksheet('Cuadrillas', { properties: { tabColor: { argb: PAL.orange } } });
  const cCols = [
    { header: 'Pareja',   key: 'pareja',  width: 18 },
    { header: 'Caisson',  key: 'caisson', width: 10 },
    { header: 'Inicio',   key: 'inicio',  width: 13 },
    { header: 'Fin Exc.', key: 'finExc',  width: 13 },
    { header: 'Días',     key: 'dias',    width: 8 },
    { header: 'Campana',  key: 'campana', width: 13 },
    { header: 'Vaciado',  key: 'vaciado', width: 13 },
  ];
  wsC.columns = cCols;
  applyHeaderRow(wsC, wsC.getRow(1), cCols.length);

  // Group by pair
  const pairGroups = {};
  for (const r of gantt) {
    const pid = r.pair || '?';
    if (!pairGroups[pid]) pairGroups[pid] = [];
    pairGroups[pid].push(r);
  }

  let pairRowIdx = 1;
  for (const [pid, items] of Object.entries(pairGroups)) {
    const name = pairNames[pid] || pid;

    // Pair separator header
    pairRowIdx++;
    const sepRow = wsC.getRow(pairRowIdx);
    wsC.mergeCells(`A${pairRowIdx}:G${pairRowIdx}`);
    const sepCell = sepRow.getCell(1);
    sepCell.value = `  ${name}`;
    sepCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PAL.white } };
    sepCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.midGray } };
    sepCell.alignment = ALIGN_L;
    sepRow.height = 22;

    for (const r of items) {
      pairRowIdx++;
      wsC.getRow(pairRowIdx).values = [
        name,
        `K-${r.k}`,
        fmtD(r.startExc),
        fmtD(r.endShaft),
        r.excDays,
        fmtD(r.campanaAceroDay),
        fmtD(r.vaciadoDay),
      ];
    }
  }
  applyDataRows(wsC, 2, wsC.rowCount, cCols.length);

  // Re-apply pair separators (they got overwritten by applyDataRows)
  let sepIdx = 1;
  for (const [pid] of Object.entries(pairGroups)) {
    sepIdx++;
    const sepRow = wsC.getRow(sepIdx);
    const sepCell = sepRow.getCell(1);
    if (sepCell.value && typeof sepCell.value === 'string' && sepCell.value.trim().length > 2) {
      sepCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: PAL.white } };
      sepCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.midGray } };
      for (let c = 2; c <= cCols.length; c++) {
        sepRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.midGray } };
      }
    }
    sepIdx += pairGroups[pid].length;
  }

  wsC.views = [{ state: 'frozen', ySplit: 1 }];

  /* ════════════════════════════════════════════════════════════════════════
     HOJA 5: LEYENDA
     ════════════════════════════════════════════════════════════════════════ */
  const wsL = wb.addWorksheet('Leyenda', { properties: { tabColor: { argb: PAL.muted } } });
  wsL.columns = [{ width: 14 }, { width: 40 }, { width: 6 }];

  // Title
  wsL.mergeCells('A1:C1');
  const legTitle = wsL.getCell('A1');
  legTitle.value = 'Leyenda del Diagrama de Gantt';
  legTitle.font = { name: 'Calibri', size: 12, bold: true, color: { argb: PAL.white } };
  legTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PAL.black } };
  legTitle.alignment = ALIGN_L;
  wsL.getRow(1).height = 30;

  const legends = [
    { color: PAL.yellow, label: 'Excavación',             desc: 'Días de excavación del fuste (por pareja)' },
    { color: PAL.orange, label: 'Campana + Acero',        desc: 'Excavación campana e instalación de acero' },
    { color: PAL.sage,   label: 'Vaciado',                desc: 'Vaciado de concreto ciclópeo' },
    { color: PAL.red,    label: 'Vaciado (ruta crítica)',  desc: 'Vaciado en caisson de ruta crítica' },
  ];

  wsL.getRow(2).height = 8; // spacer

  legends.forEach((leg, i) => {
    const row = wsL.getRow(3 + i);
    row.height = 24;
    const colorCell = row.getCell(3);
    colorCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: leg.color } };
    colorCell.border = BORDER_THIN;

    row.getCell(1).value = leg.label;
    row.getCell(1).font = FONT_CELL_B;
    row.getCell(1).border = BORDER_THIN;

    row.getCell(2).value = leg.desc;
    row.getCell(2).font = FONT_CELL;
    row.getCell(2).border = BORDER_THIN;
  });

  const extraRow = 3 + legends.length + 1;
  wsL.getRow(extraRow).height = 8;
  const extras = [
    ['S3 (10m)', 'Caisson sacrificio grupo 3 — profundidad total 10.0 m'],
    ['S15 (8.5m)', 'Caisson sacrificio grupo 15 — profundidad total 8.5 m'],
    ['Bloqueado', 'Caisson bloqueado por roca (requiere compresor)'],
    ['Holgura', 'Días de holgura total disponibles antes de afectar fin de obra'],
  ];
  extras.forEach((ex, i) => {
    const row = wsL.getRow(extraRow + 1 + i);
    row.height = 20;
    row.getCell(1).value = ex[0];
    row.getCell(1).font = FONT_CELL_B;
    row.getCell(1).border = BORDER_THIN;
    row.getCell(2).value = ex[1];
    row.getCell(2).font = FONT_CELL;
    row.getCell(2).border = BORDER_THIN;
  });

  /* ════════════════════════════════════════════════════════════════════════
     DESCARGAR
     ════════════════════════════════════════════════════════════════════════ */
  const buf = await wb.xlsx.writeBuffer();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Programacion_Gantt_${dateStr}.xlsx`);
}
