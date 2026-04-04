# Visor Bun

Bienvenido a la documentación de **Visor Bun**. Este proyecto es una aplicación web moderna diseñada para la visualización de datos geoespaciales y gestión de información, construida sobre un stack tecnológico de alto rendimiento y última generación.

## 🚀 Tecnologías y Decisiones de Diseño

Hemos seleccionado cuidadosamente cada herramienta para maximizar el rendimiento, la experiencia de desarrollo (DX) y la escalabilidad del proyecto. A continuación explicamos el "por qué" de cada elección:

- **[Bun](https://bun.sh/)**:
  - _¿Por qué?_ Elegido como nuestro entorno de ejecución y gestor de paquetes principal por su velocidad superior comparada con Node.js. Acelera drásticamente la instalación de dependencias y el inicio del servidor de desarrollo.

- **[Next.js 15](https://nextjs.org/)**:
  - _¿Por qué?_ El estándar de industria para aplicaciones React. Utilizamos la versión 15 con **App Router** para aprovechar las últimas capacidades de React Server Components (RSC), mejorando el rendimiento de carga inicial y el SEO.

- **[TypeScript](https://www.typescriptlang.org/)**:
  - _¿Por qué?_ Indispensable para un código robusto y mantenible a largo plazo. Nos permite detectar errores antes de ejecutar el código y proporciona un excelente autocompletado, lo que acelera el desarrollo.

- **[Tailwind CSS 4](https://tailwindcss.com/)**:
  - _¿Por qué?_ Para el estilizado. La versión 4 ofrece un motor de compilación instantáneo y una configuración simplificada. Nos permite construir interfaces modernas rápidamente sin salir del HTML.

- **[Shadcn/ui](https://ui.shadcn.com/)** (sobre Radix UI):
  - _¿Por qué?_ No es una librería de componentes tradicional, sino una colección de componentes que copiamos y pegamos. Esto nos da control total sobre el código, asegurando accesibilidad (a11y) y permitiendo una personalización profunda sin luchar contra la librería.

- **[Drizzle ORM](https://orm.drizzle.team/)**:
  - _¿Por qué?_ Elegido sobre Prisma por ser más ligero, tener mejor rendimiento (especialmente en entornos serverless/edge) y ofrecer una experiencia más cercana a SQL pero con la seguridad de tipos de TypeScript.

- **[React Leaflet](https://react-leaflet.js.org/)**:
  - _¿Por qué?_ Para la visualización de mapas. Es una abstracción de React sobre Leaflet, una de las librerías de mapas más ligeras, maduras y de código abierto disponibles.

- **[Clerk](https://clerk.com/)**:
  - _¿Por qué?_ Para la autenticación. Nos permite implementar un sistema de login seguro, gestión de sesiones y perfiles de usuario en minutos, delegando la complejidad de la seguridad a expertos.

- **[TanStack Query (React Query)](https://tanstack.com/query/latest)**:
  - _¿Por qué?_ Para la gestión del estado del servidor. Simplifica enormemente la obtención de datos, el caché, la sincronización y la actualización de la UI en segundo plano.

## 🛠️ Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu sistema:

- **[Bun](https://bun.sh/)**: v1.0 o superior (Recomendado).
- **Node.js**: Compatible si prefieres no usar Bun, pero los scripts están optimizados para Bun.
- **Docker Desktop / Docker Engine + Docker Compose**: Requerido para levantar la base local reproducible con PostGIS.

## 📦 Instalación

Sigue estos pasos para levantar el proyecto en tu entorno local:

1. **Clonar el repositorio**:

   ```bash
   git clone <url-del-repositorio>
   cd visor-bun
   ```

2. **Instalar dependencias**:
   Utilizamos Bun para una instalación ultra-rápida.

   ```bash
   bun install
   ```

3. **Configurar variables de entorno**:
   Copia el archivo de ejemplo `.env.example` a un nuevo archivo `.env` y rellena las claves necesarias.

   ```bash
   cp .env.example .env
   ```

   **Importante**: Los valores `POSTGRES_*` del ejemplo ya coinciden con `compose.yaml`. Si cambias usuario, password, base o puerto, actualiza también `DATABASE_URL`.
   Si ya tienes otro PostgreSQL escuchando en `5432`, cambia `POSTGRES_PORT` antes de levantar el contenedor.

4. **Levantar PostgreSQL + PostGIS**:

   ```bash
   bun run db:start
   ```

5. **Aplicar migraciones**:

   ```bash
   bun run db:migrate
   ```

6. **Configurar Clerk**:
   Completa en `.env` las claves de autenticación necesarias (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) antes de entrar al panel administrativo.

7. **Uploads grandes de GeoJSON en Vercel**:
   Si despliegas en Vercel y vas a importar GeoJSON pesados desde el panel de admin, crea un store de **Vercel Blob** en el mismo proyecto. Por defecto el panel usa `QGIS_UPLOAD_TRANSPORT=auto`: en Vercel con `BLOB_READ_WRITE_TOKEN` pasa a Blob y evita el límite de 4.5 MB de Vercel Functions; fuera de Vercel vuelve a la subida directa al servidor.

   También puedes controlarlo manualmente:
   - `QGIS_UPLOAD_TRANSPORT=direct`: desactiva Blob y usa siempre subida directa.
   - `QGIS_UPLOAD_TRANSPORT=blob`: fuerza Blob incluso si mañana despliegas en Docker/Dokploy/VPS, siempre que mantengas `BLOB_READ_WRITE_TOKEN`.

   Si usas `direct` en Dokploy/VPS, y hay proxy inverso delante de la app, asegúrate de subir también su límite de upload/body size para no recibir `413`.

## 💻 Uso

### Servidor de Desarrollo

Para iniciar la aplicación en modo de desarrollo con recarga en caliente (HMR):

```bash
bun dev
```

La aplicación estará disponible en `http://localhost:3000`.

### Gestión de Base de Datos

Comandos útiles para manejar la base de datos:

- `bun run db:start`: levanta PostgreSQL 17 + PostGIS 3.5 con Docker Compose y espera a que esté saludable.
- `bun run db:stop`: detiene el contenedor de base sin borrar datos.
- `bun run db:reset`: elimina el contenedor y el volumen de datos local.
- `bun run db:setup`: levanta la base y aplica las migraciones del proyecto.
- `bun db:generate`: Genera archivos de migración SQL basados en cambios en `src/server/db/schema.ts`.
- `bun db:migrate`: Aplica las migraciones pendientes a la base de datos.
- `bun db:push`: Sincroniza el schema directamente contra la base. Úsalo solo si sabes que quieres evitar el flujo de migraciones.
- `bun run db:logs`: muestra los logs del contenedor de PostGIS.
- `bun db:studio`: Abre **Drizzle Studio** en tu navegador, una interfaz visual para explorar y editar tus datos.

La imagen Docker ya instala PostGIS y ejecuta `CREATE EXTENSION IF NOT EXISTS postgis;` al inicializar la base, así que un entorno nuevo no depende de pasos manuales fuera del repositorio.
Si vienes de una instalación manual anterior y quieres alinear tu entorno con estas migraciones, lo más seguro es recrear la base local con `bun run db:reset` y luego `bun run db:setup`.

### Linting y Formateo

Mantén la calidad del código con:

- `bun run lint`: Busca errores de linting.
- `bun run format:check`: Verifica el formato del código con Prettier.

### Producción

Para construir y ejecutar la aplicación optimizada para producción:

```bash
bun run build
bun start
```

Para un deploy reproducible con contenedores, el repositorio incluye `Dockerfile` y `compose.production.yaml`.
La guía de uso en DonWeb quedó documentada en `DEPLOY_DONWEB.md`.

## 📂 Estructura del Proyecto

Un vistazo rápido a la organización de carpetas:

- `/src/app`: Contiene las páginas y rutas (App Router).
- `/src/components`: Componentes de UI reutilizables (botones, inputs, mapas, etc.).
- `/src/server`: Configuración del backend, esquemas de base de datos (Drizzle) y procedimientos tRPC (si aplica).
- `/src/lib`: Utilidades, helpers y configuraciones de librerías.
- `/public`: Archivos estáticos (imágenes, fuentes, etc.).
- `/drizzle`: Archivos de configuración y migraciones de la base de datos.

---

_Documentación generada para el proyecto Visor Bun._
