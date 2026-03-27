# Instrucciones Rápidas

## Desarrollo local

### Requisitos

- `Bun` instalado
- `Docker` + `Docker Compose`
- archivo `.env`

### Primer arranque

1. Clonar el repo:

```bash
git clone <URL_DEL_REPO>
cd visor-bun
```

2. Instalar dependencias:

```bash
bun install
```

3. Crear variables de entorno:

```bash
cp .env.example .env
```

4. Completar `.env`:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_PORT`
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Si `5432` ya está ocupado por otro PostgreSQL local, cambiar `POSTGRES_PORT` y también `DATABASE_URL`.

5. Levantar PostGIS:

```bash
bun run db:start
```

6. Aplicar migraciones:

```bash
bun run db:migrate
```

7. Iniciar el servidor de desarrollo:

```bash
bun dev
```

La app queda en `http://localhost:3000`.

## Comandos útiles

Levantar base:

```bash
bun run db:start
```

Detener base:

```bash
bun run db:stop
```

Ver logs de la base:

```bash
bun run db:logs
```

Recrear la base local desde cero:

```bash
bun run db:reset
bun run db:setup
```

## Qué tienen que saber quienes clonen el repo

- La app ya no depende de un PostgreSQL manual instalado en cada máquina.
- La base local corre en Docker con la imagen `postgis/postgis`.
- PostGIS se habilita automáticamente al inicializar la base.
- El flujo correcto es:
  - `bun install`
  - crear `.env`
  - `bun run db:start`
  - `bun run db:migrate`
  - `bun dev`
- Si no tienen claves válidas de Clerk, el panel admin y autenticación no van a funcionar correctamente.
- Si vienen de una instalación vieja o una base armada a mano, conviene usar:

```bash
bun run db:reset
bun run db:setup
```

## Qué tener en cuenta para la VPS

- Usar el stack Docker de producción, no instalar PostgreSQL/PostGIS manualmente en el host.
- El deploy productivo usa:
  - `Dockerfile`
  - `compose.production.yaml`
  - `docker/postgres/init/01-postgis.sql`
- La base no debería exponerse públicamente.
- En producción usar claves `pk_live_` y `sk_live_` de Clerk.
- El dominio final tiene que estar configurado también en Clerk.
- La app se levanta con:

```bash
docker compose -f compose.production.yaml up -d --build
```

- Para actualizar:

```bash
git pull
docker compose -f compose.production.yaml up -d --build
```

- Si cambia el dominio, revisar:
  - Nginx
  - SSL
  - configuración de Clerk

## Checklist antes de producción

- `.env` productivo completo
- claves live de Clerk
- dominio apuntando a la VPS
- Nginx configurado como reverse proxy
- certificado SSL funcionando
- deploy validado con:

```bash
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs -f
```

## Documentación ampliada

- Setup local y comandos generales: `README.md`
- Deploy en VPS/DonWeb: `DEPLOY_DONWEB.md`
