import { api } from '../api.js';
import { esc, icon, fmtDate, fmtMonthShort, money, chart, empty, pageHead, badge, verseOfDay, TYPE_COLORS, CHART_COLORS } from '../ui.js';

const stat = (label, value, sub, ic, tone = '') => `
  <div class="stat ${tone}">
    <div class="stat-icon">${icon(ic)}</div>
    <div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(value)}</strong>${sub ? `<span class="stat-sub">${esc(sub)}</span>` : ''}</div>
  </div>`;

export async function render(el, ctx) {
  const d = await api('/dashboard');
  const currency = ctx.settings?.currency || 'USD';
  const f = d.finance;
  const change = f && f.previous_month ? Math.round(((f.month - f.previous_month) / f.previous_month) * 100) : null;

  const [verse, ref] = verseOfDay();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  el.innerHTML = `
    ${pageHead('Panel principal', `${greeting}, ${ctx.user.name}. Que Dios bendiga su servicio.`)}
    <section class="verse-banner">
      <span class="verse-cross">${icon('cross')}</span>
      <div><span class="eyebrow">Versículo del día</span><blockquote>“${esc(verse)}”</blockquote><cite>${esc(ref)}</cite></div>
    </section>
    <div class="stats">
      ${stat('Miembros activos', d.members.active, `${d.members.inactive} inactivos`, 'users')}
      ${stat('Eventos próximos', d.upcoming_count, 'en los próximos 30 días', 'calendar', 'green')}
      ${stat('Asistencias registradas', d.attendance.total, `${d.attendance.month} este mes`, 'check', 'amber')}
      ${stat('Ministerios', d.ministries, 'activos', 'layers', 'violet')}
      ${f ? stat('Ingresos del mes', money(f.month, currency), change === null ? `Año: ${money(f.year, currency)}` : `${change >= 0 ? '+' : ''}${change}% vs. mes anterior`, 'wallet', 'pink') : ''}
    </div>

    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Asistencia semanal</h2><span class="muted small">Últimas 12 semanas</span></div>
        <div class="chart-box"><canvas id="ch-att"></canvas></div>
      </section>
      <section class="card">
        ${f
          ? `<div class="card-head"><h2>Ingresos por mes</h2><span class="muted small">Últimos 12 meses</span></div>`
          : `<div class="card-head"><h2>Nuevos miembros</h2><span class="muted small">Últimos 12 meses</span></div>`}
        <div class="chart-box"><canvas id="ch-2"></canvas></div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Próximos eventos</h2><a href="#/eventos" class="small">Ver calendario</a></div>
        ${d.upcoming.length
          ? `<ul class="event-list">${d.upcoming.map((e) => `
              <li>
                <div class="date-chip"><strong>${e.date.slice(8)}</strong><span>${esc(fmtMonthShort(e.date.slice(0, 7)))}</span></div>
                <div class="grow"><strong>${esc(e.title)}</strong>
                  <span class="muted small">${e.time ? `${icon('clock')} ${esc(e.time)}` : ''} ${e.location ? `${icon('pin')} ${esc(e.location)}` : ''}</span></div>
                ${badge(ctx.meta.eventTypes[e.type], TYPE_COLORS[e.type])}
              </li>`).join('')}</ul>`
          : empty('No hay eventos programados.')}
      </section>
      <section class="card">
        <div class="card-head"><h2>Avisos</h2><a href="#/anuncios" class="small">Ver todos</a></div>
        ${d.announcements.length
          ? `<ul class="notice-list">${d.announcements.map((a) => `
              <li class="${a.important ? 'important' : ''}">
                <strong>${a.important ? icon('star') : ''}${esc(a.title)}</strong>
                <p>${esc(a.body.length > 140 ? `${a.body.slice(0, 140)}…` : a.body)}</p>
                <span class="muted small">${fmtDate(a.publish_date)}</span>
              </li>`).join('')}</ul>`
          : empty('No hay avisos vigentes.')}
      </section>
      <section class="card span-2">
        <div class="card-head"><h2>Integrantes por ministerio</h2></div>
        <div class="chart-box short"><canvas id="ch-min"></canvas></div>
      </section>
    </div>`;

  const weekLabel = (p) => fmtDate(p).replace(/ de \d{4}|\.? \d{4}$/, '');
  const charts = [
    chart(el.querySelector('#ch-att'), {
      type: 'line',
      data: {
        labels: d.charts.attendance_weekly.map((w) => weekLabel(w.period)),
        datasets: [{ data: d.charts.attendance_weekly.map((w) => w.present), borderColor: CHART_COLORS[0], backgroundColor: 'rgba(122,31,43,.10)', fill: true, tension: 0.35, pointRadius: 3 }],
      },
      options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { tooltip: { callbacks: { label: (c) => `${c.raw} asistencias` } } } },
    }),
    f
      ? chart(el.querySelector('#ch-2'), {
          type: 'bar',
          data: { labels: f.by_month.map((m) => fmtMonthShort(m.period)), datasets: [{ data: f.by_month.map((m) => m.total / 100), backgroundColor: CHART_COLORS[1], borderRadius: 6 }] },
          options: { scales: { y: { beginAtZero: true } }, plugins: { tooltip: { callbacks: { label: (c) => money(c.raw * 100, currency) } } } },
        })
      : chart(el.querySelector('#ch-2'), {
          type: 'bar',
          data: { labels: d.charts.new_members.map((m) => fmtMonthShort(m.period)), datasets: [{ data: d.charts.new_members.map((m) => m.count), backgroundColor: CHART_COLORS[1], borderRadius: 6 }] },
          options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
        }),
    chart(el.querySelector('#ch-min'), {
      type: 'bar',
      data: {
        labels: d.charts.ministry_members.map((m) => m.name),
        datasets: [{ data: d.charts.ministry_members.map((m) => m.count), backgroundColor: d.charts.ministry_members.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]), borderRadius: 6 }],
      },
      options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    }),
  ];
  return () => charts.forEach((c) => c?.destroy());
}
