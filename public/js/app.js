import { api } from './api.js';
import { esc, icon, toast } from './ui.js';
import * as auth from './views/auth.js';
import * as dashboard from './views/dashboard.js';
import * as members from './views/members.js';
import * as attendance from './views/attendance.js';
import * as events from './views/events.js';
import * as ministries from './views/ministries.js';
import * as donations from './views/donations.js';
import * as announcements from './views/announcements.js';
import * as reports from './views/reports.js';
import * as users from './views/users.js';
import * as settings from './views/settings.js';
import * as profile from './views/profile.js';
import * as library from './views/library.js';

const state = { user: null, settings: null, meta: null };
const can = (perm) => !!state.user?.permissions.includes(perm);

const NAV = [
  { path: 'inicio', label: 'Panel principal', icon: 'home', view: dashboard },
  { path: 'miembros', label: 'Miembros', icon: 'users', view: members, perm: 'members.read' },
  { path: 'asistencia', label: 'Asistencia', icon: 'check', view: attendance, perm: 'attendance.read' },
  { path: 'eventos', label: 'Eventos', icon: 'calendar', view: events, perm: 'events.read' },
  { path: 'ministerios', label: 'Ministerios', icon: 'layers', view: ministries, perm: 'ministries.read' },
  { path: 'aportaciones', label: 'Aportaciones', icon: 'wallet', view: donations, perm: 'finances.read' },
  { path: 'anuncios', label: 'Anuncios', icon: 'megaphone', view: announcements, perm: 'announcements.read' },
  { path: 'biblioteca', label: 'Biblioteca', icon: 'book', view: library, perm: 'books.read' },
  { path: 'reportes', label: 'Reportes', icon: 'file', view: reports },
  { path: 'usuarios', label: 'Usuarios', icon: 'shield', view: users, perm: 'users.manage' },
  { path: 'configuracion', label: 'Configuración', icon: 'settings', view: settings },
];
const HIDDEN = { perfil: profile };
const PUBLIC = { login: auth.login, olvide: auth.forgot, restablecer: auth.reset, 'biblioteca-publica': library.publicLibrary };

const root = document.getElementById('root');
let cleanup = null;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(query)) };
}

export function navigate(path) {
  const hash = `#/${path}`;
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function onLogin(user) {
  state.user = user;
  state.meta = await api('/meta');
}

async function refreshSettings() {
  state.settings = await api('/public/settings');
  root.innerHTML = '';
  route();
}

function context(r) {
  return { ...r, user: state.user, settings: state.settings, meta: state.meta, can, navigate, onLogin, refreshSettings };
}

function renderShell() {
  const s = state.settings || {};
  const u = state.user;
  const initials = u.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          ${s.logo ? `<img src="/uploads/${esc(s.logo)}" alt="">` : `<div class="brand-mark">${icon('cross')}</div>`}
          <div><strong>${esc(s.name || 'Mi Iglesia')}</strong><span>Sistema de gestión</span></div>
        </div>
        <nav>${NAV.filter((n) => !n.perm || can(n.perm))
          .map((n) => `<a href="#/${n.path}" data-nav="${n.path}">${icon(n.icon)}<span>${n.label}</span></a>`).join('')}</nav>
        <div class="sidebar-foot">
          <a href="#/perfil" class="user-chip" data-nav="perfil">
            <div class="avatar">${esc(initials)}</div>
            <div><strong>${esc(u.name)}</strong><span>${esc(state.meta.roles[u.role])}</span></div>
          </a>
          <button class="nav-btn" id="logout">${icon('logout')}<span>Cerrar sesión</span></button>
        </div>
      </aside>
      <div class="backdrop"></div>
      <div class="content">
        <header class="topbar">
          <button class="icon-btn" id="menu" aria-label="Menú">${icon('menu')}</button>
          <strong>${esc(s.name || 'Mi Iglesia')}</strong>
        </header>
        <main id="main"></main>
      </div>
    </div>`;
  const layout = root.querySelector('.layout');
  root.querySelector('#menu').addEventListener('click', () => layout.classList.toggle('menu-open'));
  root.querySelector('.backdrop').addEventListener('click', () => layout.classList.remove('menu-open'));
  root.querySelector('#logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    root.innerHTML = '';
    navigate('login');
  });
}

async function route() {
  if (cleanup) {
    try { cleanup(); } catch { /* ignorar */ }
    cleanup = null;
  }
  document.getElementById('modal-root').innerHTML = '';
  const r = parseHash();

  if (PUBLIC[r.name]) {
    if (state.user && r.name === 'login') return navigate('inicio');
    root.innerHTML = '';
    return PUBLIC[r.name].render(root, context(r));
  }
  if (!state.user) return navigate('login');

  const entry = NAV.find((n) => n.path === r.name);
  const view = entry?.view || HIDDEN[r.name];
  if (!view || (entry?.perm && !can(entry.perm))) return navigate('inicio');

  if (!root.querySelector('.layout')) renderShell();
  root.querySelector('.layout').classList.remove('menu-open');
  root.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.name));
  document.title = `${entry?.label || 'Mi perfil'} · ${state.settings?.name || 'Gestión de Iglesia'}`;

  // Cada navegación usa un contenedor nuevo: si una vista lenta termina tarde, escribe en un nodo ya descartado.
  const main = document.getElementById('main');
  const container = document.createElement('div');
  container.className = 'view';
  container.innerHTML = '<div class="loading">Cargando…</div>';
  main.replaceChildren(container);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    cleanup = (await view.render(container, context(r))) || null;
  } catch (err) {
    container.innerHTML = `<div class="card error-card">${esc(err.message)}</div>`;
  }
}

async function boot() {
  if (window.Chart) {
    window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    window.Chart.defaults.color = '#7d6e5e';
    window.Chart.defaults.borderColor = '#ece3d3';
  }
  state.settings = await api('/public/settings').catch(() => null);
  try {
    const { user } = await api('/auth/me');
    await onLogin(user);
  } catch {
    state.user = null;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('auth:expired', () => {
    if (!state.user) return;
    state.user = null;
    toast('Su sesión expiró. Inicie sesión de nuevo.', 'error');
    root.innerHTML = '';
    navigate('login');
  });
  route();
}

boot();
