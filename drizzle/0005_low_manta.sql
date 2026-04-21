ALTER TABLE "layers" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "source_creator" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "reference_year" text;--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "crs" text DEFAULT 'EPSG:4326';--> statement-breakpoint
ALTER TABLE "layers" ADD COLUMN "official_link" text;