import { api } from '../api.js';
import { esc, icon, fmtDate, field, input, select, textarea, checkbox, memberPicker, modal, toast, empty, badge, pageHead, TYPE_COLORS } from '../ui.js';
import { openEventDetail, openEventForm } from './events.js';

async function openMinistryForm(ministry, onSaved) {
  const members = await api('/members?status=active');
  const m = ministry || { active: 1 };
  modal({
    title: ministry ? 'Editar ministerio' : 'Nuevo ministerio',
    body: `<div class="form-grid">
      ${field('Nombre *', input('name', m.name, 'required maxlength="100" placeholder="Ej. Música, Jóvenes, Niños…"'), { full: true })}
      ${field('Descripción', textarea('description', m.description, 'rows="3" maxlength="1000"'), { full: true })}
      ${field('Coordinador', select('coordinator_id', [['', '— Sin asignar —'], ...members.map((x) => [x.id, x.name])], m.coordinator_id), { full: true, hint: 'El coordinador se agrega automáticamente como integrante.' })}
      ${ministry ? checkbox('active', 'Ministerio activo', m.active) : ''}
    </div>`,
    onSubmit: async (data) => {
      const saved = await api(ministry ? `/ministries/${ministry.id}` : '/ministries', { method: ministry ? 'PUT' : 'POST', body: data });
      toast(ministry ? 'Ministerio actualizado' : 'Ministerio creado');
      onSaved?.(saved);
    },
  });
}

export async function render(el, ctx) {
  if (ctx.params[0]) return renderDetail(el, ctx, ctx.params[0]);
  const canWrite = ctx.can('ministries.write');
  const rows = await api('/ministries');

  el.innerHTML = `
    ${pageHead('Ministerios', 'Grupos de trabajo, coordinadores e integrantes', canWrite ? `<button class="btn primary" id="new">${icon('plus')} Nuevo ministerio</button>` : '')}
    ${rows.length
      ? `<div class="card-grid">${rows.map((m) => `
          <a class="card ministry-card ${m.active ? '' : 'inactive'}" href="#/ministerios/${m.id}">
            <div class="card-head"><h2>${esc(m.name)}</h2>${m.active ? '' : badge('Inactivo', 'gray')}</div>
            <p class="muted">${esc(m.description || 'Sin descripción')}</p>
            <div class="ministry-meta">
              <span>${icon('users')} ${m.member_count} integrantes</span>
              <span>${icon('calendar')} ${m.upcoming_count} próximos</span>
            </div>
            <div class="small"><span class="muted">Coordinador:</span> <strong>${esc(m.coordinator_name || 'Sin asignar')}</strong></div>
          </a>`).join('')}</div>`
      : `<div class="card">${empty('Aún no hay ministerios registrados.')}</div>`}`;
  el.querySelector('#new')?.addEventListener('click', () => openMinistryForm(null, (m) => ctx.navigate(`ministerios/${m.id}`)));
}

async function renderDetail(el, ctx, id) {
  const m = await api(`/ministries/${encodeURIComponent(id)}`);
  const canWrite = ctx.can('ministries.write');
  const reload = () => renderDetail(el, ctx, id);
  const eventRow = (e, past) => `
    <tr class="clickable ${e.status === 'cancelado' ? 'muted-row' : ''}" data-ev="${e.id}">
      <td>${fmtDate(e.date)}</td><td>${esc(e.time || '—')}</td><td class="strong">${esc(e.title)}</td>
      <td>${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])}</td>
      <td>${past ? `${e.present_count} asistentes` : e.status === 'cancelado' ? badge('Cancelado', 'red') : esc(e.location || '—')}</td>
    </tr>`;

  el.innerHTML = `
    <a href="#/ministerios" class="back">${icon('arrowLeft')} Ministerios</a>
    ${pageHead(m.name, m.description || '', `
      ${m.active ? '' : badge('Inactivo', 'gray')}
      ${canWrite ? `<button class="btn" id="edit">${icon('edit')} Editar</button>` : ''}
      ${ctx.can('events.write') ? `<button class="btn primary" id="new-event">${icon('plus')} Programar actividad</button>` : ''}`)}
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Integrantes (${m.members.filter((x) => x.active).length})</h2>
          ${canWrite ? `<button class="btn sm" id="members">${icon('users')} Gestionar integrantes</button>` : ''}</div>
        <p class="small"><span class="muted">Coordinador:</span> <strong>${esc(m.coordinator_name || 'Sin asignar')}</strong></p>
        ${m.members.length
          ? `<ul class="people">${m.members.map((p) => `
              <li><a href="#/miembros/${p.id}" class="strong">${esc(p.name)}</a>
                ${p.id === m.coordinator_id ? badge('Coordinador', 'blue') : ''} ${p.active ? '' : badge('Inactivo', 'gray')}
                <span class="muted small">${esc(p.phone || p.email || '')}</span></li>`).join('')}</ul>`
          : empty('Este ministerio no tiene integrantes.')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Actividades programadas</h2></div>
        ${m.upcoming_events.length
          ? `<div class="table-wrap"><table class="compact"><tbody>${m.upcoming_events.map((e) => eventRow(e, false)).join('')}</tbody></table></div>`
          : empty('No hay actividades programadas.')}
        <h3>Actividades anteriores</h3>
        ${m.past_events.length
          ? `<div class="table-wrap"><table class="compact"><tbody>${m.past_events.map((e) => eventRow(e, true)).join('')}</tbody></table></div>`
          : '<p class="muted">Sin actividades anteriores.</p>'}
      </section>
    </div>`;

  el.querySelector('#edit')?.addEventListener('click', () => openMinistryForm(m, reload));
  el.querySelector('#new-event')?.addEventListener('click', () =>
    openEventForm(ctx, null, {
      defaults: { type: 'actividad', ministry_id: m.id, responsibles: m.coordinator_id ? [{ id: m.coordinator_id }] : [] },
      onSaved: reload,
    })
  );
  el.querySelector('#members')?.addEventListener('click', async () => {
    const members = await api('/members?status=active');
    modal({
      title: `Integrantes de ${m.name}`,
      body: memberPicker('member_ids', members, m.members.map((x) => x.id), 'Seleccione los integrantes'),
      onSubmit: async (data) => {
        await api(`/ministries/${m.id}/members`, { method: 'PUT', body: data });
        toast('Integrantes actualizados');
        reload();
      },
    });
  });
  el.onclick = (e) => {
    const row = e.target.closest('[data-ev]');
    if (row) openEventDetail(ctx, row.dataset.ev, reload);
  };
}
