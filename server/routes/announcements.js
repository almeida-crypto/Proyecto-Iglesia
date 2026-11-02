const router = require('express').Router();
const { all, get, run } = require('../db');
const { can, hasPerm } = require('../auth');
const v = require('../util');

const SELECT = `SELECT a.*, u.name AS author FROM announcements a LEFT JOIN users u ON u.id = a.created_by`;

function readAnnouncement(body) {
  const a = {
    title: v.text(body.title, 'El título', { required: true, max: 150 }),
    body: v.text(body.body, 'El contenido', { required: true, max: 5000 }),
    publish_date: v.date(body.publish_date, 'La fecha de publicación', { required: true }),
    expires_date: v.date(body.expires_date, 'La fecha de vencimiento'),
    important: v.bool(body.important),
  };
  if (a.expires_date && a.expires_date < a.publish_date) throw v.bad('El vencimiento no puede ser anterior a la publicación.');
  return a;
}

function findAnnouncement(rawId) {
  const a = get(`${SELECT} WHERE a.id = ?`, v.id(rawId, 'El anuncio', { required: true }));
  if (!a) throw v.notFound('Anuncio');
  return a;
}

// scope=current: solo anuncios vigentes. scope=all (solo quien publica): incluye programados y vencidos.
router.get('/', can('announcements.read'), (req, res) => {
  const today = v.localDate();
  const showAll = req.query.scope === 'all' && hasPerm(req.user, 'announcements.write');
  const rows = showAll
    ? all(`${SELECT} ORDER BY a.publish_date DESC, a.id DESC`)
    : all(
        `${SELECT} WHERE a.publish_date <= ? AND (a.expires_date IS NULL OR a.expires_date >= ?)
         ORDER BY a.important DESC, a.publish_date DESC, a.id DESC`,
        today, today
      );
  res.json(rows);
});

router.post('/', can('announcements.write'), (req, res) => {
  const a = readAnnouncement(req.body);
  const r = run(
    'INSERT INTO announcements (title, body, publish_date, expires_date, important, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    a.title, a.body, a.publish_date, a.expires_date, a.important, req.user.id
  );
  res.status(201).json(findAnnouncement(r.lastInsertRowid));
});

router.put('/:id', can('announcements.write'), (req, res) => {
  const { id } = findAnnouncement(req.params.id);
  const a = readAnnouncement(req.body);
  run(
    `UPDATE announcements SET title = ?, body = ?, publish_date = ?, expires_date = ?, important = ?, updated_at = datetime('now') WHERE id = ?`,
    a.title, a.body, a.publish_date, a.expires_date, a.important, id
  );
  res.json(findAnnouncement(id));
});

router.delete('/:id', can('announcements.write'), (req, res) => {
  const { id } = findAnnouncement(req.params.id);
  run('DELETE FROM announcements WHERE id = ?', id);
  res.json({ ok: true });
});

module.exports = router;
