const jwt = require('jsonwebtoken');
const { get, JWT_SECRET } = require('./db');

const ALL = ['administrador', 'pastor', 'secretario', 'tesorero', 'coordinador'];

// Matriz de permisos por rol (RF-01: restringir el acceso a las funciones según el rol).
const PERMISSIONS = {
  'users.manage': ['administrador'],
  'config.edit': ['administrador', 'pastor'],
  'members.read': ALL,
  'members.write': ['administrador', 'pastor', 'secretario'],
  'attendance.read': ['administrador', 'pastor', 'secretario', 'coordinador'],
  'attendance.write': ['administrador', 'pastor', 'secretario', 'coordinador'],
  'events.read': ALL,
  'events.write': ['administrador', 'pastor', 'secretario', 'coordinador'],
  'ministries.read': ALL,
  'ministries.write': ['administrador', 'pastor', 'secretario'],
  'finances.read': ['administrador', 'pastor', 'tesorero'],
  'finances.write': ['administrador', 'tesorero'],
  'announcements.read': ALL,
  'announcements.write': ['administrador', 'pastor', 'secretario'],
  'books.read': ALL,
  'books.write': ['administrador', 'pastor', 'secretario'],
};

const permissionsFor = (role) => Object.keys(PERMISSIONS).filter((p) => PERMISSIONS[p].includes(role));
const hasPerm = (user, perm) => !!user && !!PERMISSIONS[perm]?.includes(user.role);

const COOKIE = 'iglesia_token';
const SESSION_HOURS = 8;

function issueToken(res, user) {
  const token = jwt.sign({ sub: user.id, v: user.token_version }, JWT_SECRET, { expiresIn: `${SESSION_HOURS}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_HOURS * 3600 * 1000,
  });
}

const clearToken = (res) => res.clearCookie(COOKIE);

function authRequired(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Debe iniciar sesión.' });
  try {
    const { sub, v } = jwt.verify(token, JWT_SECRET);
    const user = get('SELECT id, name, email, role, active, token_version FROM users WHERE id = ?', sub);
    if (!user || !user.active || user.token_version !== v) return res.status(401).json({ error: 'Sesión no válida.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada.' });
  }
}

const can = (...perms) => (req, res, next) =>
  perms.some((p) => hasPerm(req.user, p))
    ? next()
    : res.status(403).json({ error: 'No tiene permisos para realizar esta acción.' });

module.exports = { PERMISSIONS, permissionsFor, hasPerm, issueToken, clearToken, authRequired, can };
