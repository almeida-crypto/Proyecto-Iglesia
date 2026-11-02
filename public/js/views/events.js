import { api, qs } from '../api.js';
import { esc, icon, fmtDate, fmtDateLong, fmtMonth, field, input, select, textarea, memberPicker, modal, toast, confirmDialog, empty, badge, pageHead, today, TYPE_COLORS } from '../ui.js';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let refs = null;
async function loadRefs() {
  refs ||= Promise.all([api('/ministries'), api('/members?status=active')]).then(([ministries, members]) => ({ ministries, members }));
  return refs;
}

export async function openEventForm(ctx, event, { date, defaults = {}, onSaved } = {}) {
  refs = null;
  const { ministries, members } = await loadRefs();
  const e = event || { date: date || today(), type: 'culto', ...defaults };
  modal({
    title: event ? 'Editar evento' : 'Nuevo evento',
    wide: true,
    body: `<div class="form-grid">
      ${field('Título *', input('title', e.title, 'required maxlength="150"'), { full: true })}
      ${field('Tipo', select('type', Object.entries(ctx.meta.eventTypes), e.type))}
      ${field('Ministerio', select('ministry_id', [['', '— Ninguno —'], ...ministries.filter((m) => m.active || m.id === e.ministry_id).map((m) => [m.id, m.name])], e.ministry_id))}
      ${field('Fecha *', input('date', e.date, 'type="date" required'))}
      ${field('Hora', input('time', e.time, 'type="time"'))}
      ${field('Lugar', input('location', e.location, 'maxlength="150"'), { full: true })}
      ${field('Descripción', textarea('description', e.description, 'rows="3" maxlength="3000"'), { full: true })}
      ${memberPicker('responsibles', members, (e.responsibles || []).map((r) => r.id), 'Responsables')}
    </div>`,
    onSubmit: async (data) => {
      const saved = await api(event ? `/events/${event.id}` : '/events', { method: event ? 'PUT' : 'POST', body: data });
      toast(event ? 'Evento actualizado' : 'Evento creado');
      onSaved?.(saved);
    },
  });
}

export async function openEventDetail(ctx, id, onChange) {
  const e = await api(`/events/${id}`);
  const canWrite = ctx.can('events.write');
  const cancelled = e.status === 'cancelado';
  const { close } = modal({
    title: e.title,
    wide: true,
    body: `
      <div class="event-detail">
        <div class="chips">${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])} ${cancelled ? badge('Cancelado', 'red') : badge('Programado', 'green')}</div>
        <div class="info-grid">
          <div class="info"><span>Fecha</span><strong>${esc(fmtDateLong(e.date))}</strong></div>
          <div class="info"><span>Hora</span><strong>${esc(e.time || '—')}</strong></div>
          <div class="info"><span>Lugar</span><strong>${esc(e.location || '—')}</strong></div>
          <div class="info"><span>Ministerio</span><strong>${e.ministry_name ? `<a href="#/ministerios/${e.ministry_id}">${esc(e.ministry_name)}</a>` : '—'}</strong></div>
          <div class="info"><span>Responsables</span><strong>${e.responsibles.length ? e.responsibles.map((r) => esc(r.name)).join(', ') : '—'}</strong></div>
          <div class="info"><span>Asistencia</span><strong>${e.attendance_count ? `${e.present_count} de ${e.attendance_count}` : 'Sin registrar'}</strong></div>
        </div>
        ${e.description ? `<p class="notes">${esc(e.description)}</p>` : ''}
        <div class="modal-actions">
          ${ctx.can('attendance.write') && !cancelled ? `<a class="btn" href="#/asistencia?tab=registrar&evento=${e.id}&fecha=${e.date}">${icon('check')} Registrar asistencia</a>` : ''}
          ${canWrite ? `<button type="button" class="btn" data-act="edit">${icon('edit')} Editar</button>
          <button type="button" class="btn ${cancelled ? '' : 'danger'}" data-act="status">${icon('power')} ${cancelled ? 'Reactivar' : 'Cancelar evento'}</button>` : ''}
        </div>
      </div>`,
    onOpen: (wrap, closeModal) => {
      wrap.querySelector('[data-act=edit]')?.addEventListener('click', () => {
        closeModal();
        openEventForm(ctx, e, { onSaved: onChange });
      });
      wrap.querySelector('[data-act=status]')?.addEventListener('click', async () => {
        closeModal();
        if (!(await confirmDialog(cancelled ? `¿Reactivar "${e.title}"?` : `¿Cancelar "${e.title}"? Se conservará en el historial.`, cancelled ? 'Reactivar' : 'Cancelar evento'))) return;
        await api(`/events/${e.id}/status`, { method: 'PATCH', body: { status: cancelled ? 'programado' : 'cancelado' } });
        toast(cancelled ? 'Evento reactivado' : 'Evento cancelado');
        onChange?.();
      });
      wrap.querySelector('a.btn')?.addEventListener('click', () => closeModal());
    },
  });
  return close;
}

export async function render(el, ctx) {
  const canWrite = ctx.can('events.write');
  let mode = ctx.query.vista === 'lista' ? 'lista' : 'calendario';
  let month = /^\d{4}-\d{2}$/.test(ctx.query.mes || '') ? ctx.query.mes : today().slice(0, 7);
  const filters = { when: 'upcoming', type: '', status: '' };

  el.innerHTML = `
    ${pageHead('Eventos', 'Cultos, reuniones, actividades y eventos administrativos', `
      <div class="segmented" id="mode"><button data-v="calendario">${icon('calendar')} Calendario</button><button data-v="lista">${icon('list')} Lista</button></div>
      ${canWrite ? `<button class="btn primary" id="new">${icon('plus')} Nuevo evento</button>` : ''}`)}
    <div class="card" id="body"></div>`;
  const body = el.querySelector('#body');

  const reload = () => (mode === 'calendario' ? renderCalendar() : renderList());

  async function renderCalendar() {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    const events = await api(`/events${qs({ from: iso(cells[0]), to: iso(cells[41]) })}`);
    const byDay = {};
    events.forEach((e) => (byDay[e.date] ||= []).push(e));
    const t = today();

    body.innerHTML = `
      <div class="cal-head">
        <button class="icon-btn" data-nav="-1" aria-label="Mes anterior">${icon('left')}</button>
        <h2>${esc(fmtMonth(month))}</h2>
        <button class="icon-btn" data-nav="1" aria-label="Mes siguiente">${icon('right')}</button>
        <button class="btn sm" data-nav="0">Hoy</button>
        <div class="grow"></div>
        <div class="legend">${Object.entries(ctx.meta.eventTypes).map(([k, l]) => `<span><i class="dot ${TYPE_COLORS[k]}"></i>${esc(l)}</span>`).join('')}</div>
      </div>
      <div class="calendar">
        ${DAYS.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
        ${cells.map((d) => {
          const key = iso(d);
          const list = byDay[key] || [];
          return `<div class="cal-cell ${d.getMonth() !== m - 1 ? 'other' : ''} ${key === t ? 'today' : ''} ${canWrite ? 'clickable' : ''}" data-day="${key}">
            <span class="cal-num">${d.getDate()}</span>
            ${list.slice(0, 3).map((e) => `<button class="cal-ev ${TYPE_COLORS[e.type]} ${e.status === 'cancelado' ? 'cancelled' : ''}" data-ev="${e.id}" title="${esc(e.title)}">${e.time ? `<b>${esc(e.time)}</b> ` : ''}${esc(e.title)}</button>`).join('')}
            ${list.length > 3 ? `<button class="cal-more" data-more="${key}">+${list.length - 3} más</button>` : ''}
          </div>`;
        }).join('')}
      </div>`;

    body.onclick = (e) => {
      const nav = e.target.closest('[data-nav]');
      const ev = e.target.closest('[data-ev]');
      const more = e.target.closest('[data-more]');
      const day = e.target.closest('[data-day]');
      if (nav) {
        const dir = Number(nav.dataset.nav);
        const d = dir === 0 ? new Date() : new Date(y, m - 1 + dir, 1);
        month = iso(d).slice(0, 7);
        return renderCalendar();
      }
      if (ev) return openEventDetail(ctx, ev.dataset.ev, reload);
      if (more) {
        const list = byDay[more.dataset.more];
        return modal({
          title: fmtDateLong(more.dataset.more),
          body: `<ul class="event-list">${list.map((x) => `<li><button class="link" data-open="${x.id}">${x.time ? `${esc(x.time)} · ` : ''}${esc(x.title)}</button> ${badge(ctx.meta.eventTypes[x.type], TYPE_COLORS[x.type])}</li>`).join('')}</ul>`,
          onOpen: (wrap, close) => wrap.addEventListener('click', (ce) => {
            const o = ce.target.closest('[data-open]');
            if (o) { close(); openEventDetail(ctx, o.dataset.open, reload); }
          }),
        });
      }
      if (day && canWrite) openEventForm(ctx, null, { date: day.dataset.day, onSaved: reload });
    };
  }

  async function renderList() {
    const t = today();
    const range = filters.when === 'upcoming' ? { from: t } : filters.when === 'past' ? { to: t, order: 'desc' } : { order: 'desc' };
    const rows = await api(`/events${qs({ ...range, type: filters.type, status: filters.status })}`);
    body.innerHTML = `
      <div class="toolbar wrap">
        <div class="segmented" id="when">
          ${[['upcoming', 'Próximos'], ['past', 'Pasados'], ['all', 'Todos']].map(([k, l]) => `<button data-v="${k}" class="${filters.when === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
        ${select('type', [['', 'Todos los tipos'], ...Object.entries(ctx.meta.eventTypes)], filters.type, 'id="f-type"')}
        ${select('status', [['', 'Todos los estados'], ['programado', 'Programados'], ['cancelado', 'Cancelados']], filters.status, 'id="f-status"')}
      </div>
      ${rows.length
        ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Evento</th><th>Tipo</th><th>Lugar</th><th>Responsables</th><th>Estado</th></tr></thead><tbody>
            ${rows.map((e) => `<tr class="clickable ${e.status === 'cancelado' ? 'muted-row' : ''}" data-ev="${e.id}">
              <td>${fmtDate(e.date)}</td><td>${esc(e.time || '—')}</td>
              <td class="strong">${esc(e.title)}${e.ministry_name ? `<br><span class="muted small">${esc(e.ministry_name)}</span>` : ''}</td>
              <td>${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])}</td>
              <td>${esc(e.location || '—')}</td>
              <td>${e.responsibles.length ? esc(e.responsibles.map((r) => r.name).join(', ')) : '—'}</td>
              <td>${e.status === 'cancelado' ? badge('Cancelado', 'red') : badge('Programado', 'green')}</td>
            </tr>`).join('')}
          </tbody></table></div>`
        : empty('No hay eventos con estos filtros.')}`;
    body.onclick = (e) => {
      const when = e.target.closest('#when button');
      if (when) { filters.when = when.dataset.v; return renderList(); }
      const row = e.target.closest('[data-ev]');
      if (row) openEventDetail(ctx, row.dataset.ev, reload);
    };
    body.querySelector('#f-type').onchange = (e) => { filters.type = e.target.value; renderList(); };
    body.querySelector('#f-status').onchange = (e) => { filters.status = e.target.value; renderList(); };
  }

  const setMode = (m) => {
    mode = m;
    el.querySelectorAll('#mode button').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
    return reload();
  };
  el.querySelector('#mode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.v);
  });
  el.querySelector('#new')?.addEventListener('click', () => openEventForm(ctx, null, { onSaved: reload }));
  await setMode(mode);
}
