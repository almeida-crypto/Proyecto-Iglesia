const router = require('express').Router();
const { all, get } = require('../db');
const { hasPerm } = require('../auth');
const stats = require('../stats');
const v = require('../util');

router.get('/', (req, res) => {
  const today = v.localDate();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;

  const members = get('SELECT COALESCE(SUM(active = 1), 0) AS active, COALESCE(SUM(active = 0), 0) AS inactive FROM members');
  const upcoming = all(
    `SELECT id, title, date, time, location, type FROM events
     WHERE status = 'programado' AND date >= ? ORDER BY date, time LIMIT 6`,
    today
  );
  const upcomingCount = get(
    `SELECT COUNT(*) AS n FROM events WHERE status = 'programado' AND date BETWEEN ? AND ?`,
    today, v.addDays(today, 30)
  ).n;
  const attendance = get(
    `SELECT COUNT(*) AS total, COALESCE(SUM(e.date >= ?), 0) AS month
     FROM attendance a JOIN events e ON e.id = a.event_id WHERE a.present = 1`,
    monthStart
  );
  const ministries = get('SELECT COUNT(*) AS n FROM ministries WHERE active = 1').n;
  const announcements = all(
    `SELECT id, title, body, publish_date, important FROM announcements
     WHERE publish_date <= ? AND (expires_date IS NULL OR expires_date >= ?)
     ORDER BY important DESC, publish_date DESC LIMIT 4`,
    today, today
  );

  const firstWeek = v.mondayOf(v.addDays(today, -7 * 11));
  const weeks = Array.from({ length: 12 }, (_, i) => v.addDays(firstWeek, i * 7));
  const months = v.monthsBack(month, 12);

  const charts = {
    attendance_weekly: stats.fillSeries(weeks, stats.attendanceByPeriod('week', firstWeek, today), ['present', 'events']),
    new_members: stats.fillSeries(
      months,
      all(
        `SELECT strftime('%Y-%m', join_date) AS period, COUNT(*) AS count FROM members
         WHERE join_date >= ? GROUP BY period`,
        `${months[0]}-01`
      ),
      ['count']
    ),
    ministry_members: all(
      `SELECT mi.name, COUNT(m.id) AS count FROM ministries mi
       LEFT JOIN ministry_members mm ON mm.ministry_id = mi.id
       LEFT JOIN members m ON m.id = mm.member_id AND m.active = 1
       WHERE mi.active = 1 GROUP BY mi.id ORDER BY count DESC, mi.name`
    ),
  };

  // El resumen de ingresos solo se envía a los roles autorizados (RF-08).
  let finance = null;
  if (hasPerm(req.user, 'finances.read')) {
    const sum = (from, to) => get('SELECT COALESCE(SUM(amount_cents), 0) AS t FROM donations WHERE date BETWEEN ? AND ?', from, to).t;
    const prev = v.monthBounds(v.monthsBack(month, 2)[0]);
    finance = {
      month: sum(monthStart, v.monthBounds(month).to),
      previous_month: sum(prev.from, prev.to),
      year: sum(`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`),
      by_month: stats.fillSeries(months, stats.incomeByMonth(`${months[0]}-01`, v.monthBounds(month).to), ['total']),
    };
  }

  res.json({
    members,
    upcoming,
    upcoming_count: upcomingCount,
    attendance,
    ministries,
    announcements,
    charts,
    finance,
  });
});

module.exports = router;
