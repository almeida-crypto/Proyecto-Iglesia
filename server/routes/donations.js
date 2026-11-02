const router = require('express').Router();
const { all, get, run } = require('../db');
const { can } = require('../auth');
const META = require('../meta');
const stats = require('../stats');
const v = require('../util');

// Toda la información financiera requiere permiso explícito (RF-06).
router.use(can('finances.read'));

const SELECT = `SELECT d.*, m.name AS member_name, u.name AS created_by_name
  FROM donations d LEFT JOIN members m ON m.id = d.member_id LEFT JOIN users u ON u.id = d.created_by`;

function readDonation(body) {
  const amount = Number(String(body.amount ?? '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) throw v.bad('El monto debe ser un número mayor a cero.');
  if (amount > 100_000_000) throw v.bad('El monto es demasiado alto.');
  const d = {
    date: v.date(body.date, 'La fecha', { required: true }),
    amount_cents: Math.round(amount * 100),
    concept: v.oneOf(body.concept, 'El concepto', META.concepts, { required: true }),
    method: v.oneOf(body.method, 'El método de recepción', META.methods, { required: true }),
    member_id: v.id(body.member_id, 'El miembro'), // opcional: las aportaciones pueden ser anónimas
    notes: v.text(body.notes, 'Las notas', { max: 500 }),
  };
  if (d.member_id && !get('SELECT id FROM members WHERE id = ?', d.member_id)) throw v.bad('El miembro no existe.');
  return d;
}

function findDonation(rawId) {
  const d = get(`${SELECT} WHERE d.id = ?`, v.id(rawId, 'La aportación', { required: true }));
  if (!d) throw v.notFound('Aportación');
  return d;
}

router.get('/', (req, res) => {
  const { from, to } = v.range(req.query);
  const concept = v.oneOf(req.query.concept, 'El concepto', META.concepts);
  const method = v.oneOf(req.query.method, 'El método', META.methods);
  const rows = all(
    `${SELECT} WHERE d.date BETWEEN ? AND ? AND (? IS NULL OR d.concept = ?) AND (? IS NULL OR d.method = ?)
     ORDER BY d.date DESC, d.id DESC`,
    from, to, concept, concept, method, method
  );
  res.json({ rows, total: rows.reduce((s, r) => s + r.amount_cents, 0) });
});

// Resumen mensual: totales, desglose por concepto y método, y tendencia de 12 meses.
router.get('/summary', (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : v.localDate().slice(0, 7);
  const { from, to } = v.monthBounds(month);
  const months = v.monthsBack(month, 13);
  const prev = v.monthBounds(months[11]);
  const totals = get(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total, COUNT(*) AS count, COALESCE(SUM(member_id IS NULL), 0) AS anonymous
     FROM donations WHERE date BETWEEN ? AND ?`,
    from, to
  );
  const previous = get('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM donations WHERE date BETWEEN ? AND ?', prev.from, prev.to);
  const trendMonths = months.slice(1);
  res.json({
    month,
    ...totals,
    previous_total: previous.total,
    by_concept: stats.incomeBy('concept', from, to),
    by_method: stats.incomeBy('method', from, to),
    trend: stats.fillSeries(trendMonths, stats.incomeByMonth(`${trendMonths[0]}-01`, to), ['total', 'count']),
  });
});

router.post('/', can('finances.write'), (req, res) => {
  const d = readDonation(req.body);
  const r = run(
    'INSERT INTO donations (date, amount_cents, concept, method, member_id, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    d.date, d.amount_cents, d.concept, d.method, d.member_id, d.notes, req.user.id
  );
  res.status(201).json(findDonation(r.lastInsertRowid));
});

router.put('/:id', can('finances.write'), (req, res) => {
  const { id } = findDonation(req.params.id);
  const d = readDonation(req.body);
  run(
    'UPDATE donations SET date = ?, amount_cents = ?, concept = ?, method = ?, member_id = ?, notes = ? WHERE id = ?',
    d.date, d.amount_cents, d.concept, d.method, d.member_id, d.notes, id
  );
  res.json(findDonation(id));
});

router.delete('/:id', can('finances.write'), (req, res) => {
  const { id } = findDonation(req.params.id);
  run('DELETE FROM donations WHERE id = ?', id);
  res.json({ ok: true });
});

module.exports = router;
