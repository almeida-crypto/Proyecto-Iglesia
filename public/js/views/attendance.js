import { api, qs, download } from '../api.js';
import { esc, icon, norm, fmtDate, fmtDateTime, fmtMonth, field, input, select, modal, toast, empty, badge, pageHead, today, addDays, chart, CHART_COLORS, TYPE_COLORS } from '../ui.js';

export async function render(el, ctx) {
  const canWrite = ctx.can('attendance.write');
  const tabs = [...(canWrite ? [['registrar', 'Registrar asistencia']] : []), ['historial', 'Historial'], ['resumen', 'Resumen semanal / mensual']];
  const tab = tabs.some(([k]) => k === ctx.query.tab) ? ctx.query.tab : tabs[0][0];

  el.innerHTML = `
    ${pageHead('Control de asistencia', 'Asistencia a cultos, reuniones y actividades')}
    <div class="tabs">${tabs.map(([k, l]) => `<a href="#/asistencia?tab=${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div id="tab"></div>`;
  const box = el.querySelector('#tab');
  if (tab === 'historial') return history(box, ctx);
  if (tab === 'resumen') return summary(box, ctx);
  return register(box, ctx);
}

// ---------- Registrar ----------
async function register(box, ctx) {
  let date = ctx.query.fecha || today();
  let eventId = Number(ctx.query.evento) || null;
  let events = [];

  box.innerHTML = `
    <div class="card">
      <div class="toolbar wrap">
        <label class="field inline"><span>Fecha</span><input type="date" id="date" value="${esc(date)}"></label>
        <label class="field inline grow"><span>Evento</span><select id="event"></select></label>
        ${ctx.can('events.write') ? `<button class="btn" id="quick">${icon('plus')} Crear evento en esta fecha</button>` : ''}
      </div>
      <div id="sheet"></div>
    </div>`;
  const sheet = box.querySelector('#sheet');
  const eventSelect = box.querySelector('#event');

  async function loadEvents() {
    events = await api(`/events${qs({ from: date, to: date, status: 'programado' })}`);
    eventSelect.innerHTML = events.length
      ? events.map((e) => `<option value="${e.id}">${esc(e.title)}${e.time ? ` · ${e.time}` : ''} (${esc(ctx.meta.eventTypes[e.type])})</option>`).join('')
      : '<option value="">Sin eventos en esta fecha</option>';
    eventSelect.disabled = !events.length;
    if (!events.length) {
      eventId = null;
      sheet.innerHTML = empty('No hay eventos programados para esta fecha. Seleccione otra fecha o cree un evento.');
      return;
    }
    if (!events.some((e) => e.id === eventId)) eventId = events[0].id;
    eventSelect.value = eventId;
    await loadSheet();
  }

  async function loadSheet() {
    sheet.innerHTML = '<div class="loading">Cargando…</div>';
    const data = await api(`/attendance/event/${eventId}`);
    const e = data.event;
    sheet.innerHTML = `
      <div class="sheet-head">
        <div><strong>${esc(e.title)}</strong> ${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])}
          <span class="muted small">${fmtDate(e.date)}${e.time ? ` · ${esc(e.time)}` : ''}${e.location ? ` · ${esc(e.location)}` : ''}</span></div>
        <div class="counter"><span class="present-count">0</span> presentes · <span class="absent-count">0</span> ausentes</div>
      </div>
      <div class="toolbar wrap">
        <div class="search">${icon('search')}<input type="search" id="filter" placeholder="Filtrar miembros…"></div>
        <button class="btn sm" data-all="1">Todos presentes</button>
        <button class="btn sm" data-all="0">Todos ausentes</button>
      </div>
      ${data.members.length
        ? `<div class="att-list">${data.members.map((m) => `
            <label class="att-item ${m.present === 1 ? 'present' : ''}" data-name="${esc(norm(m.name))}">
              <input type="checkbox" value="${m.id}" ${m.present === 1 ? 'checked' : ''}>
              <span class="att-name">${esc(m.name)}${m.active ? '' : ` ${badge('inactivo', 'gray')}`}</span>
              <span class="att-state"></span>
            </label>`).join('')}</div>`
        : empty('No hay miembros activos registrados.')}
      <div class="sheet-foot">
        <span class="muted small">${data.recorded ? `Última actualización: ${fmtDateTime(data.last_update)}` : 'Aún no se ha registrado la asistencia de este evento.'}</span>
        <button class="btn primary" id="save" ${data.members.length ? '' : 'disabled'}>Guardar asistencia</button>
      </div>`;

    const boxes = [...sheet.querySelectorAll('.att-item input')];
    const counts = () => {
      const present = boxes.filter((b) => b.checked).length;
      sheet.querySelector('.present-count').textContent = present;
      sheet.querySelector('.absent-count').textContent = boxes.length - present;
    };
    counts();
    sheet.addEventListener('change', (ev) => {
      if (ev.target.matches('.att-item input')) {
        ev.target.closest('.att-item').classList.toggle('present', ev.target.checked);
        counts();
      }
    });
    sheet.querySelector('#filter').addEventListener('input', (ev) => {
      const q = norm(ev.target.value);
      sheet.querySelectorAll('.att-item').forEach((it) => (it.hidden = !it.dataset.name.includes(q)));
    });
    sheet.querySelectorAll('[data-all]').forEach((b) =>
      b.addEventListener('click', () => {
        boxes.forEach((x) => {
          x.checked = b.dataset.all === '1';
          x.closest('.att-item').classList.toggle('present', x.checked);
        });
        counts();
      })
    );
    sheet.querySelector('#save').addEventListener('click', async (ev) => {
      ev.target.disabled = true;
      try {
        const r = await api(`/attendance/event/${eventId}`, {
          method: 'PUT',
          body: { records: boxes.map((b) => ({ member_id: Number(b.value), present: b.checked })) },
        });
        toast(`Asistencia guardada: ${r.present} presentes, ${r.absent} ausentes`);
        loadSheet();
      } catch (err) {
        toast(err.message, 'error');
        ev.target.disabled = false;
      }
    });
  }

  box.querySelector('#date').addEventListener('change', (ev) => {
    date = ev.target.value || today();
    eventId = null;
    loadEvents();
  });
  eventSelect.addEventListener('change', () => {
    eventId = Number(eventSelect.value);
    loadSheet();
  });
  box.querySelector('#quick')?.addEventListener('click', () =>
    modal({
      title: `Nuevo evento · ${fmtDate(date)}`,
      body: `<div class="form-grid">
        ${field('Título *', input('title', 'Culto', 'required maxlength="150"'), { full: true })}
        ${field('Tipo', select('type', Object.entries(ctx.meta.eventTypes), 'culto'))}
        ${field('Hora', input('time', '', 'type="time"'))}
        ${field('Lugar', input('location', '', 'maxlength="150"'), { full: true })}
      </div>`,
      submitLabel: 'Crear evento',
      onSubmit: async (data) => {
        const ev = await api('/events', { method: 'POST', body: { ...data, date } });
        eventId = ev.id;
        toast('Evento creado');
        loadEvents();
      },
    })
  );
  await loadEvents();
}

// ---------- Historial ----------
async function history(box, ctx) {
  const members = await api('/members?status=all');
  let from = addDays(today(), -60);
  let to = today();
  let memberId = '';

  box.innerHTML = `
    <div class="card">
      <div class="toolbar wrap">
        <label class="field inline"><span>Desde</span><input type="date" id="from" value="${from}"></label>
        <label class="field inline"><span>Hasta</span><input type="date" id="to" value="${to}"></label>
        <label class="field inline grow"><span>Miembro</span>
          ${select('member', [['', 'Todos los eventos (resumen)'], ...members.map((m) => [m.id, m.name + (m.active ? '' : ' (inactivo)')])], '', 'id="member"')}</label>
      </div>
      <div id="result"></div>
    </div>`;
  const result = box.querySelector('#result');

  async function load() {
    result.innerHTML = '<div class="loading">Cargando…</div>';
    const rows = await api(`/attendance/history${qs({ from, to, member_id: memberId })}`);
    if (!rows.length) {
      result.innerHTML = empty('No hay asistencia registrada en este periodo.');
      return;
    }
    if (memberId) {
      const present = rows.filter((r) => r.present).length;
      result.innerHTML = `
        <div class="mini-stats"><div><strong>${present}</strong><span>asistencias</span></div>
          <div><strong>${rows.length - present}</strong><span>ausencias</span></div>
          <div><strong>${Math.round((present / rows.length) * 100)}%</strong><span>asistencia</span></div></div>
        <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.title)}</td><td>${badge(ctx.meta.eventTypes[r.type], TYPE_COLORS[r.type])}</td>
            <td>${r.present ? badge('Presente', 'green') : badge('Ausente', 'red')}</td></tr>`).join('')}
        </tbody></table></div>`;
      return;
    }
    result.innerHTML = `
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Tipo</th><th class="num">Presentes</th><th class="num">Ausentes</th><th>% Asistencia</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr>
          <td>${fmtDate(r.date)}${r.time ? ` <span class="muted small">${esc(r.time)}</span>` : ''}</td>
          <td class="strong">${esc(r.title)}</td>
          <td>${badge(ctx.meta.eventTypes[r.type], TYPE_COLORS[r.type])}</td>
          <td class="num">${r.present}</td><td class="num">${r.absent}</td>
          <td><div class="bar"><div style="width:${r.rate}%"></div></div><span class="small">${r.rate}%</span></td>
          <td class="row-actions">
            <button class="icon-btn" data-view="${r.id}" title="Ver detalle">${icon('eye')}</button>
            ${ctx.can('attendance.write') ? `<a class="icon-btn" href="#/asistencia?tab=registrar&evento=${r.id}&fecha=${r.date}" title="Editar">${icon('edit')}</a>` : ''}
          </td></tr>`).join('')}
      </tbody></table></div>`;
  }

  result.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    const data = await api(`/attendance/event/${b.dataset.view}`);
    const present = data.members.filter((m) => m.present === 1);
    const absent = data.members.filter((m) => m.present === 0);
    const list = (items) => (items.length ? `<ul class="name-list">${items.map((m) => `<li>${esc(m.name)}</li>`).join('')}</ul>` : '<p class="muted">Ninguno</p>');
    modal({
      title: `${data.event.title} · ${fmtDate(data.event.date)}`,
      wide: true,
      body: `<div class="grid-2 tight"><div><h3>Presentes (${present.length})</h3>${list(present)}</div><div><h3>Ausentes (${absent.length})</h3>${list(absent)}</div></div>`,
    });
  });
  box.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; load(); });
  box.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; load(); });
  box.querySelector('#member').addEventListener('change', (e) => { memberId = e.target.value; load(); });
  await load();
}

// ---------- Resumen semanal / mensual ----------
async function summary(box, ctx) {
  let period = 'week';
  let from = addDays(today(), -90);
  let to = today();
  let instance = null;

  box.innerHTML = `
    <div class="card">
      <div class="toolbar wrap">
        <div class="segmented" id="period"><button data-v="week" class="on">Semanal</button><button data-v="month">Mensual</button></div>
        <label class="field inline"><span>Desde</span><input type="date" id="from" value="${from}"></label>
        <label class="field inline"><span>Hasta</span><input type="date" id="to" value="${to}"></label>
        <div class="grow"></div>
        <button class="btn sm" data-dl="pdf">${icon('download')} PDF</button>
        <button class="btn sm" data-dl="xlsx">${icon('download')} Excel</button>
      </div>
      <div class="chart-box"><canvas id="chart"></canvas></div>
      <div id="table"></div>
    </div>`;

  const label = (p) => (period === 'week' ? `Semana del ${fmtDate(p)}` : fmtMonth(p));

  async function load() {
    const rows = await api(`/attendance/summary${qs({ period, from, to })}`);
    instance?.destroy();
    instance = chart(box.querySelector('#chart'), {
      type: 'bar',
      data: {
        labels: rows.map((r) => (period === 'week' ? fmtDate(r.period) : fmtMonth(r.period))),
        datasets: [
          { label: 'Presentes', data: rows.map((r) => r.present), backgroundColor: CHART_COLORS[0], borderRadius: 6 },
          { label: 'Ausentes', data: rows.map((r) => r.absent), backgroundColor: '#cbd2e1', borderRadius: 6 },
        ],
      },
      options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: true, position: 'bottom' } } },
    });
    box.querySelector('#table').innerHTML = rows.length
      ? `<div class="table-wrap"><table><thead><tr><th>Periodo</th><th class="num">Eventos</th><th class="num">Presentes</th><th class="num">Ausentes</th><th class="num">Promedio por evento</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td class="strong">${esc(label(r.period))}</td><td class="num">${r.events}</td><td class="num">${r.present}</td><td class="num">${r.absent}</td><td class="num">${r.average}</td></tr>`).join('')}
        </tbody></table></div>`
      : empty('No hay asistencia registrada en este periodo.');
  }

  box.querySelector('#period').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    period = b.dataset.v;
    box.querySelectorAll('#period button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  box.querySelector('#from').addEventListener('change', (e) => { from = e.target.value; load(); });
  box.querySelector('#to').addEventListener('change', (e) => { to = e.target.value; load(); });
  box.querySelectorAll('[data-dl]').forEach((b) =>
    b.addEventListener('click', () => download(`/reports/asistencia-periodo${qs({ period, from, to, format: b.dataset.dl })}`).catch((err) => toast(err.message, 'error')))
  );
  await load();
  return () => instance?.destroy();
}
