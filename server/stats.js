// Consultas agregadas compartidas por el dashboard, la asistencia, las aportaciones y los reportes.
const { all } = require('./db');

const PERIOD_SQL = {
  week: `date(e.date, '-6 days', 'weekday 1')`, // lunes de la semana
  month: `strftime('%Y-%m', e.date)`,
};

function attendanceByPeriod(period, from, to) {
  const key = PERIOD_SQL[period] || PERIOD_SQL.month;
  return all(
    `SELECT ${key} AS period,
       COUNT(DISTINCT e.id) AS events,
       COALESCE(SUM(a.present = 1), 0) AS present,
       COALESCE(SUM(a.present = 0), 0) AS absent
     FROM events e JOIN attendance a ON a.event_id = e.id
     WHERE e.status = 'programado' AND e.date BETWEEN ? AND ?
     GROUP BY period ORDER BY period`,
    from, to
  ).map((r) => ({ ...r, average: r.events ? Math.round((r.present / r.events) * 10) / 10 : 0 }));
}

function attendanceByEvent(from, to) {
  return all(
    `SELECT e.id, e.date, e.time, e.title, e.type,
       COALESCE(SUM(a.present = 1), 0) AS present,
       COALESCE(SUM(a.present = 0), 0) AS absent,
       COUNT(a.member_id) AS total
     FROM events e JOIN attendance a ON a.event_id = e.id
     WHERE e.date BETWEEN ? AND ?
     GROUP BY e.id ORDER BY e.date DESC, e.time DESC`,
    from, to
  ).map((r) => ({ ...r, rate: r.total ? Math.round((r.present / r.total) * 100) : 0 }));
}

function incomeByMonth(from, to) {
  return all(
    `SELECT strftime('%Y-%m', date) AS period, SUM(amount_cents) AS total, COUNT(*) AS count
     FROM donations WHERE date BETWEEN ? AND ? GROUP BY period ORDER BY period`,
    from, to
  );
}

function incomeBy(field, from, to) {
  if (!['concept', 'method'].includes(field)) throw new Error('Campo no válido');
  return all(
    `SELECT ${field} AS key, SUM(amount_cents) AS total, COUNT(*) AS count
     FROM donations WHERE date BETWEEN ? AND ? GROUP BY ${field} ORDER BY total DESC`,
    from, to
  );
}

// Rellena con ceros los periodos sin datos para que las gráficas sean continuas.
function fillSeries(keys, rows, valueKeys) {
  const map = new Map(rows.map((r) => [r.period, r]));
  return keys.map((period) => {
    const row = map.get(period) || {};
    return Object.fromEntries([['period', period], ...valueKeys.map((k) => [k, row[k] ?? 0])]);
  });
}

module.exports = { attendanceByPeriod, attendanceByEvent, incomeByMonth, incomeBy, fillSeries };
