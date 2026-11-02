// Biblioteca digital: libros públicos (cualquier visitante) y privados (solo usuarios con sesión).
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { all, get, run, DATA_DIR } = require('../db');
const { can } = require('../auth');
const v = require('../util');

// Fuera de /public: los archivos solo se entregan a través de estas rutas, que verifican la visibilidad.
const BOOKS_DIR = path.join(DATA_DIR, 'books');
fs.mkdirSync(BOOKS_DIR, { recursive: true });

const MAX_BOOK_MB = Number(process.env.MAX_BOOK_MB || 50);
const MAX_COVER_MB = 5;
const COVER_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const VISIBILITY = { publico: 'Público', privado: 'Privado' };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Windows suele enviar los EPUB como application/octet-stream, así que también se considera la extensión.
function bookKind(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (file.mimetype === 'application/epub+zip' || ext === '.epub') return 'epub';
  return null;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: BOOKS_DIR,
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${file.fieldname === 'file' ? `.${bookKind(file)}` : COVER_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_BOOK_MB * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'file' && bookKind(file)) return cb(null, true);
    if (file.fieldname === 'cover' && COVER_TYPES[file.mimetype]) return cb(null, true);
    cb(v.bad(file.fieldname === 'cover' ? 'La portada debe ser una imagen PNG, JPG o WEBP.' : 'El libro debe ser un archivo PDF o EPUB.'));
  },
}).fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]);

// El tipo declarado por el navegador no es confiable: se comprueba la firma real del archivo.
function hasSignature(filePath, kind) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  switch (kind) {
    case 'pdf': return buf.subarray(0, 4).toString('latin1') === '%PDF';
    case 'epub': return buf[0] === 0x50 && buf[1] === 0x4b;
    case 'image/png': return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case 'image/jpeg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp': return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    default: return false;
  }
}

const removeStored = (name) => name && fs.rm(path.join(BOOKS_DIR, path.basename(name)), { force: true }, () => {});

function readUploads(req) {
  const file = req.files?.file?.[0];
  const cover = req.files?.cover?.[0];
  if (file && !hasSignature(file.path, bookKind(file))) throw v.bad('El archivo no es un PDF o EPUB válido.');
  if (cover) {
    if (cover.size > MAX_COVER_MB * 1024 * 1024) throw v.bad(`La portada no puede superar ${MAX_COVER_MB} MB.`);
    if (!hasSignature(cover.path, cover.mimetype)) throw v.bad('La portada no es una imagen válida.');
  }
  return { file, cover };
}

function readFields(body) {
  return {
    title: v.text(body.title, 'El título', { required: true, max: 200 }),
    author: v.text(body.author, 'El autor', { max: 150 }),
    category: v.text(body.category, 'La categoría', { max: 80 }),
    description: v.text(body.description, 'La descripción', { max: 3000 }),
    visibility: v.oneOf(body.visibility, 'La visibilidad', VISIBILITY, { fallback: 'privado' }),
  };
}

// Si algo falla después de recibir los archivos, se borran para no dejar basura en disco.
const withUploadCleanup = (handler) => (req, res) => {
  try {
    return handler(req, res);
  } catch (err) {
    Object.values(req.files || {}).flat().forEach((f) => removeStored(f.filename));
    throw err;
  }
};

const COLUMNS = `b.id, b.title, b.author, b.description, b.category, b.visibility, b.file_type, b.file_size,
  (b.cover IS NOT NULL) AS has_cover, b.views, b.created_at, b.updated_at`;

function listBooks(query, { publicOnly }) {
  const visibility = publicOnly ? 'publico' : v.oneOf(query.visibility, 'La visibilidad', VISIBILITY);
  let rows = all(
    `SELECT ${COLUMNS}, u.name AS uploaded_by_name FROM books b LEFT JOIN users u ON u.id = b.uploaded_by
     WHERE (? IS NULL OR b.visibility = ?) ORDER BY b.created_at DESC, b.id DESC`,
    visibility, visibility
  );
  const categories = [...new Set(rows.map((b) => b.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const q = norm(query.q);
  if (q) rows = rows.filter((b) => norm(`${b.title} ${b.author || ''} ${b.description || ''}`).includes(q));
  if (query.category) rows = rows.filter((b) => b.category === query.category);
  if (publicOnly) rows = rows.map(({ uploaded_by_name, views, ...rest }) => rest);
  return { books: rows, categories };
}

function findBook(rawId, { publicOnly = false } = {}) {
  const book = get('SELECT * FROM books WHERE id = ?', v.id(rawId, 'El libro', { required: true }));
  // Un libro privado responde igual que uno inexistente para los visitantes sin sesión.
  if (!book || (publicOnly && book.visibility !== 'publico')) throw v.notFound('Libro');
  return book;
}

function sendBook(book, req, res) {
  const file = path.join(BOOKS_DIR, path.basename(book.file_name));
  if (!fs.existsSync(file)) throw v.notFound('Archivo');
  // Solo se cuenta la primera petición; el visor de PDF pide el resto por rangos.
  const range = req.headers.range;
  if (!range || /^bytes=0-/.test(range)) run('UPDATE books SET views = views + 1 WHERE id = ?', book.id);
  const download = req.query.download === '1' || book.file_type === 'epub';
  const name = `${book.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'libro'}.${book.file_type}`;
  res.sendFile(file, {
    headers: {
      'Content-Type': book.file_type === 'pdf' ? 'application/pdf' : 'application/epub+zip',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': book.visibility === 'publico' ? 'public, max-age=3600' : 'private, no-store',
      'X-Frame-Options': 'SAMEORIGIN', // permite el lector integrado de la propia aplicación
    },
  });
}

function sendCover(book, res) {
  if (!book.cover) throw v.notFound('Portada');
  res.sendFile(path.join(BOOKS_DIR, path.basename(book.cover)), {
    headers: { 'Cache-Control': book.visibility === 'publico' ? 'public, max-age=86400' : 'private, max-age=3600' },
  });
}

// ---------- Rutas públicas (sin sesión) ----------
const publicRouter = express.Router();
publicRouter.get('/', (req, res) => res.json(listBooks(req.query, { publicOnly: true })));
publicRouter.get('/:id/file', (req, res) => sendBook(findBook(req.params.id, { publicOnly: true }), req, res));
publicRouter.get('/:id/cover', (req, res) => sendCover(findBook(req.params.id, { publicOnly: true }), res));

// ---------- Rutas internas ----------
const router = express.Router();
router.get('/', can('books.read'), (req, res) => res.json(listBooks(req.query, { publicOnly: false })));
router.get('/:id/file', can('books.read'), (req, res) => sendBook(findBook(req.params.id), req, res));
router.get('/:id/cover', can('books.read'), (req, res) => sendCover(findBook(req.params.id), res));

const findListed = (id) => get(`SELECT ${COLUMNS} FROM books b WHERE b.id = ?`, id);

router.post('/', can('books.write'), upload, withUploadCleanup((req, res) => {
  const f = readFields(req.body);
  const { file, cover } = readUploads(req);
  if (!file) throw v.bad('Seleccione el archivo del libro (PDF o EPUB).');
  const r = run(
    `INSERT INTO books (title, author, description, category, visibility, file_name, file_type, file_size, cover, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    f.title, f.author, f.description, f.category, f.visibility, file.filename, bookKind(file), file.size, cover?.filename, req.user.id
  );
  res.status(201).json(findListed(r.lastInsertRowid));
}));

router.put('/:id', can('books.write'), upload, withUploadCleanup((req, res) => {
  const book = findBook(req.params.id);
  const f = readFields(req.body);
  const { file, cover } = readUploads(req);
  const removeCover = v.bool(req.body.remove_cover) && !cover;
  run(
    `UPDATE books SET title = ?, author = ?, description = ?, category = ?, visibility = ?,
       file_name = ?, file_type = ?, file_size = ?, cover = ?, updated_at = datetime('now') WHERE id = ?`,
    f.title, f.author, f.description, f.category, f.visibility,
    file ? file.filename : book.file_name, file ? bookKind(file) : book.file_type, file ? file.size : book.file_size,
    cover ? cover.filename : removeCover ? null : book.cover, book.id
  );
  if (file) removeStored(book.file_name);
  if (cover || removeCover) removeStored(book.cover);
  res.json(findListed(book.id));
}));

router.delete('/:id', can('books.write'), (req, res) => {
  const book = findBook(req.params.id);
  run('DELETE FROM books WHERE id = ?', book.id);
  removeStored(book.file_name);
  removeStored(book.cover);
  res.json({ ok: true });
});

module.exports = { router, publicRouter, BOOKS_DIR };
