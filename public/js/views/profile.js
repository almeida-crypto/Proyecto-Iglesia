import { api } from '../api.js';
import { esc, field, serialize, toast, pageHead, badge } from '../ui.js';

export function render(el, ctx) {
  const u = ctx.user;
  el.innerHTML = `
    ${pageHead('Mi perfil')}
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Datos de la cuenta</h2></div>
        <div class="info-grid">
          <div class="info"><span>Nombre</span><strong>${esc(u.name)}</strong></div>
          <div class="info"><span>Correo</span><strong>${esc(u.email)}</strong></div>
          <div class="info"><span>Rol</span><strong>${badge(ctx.meta.roles[u.role], 'blue')}</strong></div>
        </div>
      </section>
      <form class="card" id="pwd" novalidate>
        <div class="card-head"><h2>Cambiar contraseña</h2></div>
        <div class="form-grid">
          ${field('Contraseña actual', '<input name="current" type="password" autocomplete="current-password" required>', { full: true })}
          ${field('Nueva contraseña', '<input name="password" type="password" autocomplete="new-password" required>', { full: true, hint: 'Mínimo 8 caracteres con letras y números.' })}
          ${field('Confirmar nueva contraseña', '<input name="confirm" type="password" autocomplete="new-password" required>', { full: true })}
        </div>
        <div class="form-error" hidden></div>
        <div class="form-foot"><button type="submit" class="btn primary">Actualizar contraseña</button></div>
      </form>
    </div>`;

  const form = el.querySelector('#pwd');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.form-error');
    err.hidden = true;
    const data = serialize(form);
    try {
      if (data.password !== data.confirm) throw new Error('Las contraseñas no coinciden.');
      await api('/auth/change-password', { method: 'POST', body: { current: data.current, password: data.password } });
      form.reset();
      toast('Contraseña actualizada');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
}
