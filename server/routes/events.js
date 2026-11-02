const router = require('express').Router();
const { all, get, run, tx } = require('../db');
const { can } = require('../auth');
const META = require('../meta');
const v = require('../util');

const placeholders = (list) => list.map(() => '?').join(',');

function readEvent(body) {
  return {
    title: v.text(body.title, 'El título', { required: true, max: 150 }),
    type: v.oneOf(body.type, 'El tipo', META.eventTypes, { fallback: 'culto' }),
    date: v.date(body.date, 'La fecha', { required: true }),
    time: v.time(body.time, 'La hora'),
    location: v.text(body.location, 'El lugar', { max: 150 }),
    description: v.text(body.description, 'La descripción', { max: 3000 }),
    ministry_id: v.id(body.ministry_id, 'El ministerio'),
    responsibles: v.idList(body.responsibles),
  };
}

function checkRefs(e) {
  if (e.ministry_id && !get('SELECT id FROM ministries WHERE id = ?', e.ministry_id)) throw v.bad('El ministerio no existe.');
  if (e.responsibles.length) {
    const found = all(`SELECT id FROM members WHERE id IN (${placeholders(e.responsibles)})`, ...e.responsibles);
    if (found.length !== e.responsibles.length) throw v.bad('Alguno de los responsables no existe.');
  }
}

function saveResponsibles(eventId, ids) {
  run('DELETE FROM event_responsibles WHERE event_id = ?', eventId);
  for (const memberId of ids) run('INSERT INTO event_responsibles (event_id, member_id) VALUES (?, ?)', eventId, memberId);
}

function withResponsibles(events) {
  if (!events.length) return events;
  const ids = events.map((e) => e.id);
  const rows = all(
    `SELECT er.event_id, m.id, m.name FROM event_responsibles er JOIN members m ON m.id = er.member_id
     WHERE er.event_id IN (${placeholders(ids)}) ORDER BY m.name`,
    ...ids
  );
  const byEvent = new Map(ids.map((id) => [id, []]));
  for (const r of rows) byEvent.get(r.event_id).push({ id: r.id, name: r.name });
  return events.map((e) => ({ ...e, responsibles: byEvent.get(e.id) }));
}

const SELECT = `
  SELECT e.*, mi.name AS ministry_name,
    (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND a.present = 1) AS present_count,
    (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id) AS attendance_count
  FROM events e LEFT JOIN ministries mi ON mi.id = e.ministry_id`;

function findEvent(rawId) {
  const event = get(`${SELECT} WHERE e.id = ?`, v.id(rawId, 'El evento', { required: true }));
  if (!event) throw v.notFound('Evento');
  return withResponsibles([event])[0];
}

router.get('/', can('events.read'), (req, res) => {
  const { from, to } = v.range(req.query);
  const status = v.oneOf(req.query.status, 'El estado', { programado: 1, cancelado: 1 });
  const type = v.oneOf(req.query.type, 'El tipo', META.eventTypes);
  const ministry = v.id(req.query.ministry_id, 'El ministerio');
  const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const limit = Math.min(Number(req.query.limit) || 1000, 1000);
  const rows = all(
    `${SELECT}
     WHERE e.date BETWEEN ? AND ? AND (? IS NULL OR e.status = ?) AND (? IS NULL OR e.type = ?)
       AND (? IS NULL OR e.ministry_id = ?)
     ORDER BY e.date ${order}, e.time ${order} LIMIT ?`,
    from, to, status, status, type, type, ministry, ministry, limit
  );
  res.json(withResponsibles(rows));
});

router.get('/:id', can('events.read'), (req, res) => res.json(findEvent(req.params.id)));

router.post('/', can('events.write'), (req, res) => {
  const e = readEvent(req.body);
  checkRefs(e);
  const id = tx(() => {
    const r = run(
      `INSERT INTO events (title, type, date, time, location, description, ministry_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      e.title, e.type, e.date, e.time, e.location, e.description, e.ministry_id, req.user.id
    );
    saveResponsibles(r.lastInsertRowid, e.responsibles);
    return r.lastInsertRowid;
  });
  res.status(201).json(findEvent(id));
});

router.put('/:id', can('events.write'), (req, res) => {
  const { id } = findEvent(req.params.id);
  const e = readEvent(req.body);
  checkRefs(e);
  tx(() => {
    run(
      `UPDATE events SET title = ?, type = ?, date = ?, time = ?, location = ?, description = ?, ministry_id = ? WHERE id = ?`,
      e.title, e.type, e.date, e.time, e.location, e.description, e.ministry_id, id
    );
    saveResponsibles(id, e.responsibles);
  });
  res.json(findEvent(id));
});

// Cancelar o reactivar un evento (no se elimina para conservar el historial).
router.patch('/:id/status', can('events.write'), (req, res) => {
  const { id } = findEvent(req.params.id);
  const status = v.oneOf(req.body.status, 'El estado', { programado: 1, cancelado: 1 }, { required: true });
  run('UPDATE events SET status = ? WHERE id = ?', status, id);
  res.json(findEvent(id));
});

module.exports = router;
