// Convierte un reporte genérico { title, subtitle, columns, rows, totals } en Excel o PDF.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { get, UPLOADS_DIR } = require('./db');

const CURRENCY_LOCALES = { MXN: 'es-MX', USD: 'es-US', COP: 'es-CO', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', GTQ: 'es-GT', DOP: 'es-DO', EUR: 'es-ES' };
const church = () => get('SELECT name, logo, address, phone, email, currency FROM settings WHERE id = 1');
const generatedAt = () => new Date().toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });

function formatValue(value, type, currency) {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
      return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'es', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value / 100);
    case 'date': {
      const [y, m, d] = String(value).split('-');
      return `${d}/${m}/${y}`;
    }
    case 'percent':
      return `${Math.round(value)}%`;
    case 'number':
      return new Intl.NumberFormat('es').format(value);
    default:
      return String(value);
  }
}

const alignFor = (type) => (['money', 'number', 'percent'].includes(type) ? 'right' : 'left');

async function toXlsx(report, res) {
  const info = church();
  const wb = new ExcelJS.Workbook();
  wb.creator = info.name;
  const ws = wb.addWorksheet('Reporte');
  const n = report.columns.length;

  const banner = (row, value, font) => {
    ws.mergeCells(row, 1, row, n);
    const cell = ws.getCell(row, 1);
    cell.value = value;
    cell.font = font;
  };
  banner(1, info.name, { bold: true, size: 14, color: { argb: 'FF6E1A26' } });
  banner(2, report.title, { bold: true, size: 12 });
  banner(3, [report.subtitle, `Generado: ${generatedAt()}`].filter(Boolean).join('  ·  '), { italic: true, size: 9, color: { argb: 'FF666666' } });

  const header = ws.getRow(5);
  report.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6E1A26' } };
    cell.alignment = { horizontal: alignFor(c.type) };
  });

  const writeRow = (rowNumber, data, bold = false) => {
    const row = ws.getRow(rowNumber);
    report.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const value = data[c.key];
      if (value === null || value === undefined || value === '') return;
      if (c.type === 'money') {
        cell.value = value / 100;
        cell.numFmt = '#,##0.00';
      } else if (c.type === 'date') {
        const [y, m, d] = String(value).split('-').map(Number);
        cell.value = new Date(Date.UTC(y, m - 1, d));
        cell.numFmt = 'dd/mm/yyyy';
      } else if (c.type === 'percent') {
        cell.value = value / 100;
        cell.numFmt = '0%';
      } else {
        cell.value = value;
      }
      if (bold) cell.font = { bold: true };
    });
  };

  let r = 6;
  for (const data of report.rows) writeRow(r++, data);
  if (report.totals) writeRow(r, report.totals, true);

  report.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(12, Math.round((c.width || 1) * 10));
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function toPdf(report, res) {
  const info = church();
  const cols = report.columns;
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: cols.length > 5 ? 'landscape' : 'portrait',
    margin: 40,
    bufferPages: true,
    info: { Title: report.title, Author: info.name },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}.pdf"`);
  doc.pipe(res);

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;

  // Encabezado con logotipo (pdfkit solo admite PNG y JPG).
  const logo = info.logo && /\.(png|jpe?g)$/i.test(info.logo) ? path.join(UPLOADS_DIR, path.basename(info.logo)) : null;
  let textX = left;
  if (logo && fs.existsSync(logo)) {
    try {
      doc.image(logo, left, top, { fit: [48, 48] });
      textX = left + 60;
    } catch {
      /* imagen ilegible: se omite */
    }
  }
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#6e1a26').text(info.name, textX, top, { width: width - (textX - left) });
  const contact = [info.address, info.phone, info.email].filter(Boolean).join('  ·  ');
  if (contact) doc.font('Helvetica').fontSize(9).fillColor('#666').text(contact, textX, doc.y + 2, { width: width - (textX - left) });

  doc.y = Math.max(doc.y, top + 50) + 12;
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).lineWidth(1).strokeColor('#d9c08a').stroke();
  doc.y += 10;
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#111').text(report.title, left, doc.y);
  if (report.subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555').text(report.subtitle, left);
  doc.font('Helvetica').fontSize(8).fillColor('#888').text(`Generado el ${generatedAt()}`, left);
  doc.moveDown(0.8);

  // Tabla
  const totalWeight = cols.reduce((s, c) => s + (c.width || 1), 0);
  const colW = cols.map((c) => ((c.width || 1) / totalWeight) * width);
  const bottom = () => doc.page.height - doc.page.margins.bottom - 10;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(left, y, width, 20).fill('#6e1a26');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#fff');
    let x = left;
    cols.forEach((c, i) => {
      doc.text(c.label, x + 4, y + 6, { width: colW[i] - 8, align: alignFor(c.type), lineBreak: false, ellipsis: true });
      x += colW[i];
    });
    doc.y = y + 20;
  };

  const drawRow = (data, { shade = false, bold = false } = {}) => {
    const cells = cols.map((c) => formatValue(data[c.key], c.type, info.currency));
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    const h = Math.max(18, ...cells.map((t, i) => doc.heightOfString(t, { width: colW[i] - 8 }) + 8));
    if (doc.y + h > bottom()) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
    }
    const y = doc.y;
    if (shade) doc.rect(left, y, width, h).fill('#faf5ec');
    if (bold) doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).strokeColor('#6e1a26').stroke();
    doc.fillColor('#222');
    let x = left;
    cells.forEach((t, i) => {
      doc.text(t, x + 4, y + 4, { width: colW[i] - 8, align: alignFor(cols[i].type) });
      x += colW[i];
    });
    doc.y = y + h;
  };

  drawHeader();
  if (!report.rows.length) {
    doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(10).fillColor('#666').text('No hay datos para los filtros seleccionados.', left);
  }
  report.rows.forEach((row, i) => drawRow(row, { shade: i % 2 === 1 }));
  if (report.totals) drawRow(report.totals, { bold: true });

  // Numeración de páginas (se quita el margen inferior para que pdfkit no agregue páginas).
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#888')
      .text(`Página ${i + 1} de ${pages.count}`, left, doc.page.height - 28, { width, align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
  doc.end();
}

module.exports = { toXlsx, toPdf };
