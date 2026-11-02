const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const META = require('../meta');
const v = require('../util');

const COLUMNS = 'id, name, email, role, active, created_at';

router.get('/', (req, res) => {
  res.json(all(`SELECT ${COLUMNS} FROM users ORDER BY name COLLATE NOCASE`));
});

router.post('/', async (req, res) => {
  const name = v.text(req.body.name, 'El nombre', { required: true, max: 120 });
  const email = v.email(req.body.email, 'El correo', { required: true });
  const role = v.oneOf(req.body.role, 'El rol', META.roles, { required: true });
  const hash = await bcrypt.hash(v.password(req.body.password), 10);
  if (get('SELECT id FROM users WHERE email = ?', email)) throw v.bad('Ya existe un usuario con ese correo.');
  const r = run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', name, email, hash, role);
  res.status(201).json(get(`SELECT ${COLUMNS} FROM users WHERE id = ?`, r.lastInsertRowid));
});

router.put('/:id', async (req, res) => {
  const id = v.id(req.params.id, 'El usuario', { required: true });
  const existing = get('SELECT * FROM users WHERE id = ?', id);
  if (!existing) throw v.notFound('Usuario');

  const name = v.text(req.body.name, 'El nombre', { required: true, max: 120 });
  const email = v.email(req.body.email, 'El correo', { required: true });
  const role = v.oneOf(req.body.role, 'El rol', META.roles, { required: true });
  const active = v.bool(req.body.active);
  const newPassword = req.body.password ? v.password(req.body.password) : null;

  if (get('SELECT id FROM users WHERE email = ? AND id <> ?', email, id)) throw v.bad('Ya existe un usuario con ese correo.');
  if (id === req.user.id && (role !== 'administrador' || !active)) {
    throw v.bad('No puede quitarse su propio rol de administrador ni desactivar su propio usuario.');
  }
  if (existing.role === 'administrador' && existing.active && (role !== 'administrador' || !active)) {
    const others = get(`SELECT COUNT(*) AS n FROM users WHERE role = 'administrador' AND active = 1 AND id <> ?`, id).n;
    if (others === 0) throw v.bad('Debe existir al menos un administrador activo.');
  }

  // Cambiar rol, contraseña o estado cierra las sesiones abiertas de ese usuario.
  const revoke = newPassword || role !== existing.role || (existing.active && !active);
  run(
    `UPDATE users SET name = ?, email = ?, role = ?, active = ?, token_version = token_version + ? WHERE id = ?`,
    name, email, role, active, revoke ? 1 : 0, id
  );
  if (newPassword) run('UPDATE users SET password_hash = ? WHERE id = ?', await bcrypt.hash(newPassword, 10), id);
  res.json(get(`SELECT ${COLUMNS} FROM users WHERE id = ?`, id));
});

module.exports = router;
