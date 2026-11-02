const router = require('express').Router();
const { all, get } = require('../db');
const { hasPerm } = require('../auth');
const META = require('../meta');
const stats = require('../stats');
const { toXlsx, toPdf } = require('../report-render');
const v = require('../util');

const fmtDate = (d) => d.split('-').reverse().join('/');
function rangeLabel(r) {
  if (r.hasFrom && r.hasTo) return `Del ${fmtDate(r.from)} al ${fmtDate(r.to)}`;
  if (r.hasFrom) return `Desde el ${fmtDate(r.from)}`;
  if (r.hasTo) return `Hasta el ${fmtDate(r.to)}`;
  return 'Todo el historial';
}
const sum = (rows, key) => rows.reduce((s, r) => s + (r[key] || 0), 0);

const REPORTS = {
  miembros: {
    perm: 'members.read',
    build(q) {
      const status = ['active', 'inactive'].includes(q.status) ? q.status : 'all';
      const where = status === 'active' ? 'WHERE m.active = 1' : status === 'inactive' ? 'WHERE m.active = 0' : '';
      const rows = all(
        `SELECT m.*,
           (SELECT COUNT(*) FROM ministry_members mm WHERE mm.member_id = m.id) AS ministries,
           (SELECT COUNT(*) FROM attendance a WHERE a.member_id = m.id AND a.present = 1) AS attended
         FROM members m ${where} ORDER BY m.name COLLATE NOCASE`
      ).map((m) => ({ ...m, status: m.active ? 'Activo' : 'Inactivo' }));
      const label = { active: 'Activos', inactive: 'Inactivos', all: 'Todos' }[status];
      return {
        title: 'Reporte general de miembros',
        subtitle: `Estado: ${label}  ·  Total: ${rows.length}`,
        filename: 'reporte-miembros',
        columns: [
          { key: 'name', label: 'Nombre', width: 3 },
          { key: 'phone', label: 'Teléfono', width: 1.8 },
          { key: 'email', label: 'Correo', width: 3 },
          { key: 'join_date', label: 'Ingreso', type: 'date', width: 1.4 },
          { key: 'status', label: 'Estado', width: 1.2 },
          { key: 'ministries', label: 'Ministerios', type: 'number', width: 1.3 },
          { key: 'attended', label: 'Asistencias', type: 'number', width: 1.3 },
        ],
        rows,
      };
    },
  },

  asistencia: {
    perm: 'attendance.read',
    build(q) {
      const eventId = v.id(q.event_id, 'El evento');
      if (eventId) {
        const event = get('SELECT * FROM events WHERE id = ?', eventId);
        if (!event) throw v.notFound('Evento');
        const rows = all(
          `SELECT m.name, m.phone, a.present FROM attendance a JOIN members m ON m.id = a.member_id
           WHERE a.event_id = ? ORDER BY a.present DESC, m.name COLLATE NOCASE`,
          eventId
        ).map((r) => ({ ...r, state: r.present ? 'Presente' : 'Ausente' }));
        const present = rows.filter((r) => r.present).length;
        return {
          title: `Asistencia: ${event.title}`,
          subtitle: `${META.eventTypes[event.type]}  ·  ${fmtDate(event.date)}${event.time ? ` ${event.time}` : ''}  ·  Presentes: ${present} de ${rows.length}`,
          filename: `asistencia-evento-${event.id}`,
          columns: [
            { key: 'name', label: 'Miembro', width: 3 },
            { key: 'phone', label: 'Teléfono', width: 2 },
            { key: 'state', label: 'Asistencia', width: 1.5 },
          ],
          rows,
        };
      }
      const r = v.range(q);
      const rows = stats.attendanceByEvent(r.from, r.to).map((e) => ({ ...e, type_label: META.eventTypes[e.type] }));
      const present = sum(rows, 'present');
      const total = sum(rows, 'total');
      return {
        title: 'Reporte de asistencia por evento',
        subtitle: `${rangeLabel(r)}  ·  Eventos: ${rows.length}`,
        filename: 'reporte-asistencia-eventos',
        columns: [
          { key: 'date', label: 'Fecha', type: 'date', width: 1.3 },
          { key: 'title', label: 'Evento', width: 3 },
          { key: 'type_label', label: 'Tipo', width: 1.4 },
          { key: 'present', label: 'Presentes', type: 'number', width: 1.2 },
          { key: 'absent', label: 'Ausentes', type: 'number', width: 1.2 },
          { key: 'rate', label: '% Asistencia', type: 'percent', width: 1.3 },
        ],
        rows,
        totals: { title: 'Total', present, absent: sum(rows, 'absent'), rate: total ? (present / total) * 100 : 0 },
      };
    },
  },

  'asistencia-periodo': {
    perm: 'attendance.read',
    build(q) {
      const r = v.range(q);
      const period = q.period === 'week' ? 'week' : 'month';
      const rows = stats.attendanceByPeriod(period, r.from, r.to).map((p) => ({
        ...p,
        label: period === 'week' ? `Semana del ${fmtDate(p.period)}` : monthLabel(p.period),
      }));
      const events = sum(rows, 'events');
      const present = sum(rows, 'present');
      return {
        title: `Reporte ${period === 'week' ? 'semanal' : 'mensual'} de asistencia`,
        subtitle: rangeLabel(r),
        filename: `reporte-asistencia-${period === 'week' ? 'semanal' : 'mensual'}`,
        columns: [
          { key: 'label', label: 'Periodo', width: 2.5 },
          { key: 'events', label: 'Eventos', type: 'number', width: 1 },
          { key: 'present', label: 'Presentes', type: 'number', width: 1.2 },
          { key: 'absent', label: 'Ausentes', type: 'number', width: 1.2 },
          { key: 'average', label: 'Promedio por evento', type: 'number', width: 1.6 },
        ],
        rows,
        totals: { label: 'Total', events, present, absent: sum(rows, 'absent'), average: events ? Math.round((present / events) * 10) / 10 : 0 },
      };
    },
  },

  ministerios: {
    perm: 'ministries.read',
    build(q) {
      const r = v.range(q);
      const rows = all(
        `SELECT mi.name, c.name AS coordinator, mi.active,
           (SELECT COUNT(*) FROM ministry_members mm JOIN members m ON m.id = mm.member_id
             WHERE mm.ministry_id = mi.id AND m.active = 1) AS members,
           (SELECT COUNT(*) FROM events e WHERE e.ministry_id = mi.id AND e.status = 'programado'
             AND e.date BETWEEN ? AND ?) AS events,
           (SELECT COUNT(*) FROM attendance a JOIN events e ON e.id = a.event_id
             WHERE e.ministry_id = mi.id AND a.present = 1 AND e.date BETWEEN ? AND ?) AS attendances
         FROM ministries mi LEFT JOIN members c ON c.id = mi.coordinator_id
         ORDER BY mi.active DESC, mi.name COLLATE NOCASE`,
        r.from, r.to, r.from, r.to
      ).map((m) => ({
        ...m,
        status: m.active ? 'Activo' : 'Inactivo',
        average: m.events ? Math.round((m.attendances / m.events) * 10) / 10 : 0,
      }));
      return {
        title: 'Reporte de participación por ministerio',
        subtitle: `${rangeLabel(r)}  ·  Ministerios: ${rows.length}`,
        filename: 'reporte-ministerios',
        columns: [
          { key: 'name', label: 'Ministerio', width: 2.2 },
          { key: 'coordinator', label: 'Coordinador', width: 2.2 },
          { key: 'status', label: 'Estado', width: 1.1 },
          { key: 'members', label: 'Integrantes', type: 'number', width: 1.2 },
          { key: 'events', label: 'Eventos', type: 'number', width: 1 },
          { key: 'attendances', label: 'Asistencias', type: 'number', width: 1.2 },
          { key: 'average', label: 'Promedio', type: 'number', width: 1.1 },
        ],
        rows,
        totals: { name: 'Total', members: sum(rows, 'members'), events: sum(rows, 'events'), attendances: sum(rows, 'attendances') },
      };
    },
  },

  ingresos: {
    perm: 'finances.read',
    build(q) {
      const r = v.range(q);
      const group = ['mes', 'concepto', 'metodo'].includes(q.group) ? q.group : 'detalle';
      const base = { filename: `reporte-ingresos-${group}` };
      let built;
      if (group === 'mes') {
        const rows = stats.incomeByMonth(r.from, r.to).map((m) => ({ ...m, label: monthLabel(m.period) }));
        built = {
          title: 'Reporte de ingresos por mes',
          columns: [
            { key: 'label', label: 'Mes', width: 2.5 },
            { key: 'count', label: 'Registros', type: 'number', width: 1 },
            { key: 'total', label: 'Total', type: 'money', width: 1.6 },
          ],
          rows,
          totals: { label: 'Total', count: sum(rows, 'count'), total: sum(rows, 'total') },
        };
      } else if (group === 'concepto' || group === 'metodo') {
        const field = group === 'concepto' ? 'concept' : 'method';
        const labels = group === 'concepto' ? META.concepts : META.methods;
        const rows = stats.incomeBy(field, r.from, r.to);
        const grand = sum(rows, 'total');
        built = {
          title: `Reporte de ingresos por ${group === 'concepto' ? 'concepto' : 'método de recepción'}`,
          columns: [
            { key: 'label', label: group === 'concepto' ? 'Concepto' : 'Método', width: 2.5 },
            { key: 'count', label: 'Registros', type: 'number', width: 1 },
            { key: 'total', label: 'Total', type: 'money', width: 1.6 },
            { key: 'share', label: '% del total', type: 'percent', width: 1.2 },
          ],
          rows: rows.map((x) => ({ ...x, label: labels[x.key] || x.key, share: grand ? (x.total / grand) * 100 : 0 })),
          totals: { label: 'Total', count: sum(rows, 'count'), total: grand, share: grand ? 100 : 0 },
        };
      } else {
        const rows = all(
          `SELECT d.*, m.name AS member_name FROM donations d LEFT JOIN members m ON m.id = d.member_id
           WHERE d.date BETWEEN ? AND ? ORDER BY d.date, d.id`,
          r.from, r.to
        ).map((d) => ({
          ...d,
          concept_label: META.concepts[d.concept] || d.concept,
          method_label: META.methods[d.method] || d.method,
          donor: d.member_name || 'Anónimo',
        }));
        built = {
          title: 'Reporte de ingresos (detalle)',
          columns: [
            { key: 'date', label: 'Fecha', type: 'date', width: 1.2 },
            { key: 'concept_label', label: 'Concepto', width: 1.4 },
            { key: 'method_label', label: 'Método', width: 1.4 },
            { key: 'donor', label: 'Aportante', width: 2.4 },
            { key: 'notes', label: 'Notas', width: 2.4 },
            { key: 'amount_cents', label: 'Monto', type: 'money', width: 1.4 },
          ],
          rows,
          totals: { date: null, concept_label: 'Total', amount_cents: sum(rows, 'amount_cents') },
        };
      }
      return { ...base, ...built, subtitle: rangeLabel(r) };
    },
  },
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function monthLabel(period) {
  const [y, m] = period.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`.replace(/^./, (c) => c.toUpperCase());
}

router.get('/:type', async (req, res) => {
  const def = Object.hasOwn(REPORTS, req.params.type) ? REPORTS[req.params.type] : null;
  if (!def) throw v.notFound('Reporte');
  if (!hasPerm(req.user, def.perm)) throw new v.HttpError(403, 'No tiene permisos para este reporte.');
  const report = def.build(req.query);
  if (req.query.format === 'xlsx') return toXlsx(report, res);
  if (req.query.format === 'pdf') return toPdf(report, res);
  res.json(report);
});

module.exports = router;
