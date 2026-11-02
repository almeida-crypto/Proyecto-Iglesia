import { api, qs, download } from '../api.js';
import { esc, icon, fmtDate, select, toast, empty, pageHead, today, addDays, money } from '../ui.js';

const DEFS = [
  { key: 'miembros', title: 'Reporte general de miembros', desc: 'Listado completo con datos de contacto, ingreso y participación.', perm: 'members.read', filters: ['status'] },
  { key: 'asistencia', title: 'Asistencia por evento', desc: 'Resumen de asistencia de cada evento o detalle de un evento específico.', perm: 'attendance.read', filters: ['range', 'event'] },
  { key: 'asistencia-periodo', title: 'Asistencia semanal / mensual', desc: 'Totales y promedios agrupados por semana o por mes.', perm: 'attendance.read', filters: ['period', 'range'] },
  { key: 'ministerios', title: 'Participación por ministerio', desc: 'Integrantes, actividades y asistencia de cada ministerio.', perm: 'ministries.read', filters: ['range'] },
  { key: 'ingresos', title: 'Ingresos por periodo', desc: 'Aportaciones en detalle o agrupadas por mes, concepto o método.', perm: 'finances.read', filters: ['range', 'group'] },
];

function formatCell(value, type, currency) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'money') return money(value, currency);
  if (type === 'date') return fmtDate(value);
  if (type === 'percent') return `${Math.round(value)}%`;
  return esc(value);
}

export async function render(el, ctx) {
  const defs = DEFS.filter((d) => ctx.can(d.perm));
  const currency = ctx.settings?.currency || 'USD';
  let current = defs.find((d) => d.key === ctx.query.tipo) || defs[0];
  let events = null;

  el.innerHTML = `
    ${pageHead('Reportes', 'Consulte y exporte la información a PDF o Excel')}
    <div class="report-types">${defs.map((d) => `
      <button class="card report-type" data-key="${d.key}">${icon('file')}<div><strong>${esc(d.title)}</strong><span class="muted small">${esc(d.desc)}</span></div></button>`).join('')}
    </div>
    <div class="card" id="panel"></div>`;
  const panel = el.querySelector('#panel');

  async function renderPanel() {
    el.querySelectorAll('.report-type').forEach((b) => b.classList.toggle('on', b.dataset.key === current.key));
    const f = current.filters;
    if (f.includes('event') && !events) events = await api(`/events${qs({ to: today(), order: 'desc', limit: 200 })}`);
    panel.innerHTML = `
      <div class="card-head"><h2>${esc(current.title)}</h2></div>
      <form class="toolbar wrap" id="filters">
        ${f.includes('status') ? `<label class="field inline"><span>Estado</span>${select('status', [['all', 'Todos'], ['active', 'Activos'], ['inactive', 'Inactivos']], 'all')}</label>` : ''}
        ${f.includes('period') ? `<label class="field inline"><span>Agrupar</span>${select('period', [['week', 'Semanal'], ['month', 'Mensual']], 'month')}</label>` : ''}
        ${f.includes('range') ? `<label class="field inline"><span>Desde</span><input type="date" name="from" value="${addDays(today(), -90)}"></label>
          <label class="field inline"><span>Hasta</span><input type="date" name="to" value="${today()}"></label>` : ''}
        ${f.includes('event') ? `<label class="field inline grow"><span>Evento</span>${select('event_id', [['', 'Todos los eventos del periodo (resumen)'], ...events.map((e) => [e.id, `${fmtDate(e.date)} · ${e.title}`])], '')}</label>` : ''}
        ${f.includes('group') ? `<label class="field inline"><span>Vista</span>${select('group', [['detalle', 'Detalle'], ['mes', 'Por mes'], ['concepto', 'Por concepto'], ['metodo', 'Por método']], 'detalle')}</label>` : ''}
        <div class="grow"></div>
        <button type="submit" class="btn primary">${icon('eye')} Ver</button>
        <button type="button" class="btn" data-dl="pdf">${icon('download')} PDF</button>
        <button type="button" class="btn" data-dl="xlsx">${icon('download')} Excel</button>
      </form>
      <div id="preview"></div>`;

    const form = panel.querySelector('#filters');
    const params = () => Object.fromEntries(new FormData(form));
    const preview = async () => {
      const box = panel.querySelector('#preview');
      box.innerHTML = '<div class="loading">Generando…</div>';
      try {
        const r = await api(`/reports/${current.key}${qs(params())}`);
        const num = (c) => (['money', 'number', 'percent'].includes(c.type) ? 'num' : '');
        box.innerHTML = `
          <div class="report-meta"><strong>${esc(r.title)}</strong><span class="muted small">${esc(r.subtitle || '')}</span></div>
          ${r.rows.length
            ? `<div class="table-wrap"><table>
                <thead><tr>${r.columns.map((c) => `<th class="${num(c)}">${esc(c.label)}</th>`).join('')}</tr></thead>
                <tbody>${r.rows.map((row) => `<tr>${r.columns.map((c) => `<td class="${num(c)}">${formatCell(row[c.key], c.type, currency)}</td>`).join('')}</tr>`).join('')}</tbody>
                ${r.totals ? `<tfoot><tr>${r.columns.map((c) => `<td class="${num(c)}">${formatCell(r.totals[c.key], c.type, currency)}</td>`).join('')}</tr></tfoot>` : ''}
              </table></div>`
            : empty('No hay datos para los filtros seleccionados.')}`;
      } catch (err) {
        box.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      }
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      preview();
    });
    panel.querySelectorAll('[data-dl]').forEach((b) =>
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await download(`/reports/${current.key}${qs({ ...params(), format: b.dataset.dl })}`);
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          b.disabled = false;
        }
      })
    );
    preview();
  }

  el.querySelector('.report-types').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    current = defs.find((d) => d.key === b.dataset.key);
    renderPanel();
  });
  await renderPanel();
}
