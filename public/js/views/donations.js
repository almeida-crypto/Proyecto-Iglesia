import { api, qs, download } from '../api.js';
import { esc, icon, fmtDate, fmtMonth, fmtMonthShort, field, input, select, modal, toast, confirmDialog, empty, badge, pageHead, today, monthStart, monthEnd, money, chart, CHART_COLORS } from '../ui.js';

export async function render(el, ctx) {
  const canWrite = ctx.can('finances.write');
  const currency = ctx.settings?.currency || 'USD';
  const fmt = (c) => money(c, currency);
  const { concepts, methods } = ctx.meta;
  let month = today().slice(0, 7);
  const filters = { from: monthStart(), to: monthEnd(month), concept: '', method: '' };
  let rows = [];
  let trendChart = null;

  el.innerHTML = `
    ${pageHead('Aportaciones y donaciones', 'Información financiera de acceso restringido', canWrite ? `<button class="btn primary" id="new">${icon('plus')} Registrar aportación</button>` : '')}
    <div class="card">
      <div class="card-head">
        <h2>Resumen mensual</h2>
        <label class="field inline"><span>Mes</span><input type="month" id="month" value="${month}"></label>
      </div>
      <div id="summary"></div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Registros</h2>
        <div class="actions"><button class="btn sm" data-dl="pdf">${icon('download')} PDF</button><button class="btn sm" data-dl="xlsx">${icon('download')} Excel</button></div></div>
      <div class="toolbar wrap">
        <label class="field inline"><span>Desde</span><input type="date" id="from" value="${filters.from}"></label>
        <label class="field inline"><span>Hasta</span><input type="date" id="to" value="${filters.to}"></label>
        ${select('concept', [['', 'Todos los conceptos'], ...Object.entries(concepts)], '', 'id="f-concept"')}
        ${select('method', [['', 'Todos los métodos'], ...Object.entries(methods)], '', 'id="f-method"')}
      </div>
      <div id="list"></div>
    </div>`;

  const breakdown = (items, labels, total) =>
    items.length
      ? `<ul class="breakdown">${items.map((x, i) => `
          <li><div class="breakdown-row"><span><i class="dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></i>${esc(labels[x.key] || x.key)}</span>
            <strong>${fmt(x.total)}</strong></div>
            <div class="bar"><div style="width:${total ? (x.total / total) * 100 : 0}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div></div></li>`).join('')}</ul>`
      : '<p class="muted">Sin registros.</p>';

  async function loadSummary() {
    const s = await api(`/donations/summary${qs({ month })}`);
    const diff = s.previous_total ? Math.round(((s.total - s.previous_total) / s.previous_total) * 100) : null;
    el.querySelector('#summary').innerHTML = `
      <div class="stats compact">
        <div class="stat pink"><div><span class="stat-label">Total de ${esc(fmtMonth(month))}</span><strong class="stat-value">${fmt(s.total)}</strong>
          <span class="stat-sub">${diff === null ? 'Sin datos del mes anterior' : `${diff >= 0 ? '+' : ''}${diff}% vs. mes anterior (${fmt(s.previous_total)})`}</span></div></div>
        <div class="stat"><div><span class="stat-label">Registros</span><strong class="stat-value">${s.count}</strong><span class="stat-sub">${s.anonymous} anónimos</span></div></div>
        <div class="stat green"><div><span class="stat-label">Promedio por registro</span><strong class="stat-value">${fmt(s.count ? Math.round(s.total / s.count) : 0)}</strong></div></div>
      </div>
      <div class="grid-3">
        <div><h3>Por concepto</h3>${breakdown(s.by_concept, concepts, s.total)}</div>
        <div><h3>Por método de recepción</h3>${breakdown(s.by_method, methods, s.total)}</div>
        <div><h3>Últimos 12 meses</h3><div class="chart-box short"><canvas id="trend"></canvas></div></div>
      </div>`;
    trendChart?.destroy();
    trendChart = chart(el.querySelector('#trend'), {
      type: 'bar',
      data: { labels: s.trend.map((t) => fmtMonthShort(t.period)), datasets: [{ data: s.trend.map((t) => t.total / 100), backgroundColor: s.trend.map((t) => (t.period === month ? CHART_COLORS[3] : CHART_COLORS[0])), borderRadius: 4 }] },
      options: { scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: (c) => fmt(c.raw * 100) } } } },
    });
  }

  async function loadList() {
    const data = await api(`/donations${qs(filters)}`);
    rows = data.rows;
    el.querySelector('#list').innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Método</th><th>Aportante</th><th>Notas</th><th class="num">Monto</th>${canWrite ? '<th></th>' : ''}</tr></thead>
          <tbody>${rows.map((d) => `<tr>
            <td>${fmtDate(d.date)}</td><td>${esc(concepts[d.concept] || d.concept)}</td><td>${esc(methods[d.method] || d.method)}</td>
            <td>${d.member_name ? esc(d.member_name) : badge('Anónimo', 'gray')}</td>
            <td class="muted">${esc(d.notes || '')}</td>
            <td class="num strong">${fmt(d.amount_cents)}</td>
            ${canWrite ? `<td class="row-actions"><button class="icon-btn" data-edit="${d.id}" title="Editar">${icon('edit')}</button>
              <button class="icon-btn danger" data-del="${d.id}" title="Eliminar">${icon('trash')}</button></td>` : ''}
          </tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="5">Total (${rows.length} registros)</td><td class="num">${fmt(data.total)}</td>${canWrite ? '<td></td>' : ''}</tr></tfoot>
        </table></div>`
      : empty('No hay aportaciones con estos filtros.');
  }

  const refresh = () => Promise.all([loadSummary(), loadList()]);

  async function openForm(d) {
    const members = await api('/members?status=all');
    modal({
      title: d ? 'Editar aportación' : 'Registrar aportación',
      body: `<div class="form-grid">
        ${field('Fecha *', input('date', d?.date || today(), 'type="date" required'))}
        ${field(`Monto (${currency}) *`, input('amount', d ? (d.amount_cents / 100).toFixed(2) : '', 'type="number" step="0.01" min="0.01" inputmode="decimal" required'))}
        ${field('Concepto *', select('concept', Object.entries(concepts), d?.concept || 'diezmo'))}
        ${field('Método de recepción *', select('method', Object.entries(methods), d?.method || 'efectivo'))}
        ${field('Aportante', select('member_id', [['', 'Anónimo / sin asociar'], ...members.map((m) => [m.id, m.name + (m.active ? '' : ' (inactivo)')])], d?.member_id || ''), { full: true, hint: 'Puede dejarse anónimo.' })}
        ${field('Notas', input('notes', d?.notes, 'maxlength="500"'), { full: true })}
      </div>`,
      onSubmit: async (data) => {
        await api(d ? `/donations/${d.id}` : '/donations', { method: d ? 'PUT' : 'POST', body: data });
        toast(d ? 'Aportación actualizada' : 'Aportación registrada');
        refresh();
      },
    });
  }

  el.querySelector('#new')?.addEventListener('click', () => openForm(null));
  el.querySelector('#month').addEventListener('change', (e) => {
    if (!e.target.value) return;
    month = e.target.value;
    filters.from = `${month}-01`;
    filters.to = monthEnd(month);
    el.querySelector('#from').value = filters.from;
    el.querySelector('#to').value = filters.to;
    refresh();
  });
  el.querySelector('#from').addEventListener('change', (e) => { filters.from = e.target.value; loadList(); });
  el.querySelector('#to').addEventListener('change', (e) => { filters.to = e.target.value; loadList(); });
  el.querySelector('#f-concept').addEventListener('change', (e) => { filters.concept = e.target.value; loadList(); });
  el.querySelector('#f-method').addEventListener('change', (e) => { filters.method = e.target.value; loadList(); });
  el.querySelector('#list').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) openForm(rows.find((d) => d.id === Number(edit.dataset.edit)));
    if (del) {
      const d = rows.find((x) => x.id === Number(del.dataset.del));
      if (!(await confirmDialog(`¿Eliminar la aportación de ${fmt(d.amount_cents)} del ${fmtDate(d.date)}? Esta acción no se puede deshacer.`, 'Eliminar'))) return;
      await api(`/donations/${d.id}`, { method: 'DELETE' });
      toast('Aportación eliminada');
      refresh();
    }
  });
  el.querySelectorAll('[data-dl]').forEach((b) =>
    b.addEventListener('click', () =>
      download(`/reports/ingresos${qs({ from: filters.from, to: filters.to, format: b.dataset.dl })}`).catch((err) => toast(err.message, 'error'))
    )
  );
  await refresh();
  return () => trendChart?.destroy();
}
