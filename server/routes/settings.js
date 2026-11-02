const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { all, get, run, tx, UPLOADS_DIR } = require('../db');
const { can } = require('../auth');
const v = require('../util');

const LOGO_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, `logo-${Date.now()}${LOGO_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    LOGO_TYPES[file.mimetype] ? cb(null, true) : cb(v.bad('El logotipo debe ser una imagen PNG, JPG o WEBP.')),
});

const readSettings = () => ({
  ...get('SELECT * FROM settings WHERE id = 1'),
  schedules: all('SELECT * FROM meeting_schedules ORDER BY day_of_week, time'),
});

function removeLogoFile(name) {
  if (!name) return;
  const file = path.join(UPLOADS_DIR, path.basename(name));
  fs.rm(file, { force: true }, () => {});
}

function currency(value) {
  const code = String(value || 'USD').trim().toUpperCase();
  try {
    if (!/^[A-Z]{3}$/.test(code)) throw new Error();
    new Intl.NumberFormat('es', { style: 'currency', currency: code });
  } catch {
    throw v.bad('La moneda debe ser un código ISO de 3 letras (por ejemplo USD, MXN, EUR).');
  }
  return code;
}

router.get('/', (req, res) => res.json(readSettings()));

router.put('/', can('config.edit'), (req, res) => {
  const b = req.body;
  run(
    `UPDATE settings SET name = ?, address = ?, phone = ?, email = ?, website = ?, description = ?, currency = ?,
     updated_at = datetime('now') WHERE id = 1`,
    v.text(b.name, 'El nombre de la iglesia', { required: true, max: 150 }),
    v.text(b.address, 'La dirección', { max: 255 }),
    v.text(b.phone, 'El teléfono', { max: 40 }),
    v.email(b.email, 'El correo'),
    v.text(b.website, 'El sitio web', { max: 200 }),
    v.text(b.description, 'La descripción', { max: 2000 }),
    currency(b.currency)
  );
  res.json(readSettings());
});

router.post('/logo', can('config.edit'), upload.single('logo'), (req, res) => {
  if (!req.file) throw v.bad('Seleccione una imagen.');
  const old = get('SELECT logo FROM settings WHERE id = 1').logo;
  run(`UPDATE settings SET logo = ?, updated_at = datetime('now') WHERE id = 1`, req.file.filename);
  removeLogoFile(old);
  res.json(readSettings());
});

router.delete('/logo', can('config.edit'), (req, res) => {
  removeLogoFile(get('SELECT logo FROM settings WHERE id = 1').logo);
  run(`UPDATE settings SET logo = NULL, updated_at = datetime('now') WHERE id = 1`);
  res.json(readSettings());
});

router.put('/schedules', can('config.edit'), (req, res) => {
  const list = Array.isArray(req.body.schedules) ? req.body.schedules : [];
  if (list.length > 50) throw v.bad('Demasiados horarios.');
  const clean = list.map((s, i) => {
    const day = Number(s.day_of_week);
    if (!Number.isInteger(day) || day < 0 || day > 6) throw v.bad(`El día del horario ${i + 1} no es válido.`);
    return {
      name: v.text(s.name, `El nombre del horario ${i + 1}`, { required: true, max: 100 }),
      day,
      time: v.time(s.time, `La hora del horario ${i + 1}`, { required: true }),
      location: v.text(s.location, `El lugar del horario ${i + 1}`, { max: 150 }),
    };
  });
  tx(() => {
    run('DELETE FROM meeting_schedules');
    for (const s of clean) {
      run('INSERT INTO meeting_schedules (name, day_of_week, time, location) VALUES (?, ?, ?, ?)', s.name, s.day, s.time, s.location);
    }
  });
  res.json(readSettings());
});

module.exports = router;
