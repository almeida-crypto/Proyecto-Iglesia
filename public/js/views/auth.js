import { api } from '../api.js';
import { esc, icon, serialize, toast, verseOfDay } from '../ui.js';

function shell(ctx, inner) {
  const s = ctx.settings || {};
  const [text, ref] = verseOfDay();
  return `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-brand">
          ${s.logo ? `<img src="/uploads/${esc(s.logo)}" alt="">` : `<div class="brand-mark lg">${icon('cross')}</div>`}
          <h1>${esc(s.name || 'Gestión de Iglesia')}</h1>
          <span class="ornament-line"></span>
        </div>
        ${inner}
      </div>
      <blockquote class="auth-verse">“${esc(text)}”<cite>${esc(ref)}</cite></blockquote>
      <a class="auth-library" href="#/biblioteca-publica">${icon('book')} Visitar la biblioteca pública</a>
    </div>`;
}

function bindForm(el, handler) {
  const form = el.querySelector('form');
  const error = form.querySelector('.form-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    error.hidden = true;
    try {
      await handler(serialize(form), form);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  form.querySelector('input')?.focus();
}

export const login = {
  render(el, ctx) {
    el.innerHTML = shell(ctx, `
      <form class="stack" novalidate>
        <p class="muted center">Inicie sesión para continuar</p>
        <label class="field"><span>Correo electrónico</span><input name="email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="current-password" required></label>
        <div class="form-error" hidden></div>
        <button type="submit" class="btn primary block">Iniciar sesión</button>
        <a href="#/olvide" class="center small">¿Olvidó su contraseña?</a>
      </form>`);
    bindForm(el, async (data) => {
      const { user } = await api('/auth/login', { method: 'POST', body: data });
      await ctx.onLogin(user);
      el.innerHTML = '';
      ctx.navigate('inicio');
    });
  },
};

export const forgot = {
  render(el, ctx) {
    el.innerHTML = shell(ctx, `
      <form class="stack" novalidate>
        <h2 class="center">Recuperar contraseña</h2>
        <p class="muted center">Escriba su correo y le enviaremos un enlace para restablecer la contraseña.</p>
        <label class="field"><span>Correo electrónico</span><input name="email" type="email" required></label>
        <div class="form-error" hidden></div>
        <div class="form-ok" hidden></div>
        <button type="submit" class="btn primary block">Enviar enlace</button>
        <a href="#/login" class="center small">Volver al inicio de sesión</a>
      </form>`);
    bindForm(el, async (data, form) => {
      const res = await api('/auth/forgot', { method: 'POST', body: data });
      const ok = form.querySelector('.form-ok');
      ok.textContent = res.message;
      ok.hidden = false;
    });
  },
};

export const reset = {
  render(el, ctx) {
    const token = ctx.query.token || '';
    el.innerHTML = shell(ctx, `
      <form class="stack" novalidate>
        <h2 class="center">Nueva contraseña</h2>
        ${token ? '' : '<p class="form-error">El enlace no es válido. Solicite uno nuevo.</p>'}
        <label class="field"><span>Nueva contraseña</span><input name="password" type="password" autocomplete="new-password" required></label>
        <label class="field"><span>Confirmar contraseña</span><input name="confirm" type="password" autocomplete="new-password" required></label>
        <small class="muted">Mínimo 8 caracteres, con letras y números.</small>
        <div class="form-error" hidden></div>
        <button type="submit" class="btn primary block" ${token ? '' : 'disabled'}>Guardar contraseña</button>
        <a href="#/login" class="center small">Volver al inicio de sesión</a>
      </form>`);
    bindForm(el, async (data) => {
      if (data.password !== data.confirm) throw new Error('Las contraseñas no coinciden.');
      await api('/auth/reset', { method: 'POST', body: { token, password: data.password } });
      toast('Contraseña actualizada. Ya puede iniciar sesión.');
      ctx.navigate('login');
    });
  },
};
