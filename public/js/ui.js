// Utilidades de interfaz compartidas por todas las vistas.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------- Fechas y dinero ----------
const pad = (n) => String(n).padStart(2, '0');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const monthStart = (date = today()) => `${date.slice(0, 7)}-01`;
export function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(new Date(y, m, 0).getDate())}`;
}
const asDate = (d) => new Date(`${d}T12:00:00`);
export const fmtDate = (d) => (d ? asDate(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateLong = (d) =>
  d ? asDate(d).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
export const fmtMonth = (m) =>
  asDate(`${m}-01`).toLocaleDateString('es', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase());
export const fmtMonthShort = (m) => asDate(`${m}-01`).toLocaleDateString('es', { month: 'short' });
export const fmtDateTime = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// Formato local de cada moneda con su símbolo ($1,250.00 en MXN, 1.250,00 € en EUR…).
const CURRENCY_LOCALES = { MXN: 'es-MX', USD: 'es-US', COP: 'es-CO', ARS: 'es-AR', CLP: 'es-CL', PEN: 'es-PE', GTQ: 'es-GT', DOP: 'es-DO', EUR: 'es-ES' };
export function money(cents, currency = 'USD') {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'es', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format((cents || 0) / 100);
  } catch {
    return ((cents || 0) / 100).toFixed(2);
  }
}

// ---------- Iconos (SVG en línea) ----------
const ICONS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M1 21c0-4 4-6 8-6s8 2 8 6"/><path d="M17 4a4 4 0 010 8M23 21c0-3-2-5-5-6"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
  megaphone: '<path d="M3 11v2a1 1 0 001 1h3l6 4V6L7 10H4a1 1 0 00-1 1z"/><path d="M17 8a5 5 0 010 8"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  church: '<path d="M12 2v4M10 4h4M6 22V12l6-5 6 5v10M2 22h20M10 22v-4a2 2 0 014 0v4"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  power: '<path d="M18.4 6.6a9 9 0 11-12.8 0M12 2v10"/>',
  star: '<path d="M12 2l3 7 7 .6-5.3 4.7L18.2 22 12 18l-6.2 4 1.5-7.7L2 9.6 9 9z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  cross: '<path d="M12 2.5v19M6.5 8h11"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5z"/><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5"/><path d="M12 6.5v6M9.5 9h5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  external: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>',
  link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  open: '<path d="M2 4h7a3 3 0 013 3v14a2 2 0 00-2-2H2zM22 4h-7a3 3 0 00-3 3v14a2 2 0 012-2h8z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
};

// Versículo del día (Reina-Valera 1909, dominio público).
const VERSES = [
  ['Lámpara es a mis pies tu palabra, y lumbrera a mi camino.', 'Salmos 119:105'],
  ['Jehová es mi pastor; nada me faltará.', 'Salmos 23:1'],
  ['Todo lo puedo en Cristo que me fortalece.', 'Filipenses 4:13'],
  ['Porque donde están dos o tres congregados en mi nombre, allí estoy en medio de ellos.', 'Mateo 18:20'],
  ['Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.', 'Mateo 6:33'],
  ['Pero los que esperan a Jehová tendrán nuevas fuerzas; levantarán las alas como águilas.', 'Isaías 40:31'],
  ['Cada uno dé como propuso en su corazón; no con tristeza, o por necesidad, porque Dios ama al dador alegre.', '2 Corintios 9:7'],
  ['Y perseveraban en la doctrina de los apóstoles, y en la comunión, y en el partimiento del pan, y en las oraciones.', 'Hechos 2:42'],
  ['Mirad cuán bueno y cuán delicioso es habitar los hermanos igualmente en uno.', 'Salmos 133:1'],
  ['Toda Escritura es inspirada divinamente y útil para enseñar, para redargüir, para corregir, para instituir en justicia.', '2 Timoteo 3:16'],
  ['Encomienda a Jehová tu camino, y espera en él; y él hará.', 'Salmos 37:5'],
  ['El amor es sufrido, es benigno; el amor no tiene envidia.', '1 Corintios 13:4'],
];
export function verseOfDay(offset = 0) {
  const d = new Date();
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  return VERSES[(day + offset) % VERSES.length];
}
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

// ---------- Formularios ----------
export const field = (label, control, { hint = '', full = false } = {}) =>
  `<label class="field ${full ? 'full' : ''}"><span>${esc(label)}</span>${control}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;

export const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value ?? '')}" ${attrs}>`;

export const textarea = (name, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value ?? '')}</textarea>`;

export const select = (name, options, value = '', attrs = '') =>
  `<select name="${name}" ${attrs}>${options
    .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;

export const checkbox = (name, label, checked) =>
  `<label class="check"><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}> <span>${esc(label)}</span></label>`;

export function serialize(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled || el.type === 'file') continue;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) {
        out[el.name] ||= [];
        if (el.checked) out[el.name].push(Number(el.value));
      } else out[el.name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value;
  }
  return out;
}

// Lista de miembros con casillas y filtro de búsqueda.
export function memberPicker(name, members, selected = [], label = 'Miembros') {
  const sel = new Set(selected.map(Number));
  const sorted = [...members].sort((a, b) => sel.has(b.id) - sel.has(a.id) || a.name.localeCompare(b.name, 'es'));
  return `<div class="field full"><span>${esc(label)}</span><div class="picker">
    <input type="search" class="picker-filter" placeholder="Buscar miembro…">
    <div class="picker-list">${
      sorted.map((m) => `<label class="picker-item" data-name="${esc(norm(m.name))}"><input type="checkbox" name="${name}" value="${m.id}" data-multi ${sel.has(m.id) ? 'checked' : ''}> ${esc(m.name)}</label>`).join('') ||
      '<p class="muted pad">No hay miembros activos.</p>'
    }</div>
    <div class="picker-count muted small"></div></div></div>`;
}

function setupPickers(scope) {
  scope.querySelectorAll('.picker').forEach((p) => {
    const filter = p.querySelector('.picker-filter');
    const count = p.querySelector('.picker-count');
    const update = () => (count.textContent = `${p.querySelectorAll('.picker-list input:checked').length} seleccionados`);
    filter.addEventListener('input', () => {
      const q = norm(filter.value);
      p.querySelectorAll('.picker-item').forEach((it) => (it.hidden = !it.dataset.name.includes(q)));
    });
    p.addEventListener('change', update);
    update();
  });
}

// ---------- Modales ----------
export function modal({ title, body, submitLabel = 'Guardar', onSubmit, wide = false, onOpen, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <form novalidate>
        <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Cerrar">${icon('x')}</button></header>
        <div class="modal-body">${body}<div class="form-error" hidden></div></div>
        ${onSubmit ? `<footer><button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn primary">${esc(submitLabel)}</button></footer>` : ''}
      </form>
    </div>`;
  document.getElementById('modal-root').append(wrap);
  const form = wrap.querySelector('form');
  const errorBox = wrap.querySelector('.form-error');

  const onKey = (e) => e.key === 'Escape' && close();
  function close() {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  }
  document.addEventListener('keydown', onKey);
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    errorBox.hidden = true;
    try {
      if ((await onSubmit(serialize(form), form)) !== false) close();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  setupPickers(wrap);
  wrap.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea')?.focus();
  onOpen?.(wrap, close);
  return { el: wrap, close };
}

export function confirmDialog(message, confirmLabel = 'Confirmar') {
  return new Promise((resolve) => {
    let confirmed = false;
    modal({
      title: 'Confirmar acción',
      body: `<p>${esc(message)}</p>`,
      submitLabel: confirmLabel,
      onSubmit: () => {
        confirmed = true;
      },
      onClose: () => resolve(confirmed),
    });
  });
}

// ---------- Avisos ----------
export function toast(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.classList.add('out'), 3000);
  setTimeout(() => el.remove(), 3400);
}

// ---------- Fragmentos comunes ----------
export const empty = (text) => `<div class="empty">${esc(text)}</div>`;
export const badge = (text, kind = '') => `<span class="badge ${kind}">${esc(text)}</span>`;
export const pageHead = (title, subtitle = '', actions = '') =>
  `<div class="page-head"><div><h1>${esc(title)}</h1>${subtitle ? `<p class="muted">${esc(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></div>`;

export const TYPE_COLORS = { culto: 'blue', reunion: 'green', actividad: 'amber', administrativo: 'gray' };

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Gráficas ----------
export const CHART_COLORS = ['#7a1f2b', '#b8892b', '#55783f', '#35587d', '#7c5295', '#c0673a', '#2f7a74', '#8a7f72'];

export function chart(canvas, config) {
  if (!window.Chart || !canvas) return null;
  return new window.Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      ...config.options,
      plugins: { legend: { display: false }, ...(config.options?.plugins || {}) },
    },
  });
}
