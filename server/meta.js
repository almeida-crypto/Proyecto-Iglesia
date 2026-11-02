// Catálogos compartidos por la validación, los reportes y el frontend (/api/meta).
module.exports = {
  roles: {
    administrador: 'Administrador',
    pastor: 'Pastor',
    secretario: 'Secretario',
    tesorero: 'Tesorero',
    coordinador: 'Coordinador',
  },
  eventTypes: {
    culto: 'Culto',
    reunion: 'Reunión',
    actividad: 'Actividad',
    administrativo: 'Administrativo',
  },
  concepts: {
    diezmo: 'Diezmo',
    ofrenda: 'Ofrenda',
    donacion: 'Donación',
    primicia: 'Primicia',
    misiones: 'Misiones',
    construccion: 'Construcción',
    otro: 'Otro',
  },
  methods: {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    deposito: 'Depósito',
    otro: 'Otro',
  },
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
};
