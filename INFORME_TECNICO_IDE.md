# Infraestructura de Datos Espaciales (IDE) - Visor de Datos Censales
**Dirección de Estadísticas y Censos de Santiago del Estero**

**Fecha:** 10 de Febrero de 2026
**Versión del Documento:** 1.0
**Estado del Proyecto:** v1.0.0 (Producción Inminente)

---

## 1. Resumen Ejecutivo

La plataforma **Visor IDE** representa un salto cualitativo en la gestión y difusión de información geoespacial para la provincia de Santiago del Estero. A diferencia de los visores GIS tradicionales monolíticos, esta solución adopta una arquitectura moderna basada en la nube, optimizada para el rendimiento y la experiencia de usuario (UX).

El sistema permite la visualización interactiva de datos censales complejos (radios, departamentos, indicadores demográficos) sobre mapas base dinámicos. Su arquitectura desacoplada facilita la administración autónoma por parte del personal técnico mediante un panel de control intuitivo, eliminando la dependencia de ediciones directas en base de datos para tareas rutinarias como la publicación de nuevas capas.

---

## 2. Arquitectura del Sistema

El sistema utiliza un stack tecnológico de última generación (T3 Stack modernizado), priorizando el tipado estático, la performance y la escalabilidad modular.

### 2.1 Frontend (Capa de Presentación)
*   **Framework:** **Next.js 15 (App Router)**. Utiliza React Server Components (RSC) para mejorar el SEO y la carga inicial, delegando la interactividad del mapa a "Client Components".
*   **Lenguaje:** **TypeScript** estricto, garantizando robustez y reduciendo errores en tiempo de ejecución.
*   **Estilos y UI:**
    *   **Tailwind CSS v4:** Para un diseño responsivo y utility-first.
    *   **Shadcn/UI (sobre Radix primitives):** Provee componentes accesibles y personalizables (Dialogs, Dropdowns, Sheets) con un diseño consistente y profesional.
    *   **Drag & Drop:** Implementado con **@dnd-kit** para la gestión fluida de jerarquías de capas.
*   **Mapa Interactivo:** **React-Leaflet** (wrapper de Leaflet.js). Elegido por su ligereza y compatibilidad móvil frente a motores WebGL más pesados, ideal para la visualización de vectores censales estándar.
*   **Gestión de Estado:** **TanStack Query** para el manejo eficiente de caché y sincronización de datos asíncronos (API).

### 2.2 Backend (Capa de Lógica y Datos)
*   **API y Server Actions:** Endpoints RESTful integrados en Next.js (`/api/admin/layers`, `/api/admin/users`) y Server Actions para mutaciones seguras.
*   **ORM (Object-Relational Mapping):** **Drizzle ORM**. Permite consultas SQL type-safe de alto rendimiento, evitando la sobrecarga de ORMs tradicionales como Prisma.
*   **Validación de Datos:** **Zod**. Asegura que la entrada de datos (especialmente configs JSON y GeoJSON) cumpla estrictamente con el esquema esperado antes de procesar.

### 2.3 Base de Datos Espacial
*   **Motor:** **PostgreSQL** con la extensión **PostGIS** activada.
*   **Esquema de Datos:**
    *   `carto_censal`: Esquema dedicado para tablas de geometrías pesadas (ej. `radios_censales`, `deptos`).
    *   `layers` y `layer_groups`: Tablas de metadatos que definen la estructura del árbol de capas, visibilidad y configuración de estilos.
    *   `users` (gestionado externamente/sincronizado): Referencias a identidad.

---

## 3. Guía Funcional Detallada

El flujo de trabajo cubre desde la autenticación administrativa hasta el consumo público de los datos.

### 3.1 Acceso y Seguridad (Login)
El sistema utiliza **Clerk** como proveedor de identidad, delegando la complejidad de la autenticación (2FA, sesiones, recuperación de contraseñas).
*   **Flujo:** El usuario accede a `/admin`. Si no tiene sesión activa, es redirigido al portal de Clerk.
*   **Middleware:** Intercepta las rutas protegidas verificando el rol del usuario en los metadatos de la sesión.

### 3.2 Panel de Administración (Back-office)
Una vez autenticado, el administrador accede a un dashboard integral:

1.  **Dashboard de Estado:**
    *   Visualización de métricas clave: Total de capas activas, usuarios registrados y estado de conexión con la base de datos (Health Check).

2.  **Gestión de Capas (El "Cerebro" del Visor):**
    *   **Árbol Jerárquico:** Interfaz de arrastrar y soltar (Drag & Drop) que permite organizar capas dentro de grupos y subgrupos.
    *   **Configuración JSON (`VectorConfig`):** Cada capa posee un campo de configuración flexible que define:
        *   `schema` y `table`: A qué tabla de PostGIS apunta.
        *   `geomColumn`: Nombre de la columna geométrica.
        *   `popupProps`: Array de campos a mostrar en el popup (ej. `["poblacion", "hogares"]`).
    *   Esto permite conectar cualquier tabla nueva en la BD sin tocar el código fuente del frontend.

3.  **Gestión de Usuarios:**
    *   Tabla interactiva para invitar nuevos colaboradores vía email.
    *   Asignación de roles (Admin/Editor) que limitan las acciones destructivas (borrar capas).

### 3.3 Visualización Pública (El Visor)
El usuario final accede a la raíz del sitio:
*   **Carga Inicial:** Se recupera el árbol de capas público desde la API.
*   **Navegación:** Mapa a pantalla completa con controles de zoom y panel lateral colapsable.
*   **Interacción:**
    *   Al activar una capa, el frontend solicita los datos vectoriales (GeoJSON) optimizados.
    *   Al hacer clic en un polígono, se consulta la configuración de la capa para renderizar un cuadro de información (Popup) con los datos sociodemográficos configurados.

---

## 4. Seguridad y Control de Acceso

La seguridad se implementa en múltiples capas (Defensa en Profundidad):

*   **Autenticación Robusta:** Clerk maneja el ciclo de vida de la identidad, impidiendo ataques comunes de fuerza bruta o suplantación.
*   **RBAC (Role-Based Access Control):**
    *   **Admin:** Acceso total (Crear/Editar/Borrar capas y usuarios).
    *   **Editor:** Puede modificar atributos de capas pero no alterar la estructura crítica del sistema ni gestionar usuarios.
    *   **Middleware de Protección:** Las rutas `/api/admin/*` rechazan automáticamente peticiones sin token válido o con permisos insuficientes.
*   **Validación de Inputs:** Todas las entradas de la API pasan por validación Zod para prevenir inyección SQL o corrupción de datos JSON.

---

## 5. Flujo de Datos Técnico

### De GeoJSON a PostGIS (Ingesta)
1.  **Carga:** El administrador sube un archivo GeoJSON al servidor.
2.  **Procesamiento:** El backend lee la geometría y los atributos.
3.  **Conversión:** Se transforma el GeoJSON a WKT (Well-Known Text) o WKB para inserción eficiente en PostGIS.
4.  **Almacenamiento:** Se crea o actualiza una tabla en el esquema `carto_censal` (ej. `pais8622`) con índice espacial GIST para consultas rápidas.

### De PostGIS al Navegador (Consumo)
1.  **Consulta:** El cliente solicita los datos de una capa activa.
2.  **Query Espacial:** El backend ejecuta una consulta optimizada (usando funciones como `ST_AsGeoJSON`) sobre la tabla configurada.
3.  **Respuesta:** Se envía un objeto FeatureCollection estándar.
4.  **Renderizado:** Leaflet dibuja los vectores en el canvas del navegador, aplicando estilos según la configuración (colores, opacidad).

---

## 6. Conclusiones y Próximos Pasos

La Plataforma IDE de Santiago del Estero se posiciona como una herramienta moderna, segura y altamente configurable. Sus principales fortalezas radican en la separación de preocupaciones (Front/Back/Datos) y en la capacidad de evolución sin refactorización de código.

### Análisis DAFO (SWOT)
*   **Fortalezas:** Stack moderno (Next.js/Drizzle), excelente UX para administradores (Drag & Drop), infraestructura de base de datos sólida (PostGIS).
*   **Oportunidades:** El esquema de base de datos ya soporta tipos `wms` y `xyz`, lo que permitirá integrar servicios externos (IGN, Argenmap) fácilmente en el futuro.
*   **Debilidades:** La renderización de vectores pesados en el cliente (Leaflet) tiene un límite de performance; para capas masivas (millones de puntos) se requerirá migrar a Vector Tiles (MVT).

### Próximos Pasos Recomendados
1.  **Implementación de WMS:** Activar la funcionalidad ya existente en el esquema de base de datos para consumir servicios web estándar.
2.  **Caché de API:** Implementar caché en redis o headers de cache-control para las respuestas GeoJSON estáticas.
3.  **Vector Tiles:** Para capas de alta densidad (manzanas, parcelas), implementar un servicio de tiles dinámicos (ej. `pg_tileserv`) para no saturar el navegador del cliente.
4.  **Documentación de API:** Generar Swagger/OpenAPI para facilitar la integración con otros organismos del estado.
