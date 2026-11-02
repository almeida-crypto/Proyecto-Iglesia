const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { get, run, tx } = require('../db');
const { issueToken, clearToken, authRequired, permissionsFor } = require('../auth');
const { sendMail } = require('../mailer');
const v = require('../util');

const attempts = new Map();
function rateLimit(key, max = 10, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new v.HttpError(429, 'Demasiados intentos. Intente de nuevo más tarde.');
  recent.push(now);
  attempts.set(key, recent);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, permissions: permissionsFor(u.role) });

router.post('/login', async (req, res) => {
  const email = v.email(req.body.email, 'El correo', { required: true });
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!password) throw v.bad('La contraseña es obligatoria.');
  rateLimit(`login:${req.ip}:${email}`);

  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new v.HttpError(401, 'Correo o contraseña incorrectos.');
  }
  if (!user.active) throw new v.HttpError(403, 'Su usuario está desactivado. Contacte al administrador.');
  issueToken(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/forgot', async (req, res) => {
  const email = v.email(req.body.email, 'El correo', { required: true });
  rateLimit(`forgot:${req.ip}`, 5);

  const user = get('SELECT id, name, email FROM users WHERE email = ? AND active = 1', email);
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    run(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))`,
      user.id, sha256(token)
    );
    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    await sendMail({
      to: user.email,
      subject: 'Restablecer contraseña',
      text: `Hola ${user.name}:\n\nPara restablecer su contraseña abra el siguiente enlace (válido por 1 hora):\n${base}/#/restablecer?token=${token}\n\nSi usted no lo solicitó, ignore este mensaje.`,
    });
  }
  // La respuesta es la misma exista o no el correo, para no revelar qué cuentas existen.
  res.json({ ok: true, message: 'Si el correo está registrado, recibirá un enlace para restablecer su contraseña.' });
});

router.post('/reset', async (req, res) => {
  const token = v.text(req.body.token, 'El enlace', { required: true, max: 200 });
  const password = v.password(req.body.password);
  const reset = get(
    `SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > datetime('now')`,
    sha256(token)
  );
  if (!reset) throw v.bad('El enlace no es válido o ya expiró. Solicite uno nuevo.');
  const hash = await bcrypt.hash(password, 10);
  tx(() => {
    run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', hash, reset.user_id);
    run('UPDATE password_resets SET used = 1 WHERE user_id = ?', reset.user_id);
  });
  res.json({ ok: true });
});

router.post('/change-password', authRequired, async (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.id);
  const current = typeof req.body.current === 'string' ? req.body.current : '';
  if (!(await bcrypt.compare(current, user.password_hash))) throw v.bad('La contraseña actual no es correcta.');
  const password = v.password(req.body.password);
  run(
    'UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?',
    await bcrypt.hash(password, 10), user.id
  );
  issueToken(res, { ...user, token_version: user.token_version + 1 });
  res.json({ ok: true });
});

module.exports = router;
