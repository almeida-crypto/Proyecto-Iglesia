import { api } from '../api.js';
import { esc, icon, field, input, textarea, select, serialize, toast, pageHead } from '../ui.js';

export async function render(el, ctx) {
  const canEdit = ctx.can('config.edit');
  let s = await api('/settings');
  const days = ctx.meta.days;
  const dis = canEdit ? '' : 'disabled';

  const scheduleRow = (sc = {}) => `
    <div class="schedule-row">
      ${input('name', sc.name, `placeholder="Ej. Culto dominical" maxlength="100" ${dis}`)}
      ${select('day_of_week', days.map((d, i) => [i, d]), sc.day_of_week ?? 0, dis)}
      ${input('time', sc.time, `type="time" ${dis}`)}
      ${input('location', sc.location, `placeholder="Lugar" maxlength="150" ${dis}`)}
      ${canEdit ? `<button type="button" class="icon-btn danger" data-remove title="Quitar">${icon('trash')}</button>` : ''}
    </div>`;

  function draw() {
    el.innerHTML = `
      ${pageHead('Configuración de la iglesia', canEdit ? 'Información institucional, logotipo y horarios' : 'Información institucional (solo lectura)')}
      <div class="grid-2 settings">
        <form class="card" id="info" novalidate>
          <div class="card-head"><h2>Información institucional</h2></div>
          <div class="form-grid">
            ${field('Nombre de la iglesia *', input('name', s.name, `required maxlength="150" ${dis}`), { full: true })}
            ${field('Dirección', input('address', s.address, `maxlength="255" ${dis}`), { full: true })}
            ${field('Teléfono', input('phone', s.phone, `type="tel" maxlength="40" ${dis}`))}
            ${field('Correo de contacto', input('email', s.email, `type="email" ${dis}`))}
            ${field('Sitio web', input('website', s.website, `maxlength="200" ${dis}`))}
            ${field('Moneda', input('currency', s.currency, `maxlength="3" style="text-transform:uppercase" ${dis}`), { hint: 'Código ISO: USD, MXN, EUR, COP…' })}
            ${field('Descripción / misión', textarea('description', s.description, `rows="4" maxlength="2000" ${dis}`), { full: true })}
          </div>
          <div class="form-error" hidden></div>
          ${canEdit ? '<div class="form-foot"><button type="submit" class="btn primary">Guardar información</button></div>' : ''}
        </form>
        <div>
          <section class="card">
            <div class="card-head"><h2>Logotipo</h2></div>
            <div class="logo-box">
              ${s.logo ? `<img src="/uploads/${esc(s.logo)}" alt="Logotipo">` : `<div class="brand-mark lg">${icon('cross')}</div>`}
              ${canEdit ? `<div class="stack">
                <label class="btn">${icon('download')} Subir imagen<input type="file" id="logo" accept="image/png,image/jpeg,image/webp" hidden></label>
                ${s.logo ? '<button type="button" class="btn danger" id="remove-logo">Quitar logotipo</button>' : ''}
                <small class="muted">PNG, JPG o WEBP, máximo 2 MB.</small></div>` : ''}
            </div>
          </section>
        </div>
          <form class="card span-2" id="schedules" novalidate>
            <div class="card-head"><h2>Horarios habituales de reuniones</h2></div>
            <div class="schedule-head"><span>Reunión</span><span>Día</span><span>Hora</span><span>Lugar</span></div>
            <div id="rows">${s.schedules.map(scheduleRow).join('') || (canEdit ? '' : '<p class="muted">Sin horarios registrados.</p>')}</div>
            <div class="form-error" hidden></div>
            ${canEdit ? `<div class="form-foot"><button type="button" class="btn" id="add">${icon('plus')} Agregar horario</button><button type="submit" class="btn primary">Guardar horarios</button></div>` : ''}
          </form>
      </div>`;
    if (canEdit) bind();
  }

  function bind() {
    const info = el.querySelector('#info');
    info.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = info.querySelector('.form-error');
      err.hidden = true;
      try {
        s = await api('/settings', { method: 'PUT', body: serialize(info) });
        toast('Información actualizada');
        ctx.refreshSettings();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });

    el.querySelector('#logo').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('logo', file);
      try {
        await api('/settings/logo', { method: 'POST', body: fd });
        toast('Logotipo actualizado');
        ctx.refreshSettings();
      } catch (ex) {
        toast(ex.message, 'error');
      }
    });
    el.querySelector('#remove-logo')?.addEventListener('click', async () => {
      await api('/settings/logo', { method: 'DELETE' });
      toast('Logotipo eliminado');
      ctx.refreshSettings();
    });

    const sched = el.querySelector('#schedules');
    const rows = sched.querySelector('#rows');
    sched.querySelector('#add').addEventListener('click', () => rows.insertAdjacentHTML('beforeend', scheduleRow()));
    rows.addEventListener('click', (e) => e.target.closest('[data-remove]')?.closest('.schedule-row').remove());
    sched.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = sched.querySelector('.form-error');
      err.hidden = true;
      const schedules = [...rows.querySelectorAll('.schedule-row')].map((r) => ({
        name: r.querySelector('[name=name]').value,
        day_of_week: Number(r.querySelector('[name=day_of_week]').value),
        time: r.querySelector('[name=time]').value,
        location: r.querySelector('[name=location]').value,
      }));
      try {
        s = await api('/settings/schedules', { method: 'PUT', body: { schedules } });
        toast('Horarios guardados');
        draw();
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      }
    });
  }

  draw();
}
