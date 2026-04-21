import {
  pgSchema,
  varchar,
  integer,
  doublePrecision,
  char,
  text,
  primaryKey,
  geometry,
  pgTable,
  boolean,
  jsonb,
  pgEnum,
  type AnyPgColumn,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

// ============================================================================
// 1. SCHEMAS
// ============================================================================
export const cartoCensalSchema = pgSchema("carto_censal");

// ============================================================================
// 2. ENUMS
// ============================================================================
export const layerKind = pgEnum("layer_kind", ["vector", "xyz", "wms"]);

// ============================================================================
// 3. TYPES
// ============================================================================
export type LayerBoundsConfig =
  | {
      south: number;
      west: number;
      north: number;
      east: number;
    }
  | [west: number, south: number, east: number, north: number];

export type LayerLegendConfig = {
  label?: string;
  description?: string;
  color?: string;
};

export type LayerMetadata = {
  owner?: string;
  createdDate?: string;
  updateFrequency?: string;
  variableEncoding?: string;
  recordDescription?: string;
};

export type LayerPopupConfig = {
  titleProp?: string;
  subtitleProp?: string;
  aliases?: Record<string, string>;
  hiddenProps?: string[];
  order?: string[];
};

export type LayerDisplayConfig = {
  opacity?: number;
  minZoom?: number;
  maxZoom?: number;
  bounds?: LayerBoundsConfig;
  legend?: LayerLegendConfig;
  metadata?: LayerMetadata;
};

export type VectorStyleConfig = {
  color?: string;
  fillColor?: string;
  weight?: number;
  fillOpacity?: number;
  opacity?: number;
  pointRadius?: number;
  dashArray?: string;
};

export type VectorConfig = LayerDisplayConfig & {
  type: "vector";
  schema: string;
  table: string;
  geomColumn: string;
  srid: number;
  popupProps?: string[];
  popup?: LayerPopupConfig;
  style?: VectorStyleConfig;
};

export type WmsConfig = LayerDisplayConfig & {
  type: "wms";
  url: string;
  layers: string;
  version?: string;
  format?: string;
  transparent?: boolean;
};

export type XyzConfig = LayerDisplayConfig & {
  type: "xyz";
  url: string;
  attribution?: string;
};

export type LayerConfig = VectorConfig | WmsConfig | XyzConfig;

export type AuditLogChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

export type AuditLogDetails = {
  changes?: AuditLogChange[];
  notes?: string[];
  metadata?: Record<string, unknown>;
};

// ============================================================================
// 4. TABLES
// ============================================================================

// --- Carto Censal Tables ---
export const radiosCensales = cartoCensalSchema.table(
  "pais8622",
  {
    id: integer("id").notNull(),
    cpr: varchar("cpr", { length: 2 }),
    jur: text("jur"),
    cde: varchar("cde", { length: 3 }),
    dpto: text("dpto"),
    cfn: varchar("cfn", { length: 2 }),
    cro: varchar("cro", { length: 2 }),
    tro: char("tro", { length: 1 }),
    codIndec: varchar("cod_indec", { length: 9 }).notNull(),
    shapeArea: doublePrecision("shape_area"),
    shapeLen: doublePrecision("shape_len"),
    geom: geometry("geom", { type: "MultiPolygon", srid: 4326 }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.codIndec] }),
    };
  },
);

// --- Layer Management Tables ---

// Groups of layers (e.g. "Censo 2022", "Base Maps")
export const layerGroups = pgTable("layer_groups", {
  id: text("id").primaryKey(), // slug, e.g. "censo-2022"
  name: text("name").notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => layerGroups.id),
  order: integer("order").notNull().default(0),
});

// Individual Layers
export const layers = pgTable("layers", {
  id: text("id").primaryKey(), // slug, e.g. "radios-censales"
  name: text("name").notNull(),
  kind: layerKind("kind").notNull(),
  groupId: text("group_id")
    .references(() => layerGroups.id, { onDelete: "cascade" })
    .notNull(),
  order: integer("order").notNull().default(0),
  defaultVisible: boolean("default_visible").notNull().default(false),
  config: jsonb("config").$type<LayerConfig>().notNull(),
});

// Administrative audit trail for traceability across admin actions
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    resourceLabel: text("resource_label"),
    summary: text("summary").notNull(),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    details: jsonb("details").$type<AuditLogDetails>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("admin_audit_logs_created_at_idx").on(table.createdAt),
  }),
);
