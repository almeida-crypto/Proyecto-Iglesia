import { api, qs } from '../api.js';
import { esc, icon, fmtDate, fmtMonthShort, field, input, textarea, checkbox, modal, toast, confirmDialog, empty, badge, pageHead, today, TYPE_COLORS } from '../ui.js';

export async function render(el, ctx) {
  const canWrite = ctx.can('announcements.write');
  let scope = 'current';
  let rows = [];

  el.innerHTML = `
    ${pageHead('Comunicados y anuncios', 'Avisos para los miembros y próximos eventos', canWrite ? `<button class="btn primary" id="new">${icon('plus')} Publicar anuncio</button>` : '')}
    <div class="split">
      <div>
        ${canWrite ? `<div class="segmented mb" id="scope"><button data-v="current" class="on">Vigentes</button><button data-v="all">Todos (incluye programados y vencidos)</button></div>` : ''}
        <div id="list"></div>
      </div>
      <aside class="card">
        <div class="card-head"><h2>Próximos eventos</h2><a href="#/eventos" class="small">Calendario</a></div>
        <div id="upcoming"></div>
      </aside>
    </div>`;

  const status = (a) => {
    const t = today();
    if (a.publish_date > t) return badge(`Programado: ${fmtDate(a.publish_date)}`, 'amber');
    if (a.expires_date && a.expires_date < t) return badge('Vencido', 'gray');
    return '';
  };

  async function load() {
    rows = await api(`/announcements${qs({ scope })}`);
    el.querySelector('#list').innerHTML = rows.length
      ? rows.map((a) => `
          <article class="card announcement ${a.important ? 'important' : ''}">
            <div class="card-head">
              <h2>${a.important ? `${icon('star')} ` : ''}${esc(a.title)}</h2>
              <div class="actions">${status(a)}${a.important ? badge('Importante', 'red') : ''}
                ${canWrite ? `<button class="icon-btn" data-edit="${a.id}" title="Editar">${icon('edit')}</button>
                <button class="icon-btn danger" data-del="${a.id}" title="Eliminar">${icon('trash')}</button>` : ''}</div>
            </div>
            <p class="body">${esc(a.body)}</p>
            <div class="muted small">Publicado el ${fmtDate(a.publish_date)}${a.expires_date ? ` · Vigente hasta el ${fmtDate(a.expires_date)}` : ''}${a.author ? ` · ${esc(a.author)}` : ''}</div>
          </article>`).join('')
      : `<div class="card">${empty('No hay anuncios para mostrar.')}</div>`;
  }

  async function loadUpcoming() {
    const events = await api(`/events${qs({ from: today(), status: 'programado', limit: 8 })}`);
    el.querySelector('#upcoming').innerHTML = events.length
      ? `<ul class="event-list">${events.map((e) => `
          <li><div class="date-chip"><strong>${e.date.slice(8)}</strong><span>${esc(fmtMonthShort(e.date.slice(0, 7)))}</span></div>
            <div class="grow"><strong>${esc(e.title)}</strong><span class="muted small">${esc([e.time, e.location].filter(Boolean).join(' · '))}</span></div>
            ${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])}</li>`).join('')}</ul>`
      : empty('No hay eventos próximos.');
  }

  function openForm(a) {
    modal({
      title: a ? 'Editar anuncio' : 'Publicar anuncio',
      wide: true,
      body: `<div class="form-grid">
        ${field('Título *', input('title', a?.title, 'required maxlength="150"'), { full: true })}
        ${field('Contenido *', textarea('body', a?.body, 'rows="6" required maxlength="5000"'), { full: true })}
        ${field('Fecha de publicación *', input('publish_date', a?.publish_date || today(), 'type="date" required'))}
        ${field('Vigente hasta', input('expires_date', a?.expires_date, 'type="date"'), { hint: 'Opcional. Después de esta fecha deja de mostrarse.' })}
        ${checkbox('important', 'Marcar como aviso importante', a?.important)}
      </div>`,
      submitLabel: a ? 'Guardar' : 'Publicar',
      onSubmit: async (data) => {
        await api(a ? `/announcements/${a.id}` : '/announcements', { method: a ? 'PUT' : 'POST', body: data });
        toast(a ? 'Anuncio actualizado' : 'Anuncio publicado');
        load();
      },
    });
  }

  el.querySelector('#new')?.addEventListener('click', () => openForm(null));
  el.querySelector('#scope')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    scope = b.dataset.v;
    el.querySelectorAll('#scope button').forEach((x) => x.classList.toggle('on', x === b));
    load();
  });
  el.querySelector('#list').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) openForm(rows.find((a) => a.id === Number(edit.dataset.edit)));
    if (del) {
      const a = rows.find((x) => x.id === Number(del.dataset.del));
      if (!(await confirmDialog(`¿Eliminar el anuncio "${a.title}"?`, 'Eliminar'))) return;
      await api(`/announcements/${a.id}`, { method: 'DELETE' });
      toast('Anuncio eliminado');
      load();
    }
  });
  await Promise.all([load(), loadUpcoming()]);
}
