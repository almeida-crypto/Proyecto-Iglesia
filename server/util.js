class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new HttpError(400, message);
const notFound = (what = 'Registro') => new HttpError(404, `${what} no encontrado.`);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function text(value, label, { required = false, max = 255 } = {}) {
  if (isBlank(value)) {
    if (required) throw bad(`${label} es obligatorio.`);
    return null;
  }
  const s = String(value).trim();
  if (s.length > max) throw bad(`${label} no puede superar ${max} caracteres.`);
  return s;
}

function date(value, label, opts = {}) {
  const s = text(value, label, { ...opts, max: 10 });
  if (s !== null && (!DATE_RE.test(s) || Number.isNaN(Date.parse(s)))) throw bad(`${label} no es una fecha válida.`);
  return s;
}

function time(value, label, opts = {}) {
  const s = text(value, label, { ...opts, max: 5 });
  if (s !== null && !TIME_RE.test(s)) throw bad(`${label} no es una hora válida (HH:MM).`);
  return s;
}

function email(value, label, opts = {}) {
  const s = text(value, label, { ...opts, max: 254 });
  if (s !== null && !EMAIL_RE.test(s)) throw bad(`${label} no es un correo válido.`);
  return s && s.toLowerCase();
}

function oneOf(value, label, options, { required = false, fallback = null } = {}) {
  if (isBlank(value)) {
    if (required && fallback === null) throw bad(`${label} es obligatorio.`);
    return fallback;
  }
  if (!Object.hasOwn(options, value)) throw bad(`${label} no es válido.`);
  return value;
}

function id(value, label, { required = false } = {}) {
  if (isBlank(value)) {
    if (required) throw bad(`${label} es obligatorio.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw bad(`${label} no es válido.`);
  return n;
}

function idList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

const bool = (value) => value === true || value === 1 || value === '1' || value === 'true' || value === 'on';

function password(value) {
  const s = typeof value === 'string' ? value : '';
  if (s.length < 8 || s.length > 128 || !/[A-Za-z]/.test(s) || !/\d/.test(s)) {
    throw bad('La contraseña debe tener entre 8 y 128 caracteres e incluir letras y números.');
  }
  return s;
}

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

// Lunes de la semana a la que pertenece la fecha (igual que date(d,'-6 days','weekday 1') en SQLite).
function mondayOf(dateStr) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return addDays(dateStr, -((day + 6) % 7));
}

function monthsBack(lastMonth, count) {
  const [y, m] = lastMonth.split('-').map(Number);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  }
  return out;
}

function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}` };
}

// Rango de fechas opcional; sin límites se usan valores extremos para simplificar las consultas.
function range(query) {
  const from = date(query.from, 'La fecha inicial');
  const to = date(query.to, 'La fecha final');
  if (from && to && from > to) throw bad('La fecha inicial no puede ser posterior a la final.');
  return { from: from || '0000-01-01', to: to || '9999-12-31', hasFrom: !!from, hasTo: !!to };
}

module.exports = {
  HttpError, bad, notFound,
  text, date, time, email, oneOf, id, idList, bool, password,
  localDate, addDays, mondayOf, monthsBack, monthBounds, range,
};
