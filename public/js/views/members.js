import { api, qs } from '../api.js';
import { esc, icon, fmtDate, field, input, textarea, modal, toast, confirmDialog, empty, badge, pageHead, debounce, today } from '../ui.js';

function memberForm(m = {}) {
  return `<div class="form-grid">
    ${field('Nombre completo *', input('name', m.name, 'required maxlength="120"'), { full: true })}
    ${field('Teléfono', input('phone', m.phone, 'type="tel" maxlength="40"'))}
    ${field('Correo electrónico', input('email', m.email, 'type="email"'))}
    ${field('Fecha de ingreso', input('join_date', m.join_date || (m.id ? '' : today()), 'type="date"'))}
    ${field('Fecha de nacimiento', input('birth_date', m.birth_date, 'type="date"'))}
    ${field('Dirección', input('address', m.address, 'maxlength="255"'), { full: true })}
    ${field('Notas', textarea('notes', m.notes, 'rows="3" maxlength="2000"'), { full: true })}
  </div>`;
}

export function openMemberForm(member, onSaved) {
  modal({
    title: member?.id ? 'Editar miembro' : 'Nuevo miembro',
    body: memberForm(member || {}),
    wide: true,
    onSubmit: async (data) => {
      const saved = await api(member?.id ? `/members/${member.id}` : '/members', { method: member?.id ? 'PUT' : 'POST', body: data });
      toast(member?.id ? 'Miembro actualizado' : 'Miembro registrado');
      onSaved?.(saved);
    },
  });
}

async function toggleStatus(member, onDone) {
  const activate = !member.active;
  const ok = await confirmDialog(
    activate
      ? `¿Reactivar a ${member.name}?`
      : `¿Desactivar a ${member.name}? El registro se conserva y podrá reactivarse en cualquier momento.`,
    activate ? 'Reactivar' : 'Desactivar'
  );
  if (!ok) return;
  await api(`/members/${member.id}/status`, { method: 'PATCH', body: { active: activate } });
  toast(activate ? 'Miembro reactivado' : 'Miembro desactivado');
  onDone();
}

export async function render(el, ctx) {
  if (ctx.params[0]) return renderDetail(el, ctx, ctx.params[0]);
  const canWrite = ctx.can('members.write');
  let status = 'active';
  let rows = [];

  el.innerHTML = `
    ${pageHead('Miembros', 'Registro y consulta de los miembros de la iglesia', canWrite ? `<button class="btn primary" id="new">${icon('plus')} Nuevo miembro</button>` : '')}
    <div class="card">
      <div class="toolbar">
        <div class="search">${icon('search')}<input type="search" id="q" placeholder="Buscar por nombre…"></div>
        <div class="segmented" id="status">
          <button data-v="active" class="on">Activos</button><button data-v="inactive">Inactivos</button><button data-v="all">Todos</button>
        </div>
      </div>
      <div id="list"><div class="loading">Cargando…</div></div>
    </div>`;
  const list = el.querySelector('#list');
  const q = el.querySelector('#q');

  async function load() {
    rows = await api(`/members${qs({ status, q: q.value })}`);
    list.innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Correo</th><th>Ingreso</th><th>Estado</th><th></th></tr></thead>
          <tbody>${rows.map((m) => `
            <tr>
              <td><a href="#/miembros/${m.id}" class="strong">${esc(m.name)}</a></td>
              <td>${esc(m.phone || '—')}</td>
              <td>${esc(m.email || '—')}</td>
              <td>${fmtDate(m.join_date)}</td>
              <td>${m.active ? badge('Activo', 'green') : badge('Inactivo', 'gray')}</td>
              <td class="row-actions">
                <a class="icon-btn" href="#/miembros/${m.id}" title="Ver">${icon('eye')}</a>
                ${canWrite ? `<button class="icon-btn" data-edit="${m.id}" title="Editar">${icon('edit')}</button>
                <button class="icon-btn" data-toggle="${m.id}" title="${m.active ? 'Desactivar' : 'Reactivar'}">${icon('power')}</button>` : ''}
              </td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="muted small pad">${rows.length} miembro(s)</p>`
      : empty(q.value ? 'Ningún miembro coincide con la búsqueda.' : 'No hay miembros en esta lista.');
  }

  q.addEventListener('input', debounce(load));
  el.querySelector('#status').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    status = b.dataset.v;
    el.querySelectorAll('#status button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  el.querySelector('#new')?.addEventListener('click', () => openMemberForm(null, load));
  list.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const toggle = e.target.closest('[data-toggle]');
    if (edit) openMemberForm(rows.find((m) => m.id === Number(edit.dataset.edit)), load);
    if (toggle) toggleStatus(rows.find((m) => m.id === Number(toggle.dataset.toggle)), load);
  });
  await load();
}

async function renderDetail(el, ctx, id) {
  const m = await api(`/members/${encodeURIComponent(id)}`);
  const canWrite = ctx.can('members.write');
  const rate = m.attendance.total ? Math.round((m.attendance.present / m.attendance.total) * 100) : 0;
  const info = (label, value) => `<div class="info"><span>${esc(label)}</span><strong>${value}</strong></div>`;

  el.innerHTML = `
    <a href="#/miembros" class="back">${icon('arrowLeft')} Miembros</a>
    ${pageHead(m.name, '', `
      ${m.active ? badge('Activo', 'green') : badge('Inactivo', 'gray')}
      ${canWrite ? `<button class="btn" id="edit">${icon('edit')} Editar</button>
      <button class="btn" id="toggle">${icon('power')} ${m.active ? 'Desactivar' : 'Reactivar'}</button>` : ''}`)}
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Información personal</h2></div>
        <div class="info-grid">
          ${info('Teléfono', esc(m.phone || '—'))}
          ${info('Correo', esc(m.email || '—'))}
          ${info('Fecha de ingreso', fmtDate(m.join_date))}
          ${info('Fecha de nacimiento', fmtDate(m.birth_date))}
          ${info('Dirección', esc(m.address || '—'))}
        </div>
        ${m.notes ? `<p class="notes">${esc(m.notes)}</p>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h2>Participación</h2></div>
        <div class="mini-stats">
          <div><strong>${m.attendance.present}</strong><span>asistencias</span></div>
          <div><strong>${m.attendance.total - m.attendance.present}</strong><span>ausencias</span></div>
          <div><strong>${rate}%</strong><span>asistencia</span></div>
        </div>
        <h3>Ministerios</h3>
        ${m.ministries.length
          ? `<div class="chips">${m.ministries.map((x) => `<a class="chip" href="#/ministerios/${x.id}">${esc(x.name)}${x.is_coordinator ? ' · Coordinador' : ''}</a>`).join('')}</div>`
          : '<p class="muted">No pertenece a ningún ministerio.</p>'}
      </section>
      <section class="card span-2">
        <div class="card-head"><h2>Asistencia reciente</h2></div>
        ${m.recent_attendance.length
          ? `<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>
              ${m.recent_attendance.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.title)}</td><td>${esc(ctx.meta.eventTypes[a.type])}</td>
                <td>${a.present ? badge('Presente', 'green') : badge('Ausente', 'red')}</td></tr>`).join('')}
            </tbody></table></div>`
          : empty('Sin registros de asistencia.')}
      </section>
    </div>`;
  const reload = () => renderDetail(el, ctx, id);
  el.querySelector('#edit')?.addEventListener('click', () => openMemberForm(m, reload));
  el.querySelector('#toggle')?.addEventListener('click', () => toggleStatus(m, reload));
}
