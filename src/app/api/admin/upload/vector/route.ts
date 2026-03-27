import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { sql } from "drizzle-orm";
import { getAuditActor, writeAuditLog } from "~/server/audit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      schema = "public",
      table,
      srid = 4326,
      geomColumn = "geom",
      geojson,
    } = body ?? {};

    if (!table || !geojson) {
      return NextResponse.json(
        { error: "table and geojson are required" },
        { status: 400 },
      );
    }

    // 1) Crear tabla si no existe (geometry con SRID declarado)
    await db.execute(sql`
      do $$
      begin
        if to_regclass(${sql.raw(`'${schema}.${table}'`)}) is null then
          execute 'create table ' || quote_ident(${schema})
            || '.' || quote_ident(${table})
            || ' (id serial primary key, ' || quote_ident(${geomColumn})
            || ' geometry(Geometry, ${srid}))';
        end if;
      end$$;
    `);

    // 2) Validar FeatureCollection
    const fc = geojson as { type: string; features: any[] };
    if (fc?.type !== "FeatureCollection") {
      return NextResponse.json(
        { error: "geojson must be a FeatureCollection" },
        { status: 400 },
      );
    }

    // 3) Insertar geometrías
    for (const f of fc.features ?? []) {
      if (!f?.geometry) continue;
      const geomJson = JSON.stringify(f.geometry);

      // Cast explícito del parámetro a text e int4 para que PG no se queje
      await db.execute(sql`
        insert into ${sql.raw(`${schema}.${table}`)}(${sql.raw(geomColumn)})
        values (
          ST_SetSRID(
            /* si querés forzar MultiPolygon, agrega ST_Multi(...) aquí */
            ST_GeomFromGeoJSON(CAST(${geomJson} AS text)),
            CAST(${srid} AS int4)
          )
        )
      `);
    }

    // 4) Crear índice espacial si no existe
    await db.execute(sql`
      do $$
      begin
        if not exists (
          select 1 from pg_indexes
          where schemaname = ${schema}
            and tablename = ${table}
            and indexname = ${sql.raw(`'${table}_geom_gix'`)}
        ) then
          execute 'create index ' || quote_ident(${table} || '_geom_gix') ||
                  ' on ' || quote_ident(${schema}) || '.' || quote_ident(${table}) ||
                  ' using gist(' || quote_ident(${geomColumn}) || ')';
        end if;
      end$$;
    `);

    const suggestedConfig = {
      type: "vector" as const,
      schema,
      table,
      geomColumn,
      srid,
      popupProps: [],
    };

    const actor = await getAuditActor();

    await writeAuditLog(db, {
      actor,
      action: "import",
      resourceType: "vector_table",
      resourceId: `${schema}.${table}`,
      resourceLabel: table,
      summary: `Importó datos vectoriales en la tabla "${schema}.${table}"`,
      details: {
        notes: [`Columna geométrica: ${geomColumn}`],
        metadata: {
          schema,
          table,
          srid,
          featureCount: fc.features?.length ?? 0,
        },
      },
    });

    return NextResponse.json({ ok: true, suggestedConfig });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "upload failed" },
      { status: 500 },
    );
  }
}
