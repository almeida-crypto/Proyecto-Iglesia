const router = require('express').Router();
const { all, get, run } = require('../db');
const { can } = require('../auth');
const v = require('../util');

// Búsqueda sin distinguir mayúsculas ni acentos ("jose" encuentra "José").
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function readMember(body) {
  return {
    name: v.text(body.name, 'El nombre', { required: true, max: 120 }),
    phone: v.text(body.phone, 'El teléfono', { max: 40 }),
    email: v.email(body.email, 'El correo'),
    join_date: v.date(body.join_date, 'La fecha de ingreso'),
    birth_date: v.date(body.birth_date, 'La fecha de nacimiento'),
    address: v.text(body.address, 'La dirección', { max: 255 }),
    notes: v.text(body.notes, 'Las notas', { max: 2000 }),
  };
}

function findMember(rawId) {
  const member = get('SELECT * FROM members WHERE id = ?', v.id(rawId, 'El miembro', { required: true }));
  if (!member) throw v.notFound('Miembro');
  return member;
}

router.get('/', can('members.read'), (req, res) => {
  const status = req.query.status || 'active';
  const where = status === 'active' ? 'WHERE active = 1' : status === 'inactive' ? 'WHERE active = 0' : '';
  let rows = all(`SELECT * FROM members ${where} ORDER BY name COLLATE NOCASE`);
  const q = norm(req.query.q);
  if (q) rows = rows.filter((m) => norm(m.name).includes(q));
  res.json(rows);
});

router.get('/:id', can('members.read'), (req, res) => {
  const member = findMember(req.params.id);
  member.ministries = all(
    `SELECT mi.id, mi.name, (mi.coordinator_id = mm.member_id) AS is_coordinator
     FROM ministry_members mm JOIN ministries mi ON mi.id = mm.ministry_id
     WHERE mm.member_id = ? ORDER BY mi.name`,
    member.id
  );
  member.attendance = get(
    'SELECT COUNT(*) AS total, COALESCE(SUM(present), 0) AS present FROM attendance WHERE member_id = ?',
    member.id
  );
  member.recent_attendance = all(
    `SELECT e.id, e.title, e.date, e.type, a.present
     FROM attendance a JOIN events e ON e.id = a.event_id
     WHERE a.member_id = ? ORDER BY e.date DESC, e.time DESC LIMIT 10`,
    member.id
  );
  res.json(member);
});

router.post('/', can('members.write'), (req, res) => {
  const m = readMember(req.body);
  const r = run(
    'INSERT INTO members (name, phone, email, join_date, birth_date, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    m.name, m.phone, m.email, m.join_date || v.localDate(), m.birth_date, m.address, m.notes
  );
  res.status(201).json(get('SELECT * FROM members WHERE id = ?', r.lastInsertRowid));
});

router.put('/:id', can('members.write'), (req, res) => {
  const { id } = findMember(req.params.id);
  const m = readMember(req.body);
  run(
    `UPDATE members SET name = ?, phone = ?, email = ?, join_date = ?, birth_date = ?, address = ?, notes = ?,
     updated_at = datetime('now') WHERE id = ?`,
    m.name, m.phone, m.email, m.join_date, m.birth_date, m.address, m.notes, id
  );
  res.json(get('SELECT * FROM members WHERE id = ?', id));
});

// Los miembros nunca se eliminan: solo se desactivan o reactivan.
router.patch('/:id/status', can('members.write'), (req, res) => {
  const { id } = findMember(req.params.id);
  run(`UPDATE members SET active = ?, updated_at = datetime('now') WHERE id = ?`, v.bool(req.body.active), id);
  res.json(get('SELECT * FROM members WHERE id = ?', id));
});

module.exports = router;
