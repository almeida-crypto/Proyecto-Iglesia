const router = require('express').Router();
const { all, get, run, tx } = require('../db');
const { can } = require('../auth');
const v = require('../util');

const SELECT = `
  SELECT mi.*, c.name AS coordinator_name,
    (SELECT COUNT(*) FROM ministry_members mm JOIN members m ON m.id = mm.member_id
      WHERE mm.ministry_id = mi.id AND m.active = 1) AS member_count,
    (SELECT COUNT(*) FROM events e WHERE e.ministry_id = mi.id AND e.status = 'programado' AND e.date >= ?) AS upcoming_count
  FROM ministries mi LEFT JOIN members c ON c.id = mi.coordinator_id`;

function readMinistry(body) {
  return {
    name: v.text(body.name, 'El nombre', { required: true, max: 100 }),
    description: v.text(body.description, 'La descripción', { max: 1000 }),
    coordinator_id: v.id(body.coordinator_id, 'El coordinador'),
    active: body.active === undefined ? true : v.bool(body.active),
  };
}

function check(m, id = 0) {
  if (get('SELECT id FROM ministries WHERE name = ? AND id <> ?', m.name, id)) throw v.bad('Ya existe un ministerio con ese nombre.');
  if (m.coordinator_id && !get('SELECT id FROM members WHERE id = ?', m.coordinator_id)) throw v.bad('El coordinador no existe.');
}

// El coordinador siempre forma parte de los integrantes del ministerio.
function ensureCoordinatorIsMember(ministryId, coordinatorId) {
  if (coordinatorId) run('INSERT OR IGNORE INTO ministry_members (ministry_id, member_id) VALUES (?, ?)', ministryId, coordinatorId);
}

function findMinistry(rawId) {
  const m = get(`${SELECT} WHERE mi.id = ?`, v.localDate(), v.id(rawId, 'El ministerio', { required: true }));
  if (!m) throw v.notFound('Ministerio');
  return m;
}

router.get('/', can('ministries.read'), (req, res) => {
  res.json(all(`${SELECT} ORDER BY mi.active DESC, mi.name COLLATE NOCASE`, v.localDate()));
});

router.get('/:id', can('ministries.read'), (req, res) => {
  const ministry = findMinistry(req.params.id);
  const today = v.localDate();
  ministry.members = all(
    `SELECT m.id, m.name, m.phone, m.email, m.active, mm.joined_at
     FROM ministry_members mm JOIN members m ON m.id = mm.member_id
     WHERE mm.ministry_id = ? ORDER BY m.active DESC, m.name COLLATE NOCASE`,
    ministry.id
  );
  ministry.upcoming_events = all(
    `SELECT id, title, date, time, location, type, status FROM events
     WHERE ministry_id = ? AND date >= ? ORDER BY date, time LIMIT 20`,
    ministry.id, today
  );
  ministry.past_events = all(
    `SELECT e.id, e.title, e.date, e.time, e.type, e.status,
       (SELECT COUNT(*) FROM attendance a WHERE a.event_id = e.id AND a.present = 1) AS present_count
     FROM events e WHERE e.ministry_id = ? AND e.date < ? ORDER BY e.date DESC LIMIT 10`,
    ministry.id, today
  );
  res.json(ministry);
});

router.post('/', can('ministries.write'), (req, res) => {
  const m = readMinistry(req.body);
  check(m);
  const id = tx(() => {
    const r = run('INSERT INTO ministries (name, description, coordinator_id, active) VALUES (?, ?, ?, ?)', m.name, m.description, m.coordinator_id, m.active);
    ensureCoordinatorIsMember(r.lastInsertRowid, m.coordinator_id);
    return r.lastInsertRowid;
  });
  res.status(201).json(findMinistry(id));
});

router.put('/:id', can('ministries.write'), (req, res) => {
  const { id } = findMinistry(req.params.id);
  const m = readMinistry(req.body);
  check(m, id);
  tx(() => {
    run('UPDATE ministries SET name = ?, description = ?, coordinator_id = ?, active = ? WHERE id = ?', m.name, m.description, m.coordinator_id, m.active, id);
    ensureCoordinatorIsMember(id, m.coordinator_id);
  });
  res.json(findMinistry(id));
});

router.put('/:id/members', can('ministries.write'), (req, res) => {
  const ministry = findMinistry(req.params.id);
  const ids = v.idList(req.body.member_ids);
  tx(() => {
    const current = new Set(all('SELECT member_id FROM ministry_members WHERE ministry_id = ?', ministry.id).map((r) => r.member_id));
    const wanted = new Set(ids);
    for (const memberId of current) {
      if (!wanted.has(memberId)) run('DELETE FROM ministry_members WHERE ministry_id = ? AND member_id = ?', ministry.id, memberId);
    }
    for (const memberId of wanted) {
      if (!current.has(memberId)) {
        if (!get('SELECT id FROM members WHERE id = ?', memberId)) throw v.bad('Alguno de los miembros no existe.');
        run('INSERT INTO ministry_members (ministry_id, member_id) VALUES (?, ?)', ministry.id, memberId);
      }
    }
    ensureCoordinatorIsMember(ministry.id, ministry.coordinator_id);
  });
  res.json(findMinistry(ministry.id));
});

module.exports = router;
