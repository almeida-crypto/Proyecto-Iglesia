import { api, qs } from '../api.js';
import { esc, icon, field, input, textarea, select, modal, toast, confirmDialog, empty, badge, pageHead, debounce, fmtDate, verseOfDay } from '../ui.js';

const SUGGESTED = ['Biblia', 'Estudio bíblico', 'Devocional', 'Teología', 'Historia de la iglesia', 'Sermones', 'Liderazgo', 'Familia', 'Niños', 'Jóvenes', 'Música y alabanza', 'Manuales internos'];
const MAX_MB = 50;
const PALETTES = [['#7a1f2b', '#3d0e15'], ['#35587d', '#1b2e44'], ['#55783f', '#2b3d20'], ['#9a6f22', '#4f3910'], ['#5f3d75', '#2f1e3b']];

const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const visBadge = (b) => (b.visibility === 'publico' ? `<span class="badge green">${icon('globe')} Público</span>` : `<span class="badge wine">${icon('lock')} Privado</span>`);

// Portada subida o, si no hay, una portada generada con el título.
function cover(book, base) {
  if (book.has_cover) {
    return `<img class="cover-img" src="${base}/${book.id}/cover?v=${encodeURIComponent(book.updated_at || book.created_at)}" alt="" loading="lazy">`;
  }
  const [c1, c2] = PALETTES[book.id % PALETTES.length];
  return `<div class="cover-gen" style="--c1:${c1};--c2:${c2}">
    <span class="cover-cross">${icon('cross')}</span>
    <strong>${esc(book.title)}</strong>${book.author ? `<em>${esc(book.author)}</em>` : ''}</div>`;
}

const card = (b, base, showVisibility) => `
  <button class="book-card" data-book="${b.id}">
    <div class="book-cover">${cover(b, base)}<span class="book-type">${b.file_type.toUpperCase()}</span></div>
    <div class="book-info">
      <strong>${esc(b.title)}</strong>
      <span class="muted small">${esc(b.author || 'Autor no indicado')}</span>
      <div class="chips">${b.category ? badge(b.category, 'gold') : ''}${showVisibility ? visBadge(b) : ''}</div>
    </div>
  </button>`;

const grid = (books, base, showVisibility, emptyText) =>
  books.length ? `<div class="book-grid">${books.map((b) => card(b, base, showVisibility)).join('')}</div>` : empty(emptyText);

// Lector a pantalla completa para PDF (con opción de abrirlo en otra pestaña, útil en celulares).
function openReader(book, base) {
  const url = `${base}/${book.id}/file`;
  const wrap = document.createElement('div');
  wrap.className = 'reader';
  wrap.innerHTML = `
    <header>
      <div class="reader-title">${icon('book')}<strong>${esc(book.title)}</strong></div>
      <a class="btn sm" href="${url}" target="_blank" rel="noopener">${icon('external')} Nueva pestaña</a>
      <a class="btn sm" href="${url}?download=1">${icon('download')} Descargar</a>
      <button class="icon-btn light" data-close aria-label="Cerrar">${icon('x')}</button>
    </header>
    <iframe src="${url}" title="${esc(book.title)}"></iframe>`;
  document.getElementById('modal-root').append(wrap);
  const onKey = (e) => e.key === 'Escape' && close();
  function close() {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);
  wrap.querySelector('[data-close]').addEventListener('click', close);
}

function openDetail(book, { base, canWrite = false, publicMode = false, onEdit, onDelete }) {
  const publicLink = `${location.origin}/#/biblioteca-publica?libro=${book.id}`;
  modal({
    title: 'Detalle del libro',
    wide: true,
    body: `
      <div class="book-detail">
        <div class="book-cover lg">${cover(book, base)}</div>
        <div class="book-detail-info">
          <h2 class="serif">${esc(book.title)}</h2>
          <p class="muted">${esc(book.author || 'Autor no indicado')}</p>
          <div class="chips">
            ${book.category ? badge(book.category, 'gold') : ''}
            ${publicMode ? '' : visBadge(book)}
            ${badge(`${book.file_type.toUpperCase()} · ${fmtSize(book.file_size)}`, 'gray')}
          </div>
          ${book.description ? `<p class="book-desc">${esc(book.description)}</p>` : ''}
          ${publicMode ? '' : `<p class="muted small">Agregado el ${fmtDate(book.created_at.slice(0, 10))}${book.uploaded_by_name ? ` por ${esc(book.uploaded_by_name)}` : ''} · ${book.views} consulta(s)</p>`}
          <div class="modal-actions">
            ${book.file_type === 'pdf' ? `<button type="button" class="btn primary" data-act="read">${icon('open')} Leer ahora</button>` : ''}
            <a class="btn ${book.file_type === 'pdf' ? '' : 'primary'}" href="${base}/${book.id}/file?download=1">${icon('download')} Descargar</a>
            ${!publicMode && book.visibility === 'publico' ? `<button type="button" class="btn" data-act="link">${icon('link')} Copiar enlace público</button>` : ''}
            ${canWrite ? `<button type="button" class="btn" data-act="edit">${icon('edit')} Editar</button>
              <button type="button" class="btn danger" data-act="delete">${icon('trash')} Eliminar</button>` : ''}
          </div>
          ${book.file_type === 'epub' ? '<p class="muted small">Los archivos EPUB se leen con una aplicación de libros electrónicos (Apple Books, Google Play Libros, Calibre…).</p>' : ''}
        </div>
      </div>`,
    onOpen: (wrap, close) => {
      wrap.querySelector('[data-act=read]')?.addEventListener('click', () => { close(); openReader(book, base); });
      wrap.querySelector('[data-act=link]')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(publicLink);
          toast('Enlace copiado');
        } catch {
          prompt('Copie el enlace:', publicLink);
        }
      });
      wrap.querySelector('[data-act=edit]')?.addEventListener('click', () => { close(); onEdit?.(book); });
      wrap.querySelector('[data-act=delete]')?.addEventListener('click', () => { close(); onDelete?.(book); });
    },
  });
}

function openForm(book, categories, onSaved) {
  const cats = [...new Set([...categories, ...SUGGESTED])].sort((a, b) => a.localeCompare(b, 'es'));
  modal({
    title: book ? 'Editar libro' : 'Subir libro',
    wide: true,
    submitLabel: book ? 'Guardar' : 'Subir libro',
    body: `<div class="form-grid">
      ${field('Título *', input('title', book?.title, 'required maxlength="200"'), { full: true })}
      ${field('Autor', input('author', book?.author, 'maxlength="150"'))}
      ${field('Categoría', input('category', book?.category, 'maxlength="80" list="book-cats" placeholder="Ej. Estudio bíblico"'))}
      <datalist id="book-cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      ${field('Visibilidad *', select('visibility', [['privado', 'Privado: solo usuarios del sistema'], ['publico', 'Público: cualquier persona, sin iniciar sesión']], book?.visibility || 'privado'), { full: true })}
      ${field('Descripción', textarea('description', book?.description, 'rows="3" maxlength="3000"'), { full: true })}
      ${field(book ? 'Reemplazar archivo (opcional)' : 'Archivo del libro *', '<input type="file" name="file" accept=".pdf,.epub,application/pdf,application/epub+zip">', { hint: `PDF o EPUB, máximo ${MAX_MB} MB.` })}
      ${field('Portada (opcional)', '<input type="file" name="cover" accept="image/png,image/jpeg,image/webp">', { hint: 'Si no sube una, se genera automáticamente.' })}
      ${book?.has_cover ? '<label class="check"><input type="checkbox" name="remove_cover"> <span>Quitar la portada actual</span></label>' : ''}
      <p class="muted small full">Solo suba materiales propios de la iglesia o que tengan permiso de distribución.</p>
    </div>`,
    onSubmit: async (_data, form) => {
      const fd = new FormData(form);
      for (const key of ['file', 'cover']) if (!fd.get(key)?.size) fd.delete(key);
      if (!book && !fd.get('file')) throw new Error('Seleccione el archivo del libro (PDF o EPUB).');
      if (fd.get('file')?.size > MAX_MB * 1048576) throw new Error(`El archivo supera ${MAX_MB} MB.`);
      await api(book ? `/books/${book.id}` : '/books', { method: book ? 'PUT' : 'POST', body: fd });
      toast(book ? 'Libro actualizado' : 'Libro agregado a la biblioteca');
      onSaved();
    },
  });
}

// ---------- Biblioteca interna (con sesión) ----------
export async function render(el, ctx) {
  const canWrite = ctx.can('books.write');
  const base = '/api/books';
  const filters = { q: '', category: '', visibility: '' };
  let data = { books: [], categories: [] };

  el.innerHTML = `
    ${pageHead('Biblioteca digital', 'Libros, estudios y materiales de la iglesia', `
      <a class="btn" href="#/biblioteca-publica" target="_blank" rel="noopener">${icon('globe')} Ver biblioteca pública</a>
      ${canWrite ? `<button class="btn primary" id="new">${icon('upload')} Subir libro</button>` : ''}`)}
    <div class="card">
      <div class="toolbar wrap">
        <div class="search">${icon('search')}<input type="search" id="q" placeholder="Buscar por título, autor o descripción…"></div>
        <select id="cat"></select>
        <div class="segmented" id="vis">
          <button data-v="" class="on">Todos</button><button data-v="publico">${icon('globe')} Públicos</button><button data-v="privado">${icon('lock')} Privados</button>
        </div>
      </div>
      <div id="grid"><div class="loading">Cargando…</div></div>
    </div>`;
  const catSelect = el.querySelector('#cat');

  async function load() {
    data = await api(`/books${qs(filters)}`);
    catSelect.innerHTML = [['', 'Todas las categorías'], ...data.categories.map((c) => [c, c])]
      .map(([v, l]) => `<option value="${esc(v)}" ${v === filters.category ? 'selected' : ''}>${esc(l)}</option>`).join('');
    el.querySelector('#grid').innerHTML = grid(
      data.books, base, true,
      filters.q || filters.category || filters.visibility ? 'Ningún libro coincide con la búsqueda.' : 'La biblioteca está vacía. Suba el primer libro.'
    );
  }

  const remove = async (book) => {
    if (!(await confirmDialog(`¿Eliminar "${book.title}" de la biblioteca? El archivo se borrará definitivamente.`, 'Eliminar'))) return;
    await api(`/books/${book.id}`, { method: 'DELETE' });
    toast('Libro eliminado');
    load();
  };

  el.querySelector('#q').addEventListener('input', debounce((e) => { filters.q = e.target.value; load(); }));
  catSelect.addEventListener('change', () => { filters.category = catSelect.value; load(); });
  el.querySelector('#vis').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filters.visibility = b.dataset.v;
    el.querySelectorAll('#vis button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  el.querySelector('#new')?.addEventListener('click', () => openForm(null, data.categories, load));
  el.querySelector('#grid').addEventListener('click', (e) => {
    const c = e.target.closest('[data-book]');
    if (!c) return;
    const book = data.books.find((b) => b.id === Number(c.dataset.book));
    openDetail(book, { base, canWrite, onEdit: (b) => openForm(b, data.categories, load), onDelete: remove });
  });
  await load();
}

// ---------- Biblioteca pública (sin sesión) ----------
export const publicLibrary = {
  async render(el, ctx) {
    const s = ctx.settings || {};
    const base = '/api/public/books';
    const [text, ref] = verseOfDay(3);
    const filters = { q: '', category: '' };
    let data = { books: [], categories: [] };
    document.title = `Biblioteca · ${s.name || 'Iglesia'}`;

    el.innerHTML = `
      <div class="public-page">
        <header class="public-header">
          <a class="public-brand" href="#/biblioteca-publica">
            ${s.logo ? `<img src="/uploads/${esc(s.logo)}" alt="">` : `<span class="brand-mark">${icon('cross')}</span>`}
            <strong>${esc(s.name || 'Mi Iglesia')}</strong>
          </a>
          <a class="btn ghost-light" href="#/${ctx.user ? 'inicio' : 'login'}">${ctx.user ? 'Ir al sistema' : 'Iniciar sesión'}</a>
        </header>
        <section class="public-hero">
          <span class="eyebrow">${icon('book')} Biblioteca digital</span>
          <h1>Recursos para crecer en la fe</h1>
          <blockquote>“${esc(text)}”<cite>${esc(ref)}</cite></blockquote>
          <div class="search hero-search">${icon('search')}<input type="search" id="q" placeholder="Buscar un libro, autor o tema…"></div>
        </section>
        <main class="public-main">
          <div class="cat-chips" id="cats"></div>
          <div id="grid"><div class="loading">Cargando…</div></div>
        </main>
        <footer class="public-footer">
          <span class="ornament">${icon('cross')}</span>
          <strong>${esc(s.name || '')}</strong>
          <span>${esc([s.address, s.phone, s.email].filter(Boolean).join(' · '))}</span>
        </footer>
      </div>`;

    async function load() {
      data = await api(`/public/books${qs(filters)}`);
      el.querySelector('#cats').innerHTML = data.categories.length
        ? ['', ...data.categories].map((c) => `<button class="cat-chip ${c === filters.category ? 'on' : ''}" data-cat="${esc(c)}">${esc(c || 'Todos')}</button>`).join('')
        : '';
      el.querySelector('#grid').innerHTML = grid(data.books, base, false, filters.q || filters.category ? 'Ningún libro coincide con la búsqueda.' : 'Todavía no hay libros públicos.');
    }

    el.querySelector('#q').addEventListener('input', debounce((e) => { filters.q = e.target.value; load(); }));
    el.querySelector('#cats').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      filters.category = b.dataset.cat;
      load();
    });
    el.querySelector('#grid').addEventListener('click', (e) => {
      const c = e.target.closest('[data-book]');
      if (c) openDetail(data.books.find((b) => b.id === Number(c.dataset.book)), { base, publicMode: true });
    });
    await load();
    const shared = data.books.find((b) => b.id === Number(ctx.query.libro));
    if (shared) openDetail(shared, { base, publicMode: true });
  },
};
