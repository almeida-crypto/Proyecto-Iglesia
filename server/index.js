const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { get, UPLOADS_DIR } = require('./db');
const { authRequired, can } = require('./auth');
const META = require('./meta');
const books = require('./routes/books');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  req.body ??= {};
  next();
});
app.use(cookieParser());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

// Rutas públicas
app.use('/api/auth', require('./routes/auth'));
app.get('/api/public/settings', (req, res) =>
  res.json(get('SELECT name, logo, currency, address, phone, email, website FROM settings WHERE id = 1'))
);
app.use('/api/public/books', books.publicRouter);

// Rutas protegidas
app.use('/api', authRequired);
app.get('/api/meta', (req, res) => res.json(META));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/users', can('users.manage'), require('./routes/users'));
app.use('/api/members', require('./routes/members'));
app.use('/api/events', require('./routes/events'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/ministries', require('./routes/ministries'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/books', books.router);
app.use('/api/reports', require('./routes/reports'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Archivos estáticos
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use('/vendor/chart.js', express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Manejo de errores
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') {
    const max = req.originalUrl.startsWith('/api/books') ? `${process.env.MAX_BOOK_MB || 50} MB` : '2 MB';
    return res.status(400).json({ error: `El archivo supera el tamaño máximo (${max}).` });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Solicitud con formato inválido.' });
  if (/UNIQUE constraint/.test(err.message)) return res.status(409).json({ error: 'El registro ya existe.' });
  console.error(err);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Sistema de gestión de iglesia en http://localhost:${PORT}`));
