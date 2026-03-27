# Deploy en DonWeb con Docker

Guía corta para desplegar `visor-bun` en un Cloud Server de DonWeb usando el mismo enfoque reproducible del entorno local: contenedores para la app y para PostgreSQL + PostGIS.

## Qué cambia respecto al enfoque anterior

- No hace falta instalar PostgreSQL ni PostGIS manualmente en el servidor.
- No hace falta usar PM2 para la app.
- La base queda aislada dentro de Docker y no expuesta a Internet.
- El deploy se hace con archivos versionados del repo:
  - `Dockerfile`
  - `compose.production.yaml`
  - `docker/postgres/init/01-postgis.sql`

## 1. Requisitos

- Cloud Server con Ubuntu 22.04 LTS o similar
- 2 vCPU / 2 GB RAM mínimo
- Acceso SSH al servidor
- Dominio apuntando al servidor
- Cuenta de Clerk con claves de producción

## 2. Preparar el servidor

Actualizar paquetes:

```bash
sudo apt update && sudo apt upgrade -y
```

Instalar Docker y el plugin de Compose:

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

Verificar:

```bash
docker --version
docker compose version
```

## 3. Clonar el proyecto

```bash
git clone <URL_DEL_REPO> visor-bun
cd visor-bun
```

## 4. Configurar variables de entorno

Crear el archivo:

```bash
cp .env.example .env
```

Editar `.env` y completar como mínimo:

```env
POSTGRES_DB=visor-bun
POSTGRES_USER=postgres
POSTGRES_PASSWORD=una-clave-segura
APP_PORT=3000

DATABASE_URL=postgresql://postgres:una-clave-segura@localhost:5432/visor-bun

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_SECRET_KEY=sk_live_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/admin/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/admin
```

Notas importantes:

- `DATABASE_URL` puede seguir apuntando a `localhost` en el archivo `.env`. Dentro del deploy Docker, `compose.production.yaml` la reemplaza para que la app use `db` como host interno.
- Usá claves `pk_live_` y `sk_live_` para producción.
- Si querés publicar la app en otro puerto interno, cambiá `APP_PORT`.

## 5. Levantar el stack de producción

Construir e iniciar:

```bash
docker compose -f compose.production.yaml up -d --build
```

Ver estado:

```bash
docker compose -f compose.production.yaml ps
```

Ver logs:

```bash
docker compose -f compose.production.yaml logs -f
```

Qué hace este stack:

- levanta `db` con `postgis/postgis:17-3.5`
- crea `postgis` automáticamente al inicializar la base
- construye la app con `Dockerfile`
- corre `bun run db:migrate` antes de `bun run start`

## 6. Verificar la app

Desde el servidor:

```bash
curl http://localhost:3000
```

Si configuraste otro puerto:

```bash
curl http://localhost:$APP_PORT
```

## 7. Exponerla con Nginx

Instalar Nginx:

```bash
sudo apt install -y nginx
```

Crear el virtual host:

```bash
sudo nano /etc/nginx/sites-available/visor-bun
```

Contenido sugerido:

```nginx
server {
    listen 80;
    server_name tu-dominio.com www.tu-dominio.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Si usás otro `APP_PORT`, cambiá `3000` por ese valor.

Activar la config:

```bash
sudo ln -s /etc/nginx/sites-available/visor-bun /etc/nginx/sites-enabled/visor-bun
sudo nginx -t
sudo systemctl reload nginx
```

## 8. SSL con Let's Encrypt

Instalar Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Emitir certificado:

```bash
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

## 9. Configurar Clerk para producción

En Clerk Dashboard:

- agregá tu dominio real en la aplicación
- verificá los redirect URLs
- confirmá que las claves cargadas en `.env` son las de producción

Si tu dominio final es `https://visor.tudominio.com`, ese dominio tiene que existir también del lado de Clerk.

## 10. Actualizar la aplicación

Cuando subas cambios al repo:

```bash
git pull
docker compose -f compose.production.yaml up -d --build
```

## 11. Comandos útiles

Reiniciar:

```bash
docker compose -f compose.production.yaml restart
```

Bajar el stack:

```bash
docker compose -f compose.production.yaml down
```

Borrar también la base local del servidor:

```bash
docker compose -f compose.production.yaml down -v
```

Esto último elimina los datos de PostgreSQL. Usarlo solo si querés recrear todo desde cero.

## 12. Troubleshooting rápido

La app no arranca:

```bash
docker compose -f compose.production.yaml logs app
```

La base no levanta:

```bash
docker compose -f compose.production.yaml logs db
```

El dominio responde pero Clerk falla:

- revisar claves `pk_live_` y `sk_live_`
- revisar dominio permitido en Clerk
- revisar que el proxy mantenga `Host` y `X-Forwarded-Proto`

Querés recrear el entorno completo:

```bash
docker compose -f compose.production.yaml down -v
docker compose -f compose.production.yaml up -d --build
```

## 13. Recomendación final

Para staging y producción, usá siempre el stack Docker del repo. Evitá instalar PostgreSQL o PostGIS manualmente en el host salvo que tengas un motivo operativo claro. La ventaja es que local, onboarding y deploy comparten la misma receta y eso reduce muchísimo el riesgo de errores difíciles de reproducir.
