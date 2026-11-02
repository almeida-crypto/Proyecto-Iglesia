# Sistema de gestión para iglesias

Aplicación web para administrar una iglesia: usuarios y roles, miembros, asistencia, eventos, ministerios,
aportaciones, anuncios, biblioteca digital de libros públicos y privados, reportes (PDF/Excel) y configuración institucional.

## Requisitos

- Node.js 22.13 o superior (usa la base de datos SQLite integrada en Node, no hay que instalar nada más).

## Puesta en marcha

```bash
npm install
npm start
```

Abra http://localhost:3000. La primera vez se crea el usuario administrador:

- **Correo:** `admin@iglesia.com`
- **Contraseña:** `Admin123!` (cámbiela desde *Mi perfil*)

Para cargar datos de ejemplo (miembros, ministerios, eventos, asistencia, aportaciones y un usuario por rol con
contraseña `Demo1234`):

```bash
npm run seed:demo
```

Los datos se guardan en `data/iglesia.db`, los libros en `data/books/` y los logotipos en `data/uploads/`. Para respaldar el sistema basta con
copiar la carpeta `data/`.

## Variables de entorno (opcionales)

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto del servidor (por defecto 3000) |
| `DATA_DIR` | Carpeta de datos (por defecto `./data`) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Credenciales del primer administrador |
| `MAX_BOOK_MB` | Tamaño máximo de cada libro subido (por defecto 50) |
| `JWT_SECRET` | Clave de las sesiones (si no se define, se genera y guarda en `data/.jwt-secret`) |
| `APP_URL` | URL pública, usada en los enlaces de recuperación de contraseña |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envío de correos. Sin SMTP, los correos se muestran en la consola del servidor |
| `NODE_ENV=production` | Activa cookies `secure` (requiere HTTPS) |
| `TRUST_PROXY=true` | Si el servidor está detrás de un proxy inverso |

## Roles y permisos

| Función | Administrador | Pastor | Secretario | Tesorero | Coordinador |
| --- | :-: | :-: | :-: | :-: | :-: |
| Usuarios del sistema | ✔ | | | | |
| Configuración de la iglesia | ✔ | ✔ | ver | ver | ver |
| Miembros | ✔ | ✔ | ✔ | ver | ver |
| Asistencia | ✔ | ✔ | ✔ | | ✔ |
| Eventos | ✔ | ✔ | ✔ | ver | ✔ |
| Ministerios | ✔ | ✔ | ✔ | ver | ver |
| Aportaciones y reportes financieros | ✔ | ver | | ✔ | |
| Anuncios | ✔ | ✔ | ✔ | ver | ver |
| Biblioteca (subir, editar, eliminar libros) | ✔ | ✔ | ✔ | leer | leer |

Los permisos se validan en el servidor (`server/auth.js`); la interfaz solo oculta lo que el usuario no puede usar.

## Requerimientos cubiertos

- **RF-01** Inicio/cierre de sesión con correo y contraseña, registro de usuarios, recuperación de contraseña por enlace, 5 roles con permisos.
- **RF-02** Alta, edición, búsqueda (sin distinguir acentos), filtro activos/inactivos y desactivación sin borrado.
- **RF-03** Registro por fecha y evento, presentes/ausentes, historial por evento o por miembro, resúmenes semanales y mensuales.
- **RF-04** Eventos religiosos y administrativos con responsables, edición, cancelación/reactivación y calendario mensual.
- **RF-05** Ministerios con coordinador, integrantes y actividades programadas.
- **RF-06** Aportaciones con fecha, monto, concepto y método; anónimas opcionales; consulta por periodo y resumen mensual; acceso restringido.
- **RF-07** Anuncios con fecha de publicación, vigencia y marca de importante, junto a los próximos eventos.
- **RF-08** Panel con totales, próximos eventos, asistencias, ministerios, ingresos (solo roles autorizados) y gráficas.
- **RF-09** Reportes de miembros, asistencia por evento, asistencia por periodo, participación por ministerio e ingresos; exportación a PDF y Excel.
- **RF-10** Nombre, logotipo, dirección, contacto, moneda y horarios habituales de reunión.

## Biblioteca digital

- **Libros públicos:** cualquier persona puede verlos sin iniciar sesión en `http://localhost:3000/#/biblioteca-publica` (también hay un enlace en la pantalla de inicio de sesión). Cada libro público tiene un enlace para compartir.
- **Libros privados:** solo los ven los usuarios con sesión iniciada. El servidor no entrega el archivo a nadie más, aunque conozca la dirección.
- Formatos PDF (se leen dentro del sistema) y EPUB (se descargan). Se verifica que el archivo sea realmente un PDF o EPUB.
- La portada es opcional; si no se sube, se genera una con el título.
- Suba solo materiales propios de la iglesia o con permiso de distribución.

## Estructura

```
server/
  index.js          Servidor Express y rutas
  db.js             Esquema SQLite y usuario inicial
  auth.js           Sesiones (JWT en cookie httpOnly) y matriz de permisos
  routes/           API por módulo
  report-render.js  Generación de PDF y Excel
  seed-demo.js      Datos de demostración
public/
  index.html        Aplicación de una sola página
  js/views/         Una vista por módulo
  css/styles.css
```
