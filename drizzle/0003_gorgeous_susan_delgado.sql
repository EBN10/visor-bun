-- drizzle-kit serializes this geometry column incorrectly for this table,
-- so we correct the final runtime type here for clean bootstraps.
ALTER TABLE "carto_censal"."pais8622"
ALTER COLUMN "geom" SET DATA TYPE geometry(MultiPolygon,4326)
USING ST_SetSRID(ST_Multi("geom"), 4326);
