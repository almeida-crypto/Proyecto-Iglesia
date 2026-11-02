// Genera libros PDF de ejemplo para la biblioteca (contenido original, sin derechos de terceros).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const { get, run } = require('./db');
const { BOOKS_DIR } = require('./routes/books');

const BOOKS = [
  {
    title: 'Guía de bienvenida para nuevos miembros', author: 'Equipo pastoral', category: 'Manuales internos', visibility: 'publico',
    description: 'Todo lo que necesita saber al llegar a nuestra comunidad: horarios, ministerios y cómo integrarse.',
    chapters: [
      ['Bienvenido a casa', 'Nos alegra que forme parte de nuestra familia. Esta guía le ayudará a conocer la vida de la iglesia y los espacios donde puede servir y crecer.'],
      ['Nuestros encuentros', 'Cada domingo celebramos el culto principal. Durante la semana nos reunimos para el estudio bíblico, la oración y las actividades de los ministerios.'],
      ['Cómo integrarse', 'Le invitamos a conocer los ministerios de música, jóvenes, niños, enseñanza y servicio. Hable con cualquiera de los coordinadores para unirse.'],
    ],
  },
  {
    title: 'Plan de lectura bíblica anual', author: 'Ministerio de Enseñanza', category: 'Estudio bíblico', visibility: 'publico',
    description: 'Un recorrido por la Biblia en un año, con lecturas diarias y preguntas para la reflexión personal.',
    chapters: [
      ['Cómo usar este plan', 'Dedique unos minutos cada día a la lectura indicada. Al final de cada semana encontrará preguntas para conversar en familia o en grupo.'],
      ['Primer trimestre', 'Génesis, Éxodo, Salmos y el Evangelio de Mateo. Observe cómo Dios guía a su pueblo y cumple sus promesas.'],
      ['Segundo trimestre', 'Los libros históricos, Proverbios y el Evangelio de Marcos. Anote cada semana una enseñanza práctica para su vida.'],
    ],
  },
  {
    title: 'Devocional: 30 días de oración', author: 'Ministerio de Oración', category: 'Devocional', visibility: 'publico',
    description: 'Treinta reflexiones breves para cultivar un hábito diario de oración.',
    chapters: [
      ['Día 1: Comenzar en silencio', 'Busque un lugar tranquilo. Antes de pedir, agradezca. La oración comienza escuchando.'],
      ['Día 2: Orar por otros', 'Piense en tres personas que necesitan ánimo hoy y preséntelas en oración por nombre.'],
    ],
  },
  {
    title: 'Manual de ministerios y liderazgo', author: 'Consejo de la iglesia', category: 'Liderazgo', visibility: 'privado',
    description: 'Lineamientos internos para coordinadores: responsabilidades, planificación de actividades y registro de asistencia.',
    chapters: [
      ['Responsabilidades del coordinador', 'Cada coordinador planifica las actividades de su ministerio, acompaña a sus integrantes y registra la asistencia en el sistema.'],
      ['Planificación trimestral', 'Al inicio de cada trimestre, presente al consejo el calendario de actividades y los responsables de cada evento.'],
    ],
  },
  {
    title: 'Bosquejos de predicación: serie Hechos', author: 'Pastor Juan Pérez', category: 'Sermones', visibility: 'privado',
    description: 'Notas y bosquejos de la serie de predicaciones sobre el libro de los Hechos.',
    chapters: [
      ['La iglesia que persevera', 'Texto base: Hechos 2:42. La comunidad primitiva perseveraba en la enseñanza, la comunión, el partimiento del pan y la oración.'],
      ['Testigos hasta lo último de la tierra', 'Texto base: Hechos 1:8. El poder del Espíritu impulsa a la iglesia a compartir su fe más allá de sus muros.'],
    ],
  },
];

function writePdf(book, file) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 50, info: { Title: book.title, Author: book.author } });
    const out = fs.createWriteStream(file);
    out.on('finish', resolve).on('error', reject);
    doc.pipe(out);
    const { width, height } = doc.page;
    doc.rect(0, 0, width, height).fill('#6e1a26');
    doc.rect(22, 22, width - 44, height - 44).lineWidth(1).strokeColor('#d9b66e').stroke();
    doc.moveTo(width / 2, 120).lineTo(width / 2, 180).moveTo(width / 2 - 20, 138).lineTo(width / 2 + 20, 138).lineWidth(4).strokeColor('#d9b66e').stroke();
    doc.font('Times-Bold').fontSize(24).fillColor('#ffffff').text(book.title, 50, 220, { width: width - 100, align: 'center' });
    doc.font('Times-Italic').fontSize(13).fillColor('#e6c27a').text(book.author, { width: width - 100, align: 'center' });
    for (const [heading, body] of book.chapters) {
      doc.addPage();
      doc.font('Times-Bold').fontSize(18).fillColor('#6e1a26').text(heading);
      doc.moveDown(0.3).moveTo(50, doc.y).lineTo(130, doc.y).lineWidth(1.5).strokeColor('#b8892b').stroke();
      doc.moveDown(0.8).font('Times-Roman').fontSize(12).fillColor('#2b211a').text(body, { align: 'justify', lineGap: 4 });
    }
    doc.end();
  });
}

async function seedBooks() {
  if (get('SELECT id FROM books LIMIT 1')) return false;
  const admin = get(`SELECT id FROM users WHERE role = 'administrador' ORDER BY id LIMIT 1`);
  for (const book of BOOKS) {
    const name = `${crypto.randomUUID()}.pdf`;
    const file = path.join(BOOKS_DIR, name);
    await writePdf(book, file);
    run(
      `INSERT INTO books (title, author, description, category, visibility, file_name, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, 'pdf', ?, ?)`,
      book.title, book.author, book.description, book.category, book.visibility, name, fs.statSync(file).size, admin?.id
    );
  }
  return true;
}

module.exports = { seedBooks };
