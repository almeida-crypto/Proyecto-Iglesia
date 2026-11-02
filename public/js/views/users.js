import { api } from '../api.js';
import { esc, icon, fmtDateTime, field, input, select, checkbox, modal, toast, empty, badge, pageHead } from '../ui.js';

const ROLE_INFO = {
  administrador: 'Acceso total, incluida la gestión de usuarios.',
  pastor: 'Gestiona miembros, eventos, ministerios, anuncios y configuración; consulta finanzas.',
  secretario: 'Gestiona miembros, asistencia, eventos, ministerios y anuncios.',
  tesorero: 'Gestiona aportaciones y reportes financieros; consulta miembros.',
  coordinador: 'Registra asistencia y eventos; consulta miembros y ministerios.',
};

export async function render(el, ctx) {
  const roles = ctx.meta.roles;
  let rows = [];

  el.innerHTML = `
    ${pageHead('Usuarios del sistema', 'Cuentas de acceso y roles', `<button class="btn primary" id="new">${icon('plus')} Nuevo usuario</button>`)}
    <div class="card"><div id="list"></div></div>
    <div class="card">
      <div class="card-head"><h2>Roles y permisos</h2></div>
      <ul class="role-list">${Object.entries(ROLE_INFO).map(([k, d]) => `<li>${badge(roles[k], 'blue')} <span>${esc(d)}</span></li>`).join('')}</ul>
    </div>`;

  async function load() {
    rows = await api('/users');
    el.querySelector('#list').innerHTML = rows.length
      ? `<div class="table-wrap"><table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
          <tbody>${rows.map((u) => `<tr>
            <td class="strong">${esc(u.name)}${u.id === ctx.user.id ? ' <span class="muted small">(usted)</span>' : ''}</td>
            <td>${esc(u.email)}</td><td>${badge(roles[u.role], 'blue')}</td>
            <td>${u.active ? badge('Activo', 'green') : badge('Inactivo', 'gray')}</td>
            <td class="muted small">${fmtDateTime(u.created_at)}</td>
            <td class="row-actions"><button class="icon-btn" data-edit="${u.id}" title="Editar">${icon('edit')}</button></td>
          </tr>`).join('')}</tbody></table></div>`
      : empty('No hay usuarios.');
  }

  function openForm(u) {
    modal({
      title: u ? 'Editar usuario' : 'Nuevo usuario',
      body: `<div class="form-grid">
        ${field('Nombre *', input('name', u?.name, 'required maxlength="120"'), { full: true })}
        ${field('Correo electrónico *', input('email', u?.email, 'type="email" required autocomplete="off"'), { full: true })}
        ${field('Rol *', select('role', Object.entries(roles), u?.role || 'secretario'), { full: true })}
        ${field(u ? 'Nueva contraseña' : 'Contraseña *', input('password', '', 'type="password" autocomplete="new-password"'), { full: true, hint: u ? 'Déjela vacía para conservar la actual. Mínimo 8 caracteres con letras y números.' : 'Mínimo 8 caracteres con letras y números.' })}
        ${u ? checkbox('active', 'Usuario activo', u.active) : ''}
      </div>`,
      onSubmit: async (data) => {
        await api(u ? `/users/${u.id}` : '/users', { method: u ? 'PUT' : 'POST', body: data });
        toast(u ? 'Usuario actualizado' : 'Usuario creado');
        load();
      },
    });
  }

  el.querySelector('#new').addEventListener('click', () => openForm(null));
  el.querySelector('#list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (b) openForm(rows.find((u) => u.id === Number(b.dataset.edit)));
  });
  await load();
}
