const nodemailer = require('nodemailer');

// Si no hay SMTP configurado, los correos se muestran en la consola (útil en desarrollo).
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

async function sendMail({ to, subject, text }) {
  if (!transport) {
    console.log(`\n--- Correo (SMTP no configurado) ---\nPara: ${to}\nAsunto: ${subject}\n\n${text}\n-----------------------------------\n`);
    return;
  }
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
}

module.exports = { sendMail };
