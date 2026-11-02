// Carga datos de demostración: npm run seed:demo
const bcrypt = require('bcryptjs');
const { get, run, tx } = require('./db');
const v = require('./util');
const { seedBooks } = require('./seed-books');

// Los libros se cargan aparte para que también lleguen a bases de datos que ya tienen miembros.
async function loadBooks() {
  if (await seedBooks()) console.log('Libros de ejemplo agregados a la biblioteca.');
}

if (get('SELECT id FROM members LIMIT 1')) {
  console.log('La base de datos ya tiene miembros; solo se revisó la biblioteca.');
  loadBooks().then(() => process.exit(0));
  return;
}

// Generador pseudoaleatorio con semilla para que la demo sea reproducible.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (list) => list[Math.floor(rand() * list.length)];

const today = v.localDate();
const DEMO_PASSWORD = 'Demo1234';

const NAMES = [
  'María González', 'José Hernández', 'Ana Martínez', 'Carlos López', 'Lucía Ramírez', 'Pedro Sánchez',
  'Sofía Torres', 'Miguel Flores', 'Elena Rivera', 'David Gómez', 'Isabel Díaz', 'Javier Morales',
  'Carmen Ortiz', 'Andrés Castillo', 'Valeria Ruiz', 'Fernando Vargas', 'Gabriela Mendoza', 'Ricardo Jiménez',
  'Patricia Romero', 'Daniel Herrera', 'Laura Medina', 'Samuel Aguilar', 'Rosa Castro', 'Tomás Navarro',
  'Paula Reyes', 'Esteban Cruz', 'Adriana Vega', 'Raúl Silva',
];

tx(() => {
  run(
    `UPDATE settings SET name = ?, address = ?, phone = ?, email = ?, description = ? WHERE id = 1`,
    'Iglesia Comunidad de Fe', 'Av. Principal 123, Centro', '+1 555 123 4567', 'contacto@comunidaddefe.org',
    'Una comunidad que crece en fe, esperanza y amor.'
  );
  [['Culto dominical', 0, '10:00', 'Templo principal'], ['Estudio bíblico', 3, '19:00', 'Salón 2'], ['Reunión de jóvenes', 6, '18:00', 'Salón de jóvenes']]
    .forEach(([name, day, time, location]) => run('INSERT INTO meeting_schedules (name, day_of_week, time, location) VALUES (?, ?, ?, ?)', name, day, time, location));

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  [['Pastor Juan Pérez', 'pastor@iglesia.com', 'pastor'], ['Marta Secretaria', 'secretario@iglesia.com', 'secretario'],
   ['Luis Tesorero', 'tesorero@iglesia.com', 'tesorero'], ['Claudia Coordinadora', 'coordinador@iglesia.com', 'coordinador']]
    .forEach(([name, email, role]) => run('INSERT OR IGNORE INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', name, email, hash, role));

  const memberIds = NAMES.map((name, i) => {
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '.');
    const join = v.addDays(today, -Math.floor(rand() * 900) - 10);
    return run(
      'INSERT INTO members (name, phone, email, join_date, active) VALUES (?, ?, ?, ?, ?)',
      name, `555-${String(1000 + i * 37).slice(-4)}`, `${slug}@correo.com`, join, i < 25 ? 1 : 0
    ).lastInsertRowid;
  });

  const ministries = [['Música', 'Alabanza y adoración'], ['Jóvenes', 'Ministerio juvenil'], ['Niños', 'Escuela dominical infantil'],
    ['Enseñanza', 'Estudios bíblicos y discipulado'], ['Servicio', 'Ujieres, limpieza y apoyo logístico']];
  const ministryIds = ministries.map(([name, description], i) => {
    const id = run('INSERT INTO ministries (name, description, coordinator_id) VALUES (?, ?, ?)', name, description, memberIds[i]).lastInsertRowid;
    const members = new Set([memberIds[i]]);
    while (members.size < 4 + Math.floor(rand() * 5)) members.add(pick(memberIds.slice(0, 25)));
    members.forEach((m) => run('INSERT INTO ministry_members (ministry_id, member_id) VALUES (?, ?)', id, m));
    return id;
  });

  // Eventos: cultos dominicales y estudios de los miércoles de las últimas 12 semanas y las próximas 4.
  const sunday = v.addDays(v.mondayOf(today), -1);
  for (let w = -12; w <= 4; w++) {
    const sun = v.addDays(sunday, w * 7);
    const wed = v.addDays(sun, 3);
    const culto = run(`INSERT INTO events (title, type, date, time, location) VALUES ('Culto dominical', 'culto', ?, '10:00', 'Templo principal')`, sun).lastInsertRowid;
    run('INSERT INTO event_responsibles (event_id, member_id) VALUES (?, ?)', culto, memberIds[0]);
    const estudio = run(`INSERT INTO events (title, type, date, time, location, ministry_id) VALUES ('Estudio bíblico', 'reunion', ?, '19:00', 'Salón 2', ?)`, wed, ministryIds[3]).lastInsertRowid;
    for (const [eventId, date, rate] of [[culto, sun, 0.8], [estudio, wed, 0.45]]) {
      if (date >= today) continue;
      memberIds.slice(0, 25).forEach((m) => run('INSERT INTO attendance (event_id, member_id, present) VALUES (?, ?, ?)', eventId, m, rand() < rate ? 1 : 0));
    }
  }
  [['Retiro de jóvenes', 'actividad', 9, ministryIds[1], 'Campamento El Roble'], ['Reunión de líderes', 'administrativo', 5, null, 'Oficina pastoral'],
   ['Concierto de alabanza', 'actividad', 16, ministryIds[0], 'Templo principal'], ['Asamblea general', 'administrativo', 23, null, 'Templo principal']]
    .forEach(([title, type, days, ministry, location]) => {
      const id = run('INSERT INTO events (title, type, date, time, location, ministry_id) VALUES (?, ?, ?, ?, ?, ?)', title, type, v.addDays(today, days), '17:00', location, ministry).lastInsertRowid;
      run('INSERT INTO event_responsibles (event_id, member_id) VALUES (?, ?)', id, pick(memberIds.slice(0, 10)));
    });

  // Aportaciones de los últimos 6 meses (algunas anónimas).
  for (let d = 180; d >= 0; d -= 1 + Math.floor(rand() * 3)) {
    const concept = pick(['diezmo', 'diezmo', 'ofrenda', 'ofrenda', 'donacion', 'misiones', 'construccion']);
    const amount = Math.round((concept === 'diezmo' ? 80 + rand() * 400 : 10 + rand() * 150) * 100);
    const member = concept === 'ofrenda' && rand() < 0.7 ? null : pick(memberIds.slice(0, 25));
    run('INSERT INTO donations (date, amount_cents, concept, method, member_id) VALUES (?, ?, ?, ?, ?)',
      v.addDays(today, -d), amount, concept, pick(['efectivo', 'efectivo', 'transferencia', 'tarjeta']), member);
  }

  [['Bienvenidos al nuevo sistema', 'A partir de hoy la iglesia gestiona miembros, eventos y asistencia desde esta plataforma.', -3, 0],
   ['Retiro de jóvenes: inscripciones abiertas', 'Las inscripciones para el retiro cierran el próximo domingo. Hable con el ministerio de Jóvenes.', -1, 1],
   ['Ayuno congregacional', 'Este mes nos unimos en ayuno y oración cada miércoles.', -7, 0]]
    .forEach(([title, body, days, important]) => run('INSERT INTO announcements (title, body, publish_date, important, created_by) VALUES (?, ?, ?, ?, 1)', title, body, v.addDays(today, days), important));
});

console.log(`Datos de demostración cargados. Usuarios de prueba (contraseña ${DEMO_PASSWORD}):`);
console.log('  pastor@iglesia.com, secretario@iglesia.com, tesorero@iglesia.com, coordinador@iglesia.com');
loadBooks();
