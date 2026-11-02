const router = require('express').Router();
const { all, get, run, tx } = require('../db');
const { can } = require('../auth');
const stats = require('../stats');
const v = require('../util');

function findEvent(rawId) {
  const event = get('SELECT * FROM events WHERE id = ?', v.id(rawId, 'El evento', { required: true }));
  if (!event) throw v.notFound('Evento');
  return event;
}

// Hoja de asistencia: miembros activos + cualquier miembro (aunque esté inactivo) que ya tenga registro.
router.get('/event/:id', can('attendance.read'), (req, res) => {
  const event = findEvent(req.params.id);
  const members = all(
    `SELECT m.id, m.name, m.active, a.present, a.recorded_at
     FROM members m LEFT JOIN attendance a ON a.member_id = m.id AND a.event_id = ?
     WHERE m.active = 1 OR a.event_id IS NOT NULL
     ORDER BY m.name COLLATE NOCASE`,
    event.id
  );
  const recorded = members.filter((m) => m.present !== null);
  res.json({
    event,
    members,
    recorded: recorded.length > 0,
    last_update: recorded.reduce((max, m) => (!max || m.recorded_at > max ? m.recorded_at : max), null),
  });
});

router.put('/event/:id', can('attendance.write'), (req, res) => {
  const event = findEvent(req.params.id);
  if (event.status === 'cancelado') throw v.bad('No se puede registrar asistencia en un evento cancelado.');
  const records = Array.isArray(req.body.records) ? req.body.records : [];
  const clean = records.map((r) => ({ member_id: v.id(r.member_id, 'El miembro', { required: true }), present: v.bool(r.present) }));
  tx(() => {
    for (const r of clean) {
      run(
        `INSERT INTO attendance (event_id, member_id, present, recorded_by) VALUES (?, ?, ?, ?)
         ON CONFLICT (event_id, member_id) DO UPDATE SET present = excluded.present,
           recorded_by = excluded.recorded_by, recorded_at = datetime('now')`,
        event.id, r.member_id, r.present, req.user.id
      );
    }
  });
  const totals = get(
    'SELECT COALESCE(SUM(present = 1), 0) AS present, COALESCE(SUM(present = 0), 0) AS absent FROM attendance WHERE event_id = ?',
    event.id
  );
  res.json({ ok: true, ...totals });
});

// Historial: por evento (totales) o, si se indica member_id, el detalle de un miembro.
router.get('/history', can('attendance.read'), (req, res) => {
  const { from, to } = v.range(req.query);
  const memberId = v.id(req.query.member_id, 'El miembro');
  if (memberId) {
    return res.json(
      all(
        `SELECT e.id, e.date, e.time, e.title, e.type, a.present
         FROM attendance a JOIN events e ON e.id = a.event_id
         WHERE a.member_id = ? AND e.date BETWEEN ? AND ?
         ORDER BY e.date DESC, e.time DESC`,
        memberId, from, to
      )
    );
  }
  res.json(stats.attendanceByEvent(from, to));
});

router.get('/summary', can('attendance.read'), (req, res) => {
  const { from, to } = v.range(req.query);
  const period = req.query.period === 'week' ? 'week' : 'month';
  res.json(stats.attendanceByPeriod(period, from, to));
});

module.exports = router;
