CREATE TYPE "public"."asset_status" AS ENUM('in_use', 'in_stock', 'maintenance', 'retired');--> statement-breakpoint
CREATE TABLE "asset_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"area_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "asset_status" DEFAULT 'in_use' NOT NULL,
	"hostname" text,
	"ip_address" text,
	"serial_number" text,
	"manufacturer" text,
	"model" text,
	"location" text,
	"notes" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_type_id_asset_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."asset_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_types_name_key" ON "asset_types" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "assets_area_id_idx" ON "assets" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "assets_type_id_idx" ON "assets" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "assets_name_idx" ON "assets" USING btree (lower("name"));--> statement-breakpoint
-- Default asset types, so the inventory is usable right away; administrators can edit or remove them.
INSERT INTO "asset_types" ("name", "description", "fields") VALUES
	('Server', 'Server fisici e macchine virtuali', '[{"key":"operating_system","label":"Sistema operativo","kind":"text","required":false},{"key":"role","label":"Ruolo","kind":"text","required":false},{"key":"virtual","label":"Macchina virtuale","kind":"boolean","required":false}]'),
	('Dispositivo di rete', 'Switch, router, firewall e access point', '[{"key":"device_kind","label":"Tipo di dispositivo","kind":"select","required":false,"options":["Switch","Router","Firewall","Access point","Altro"]},{"key":"firmware","label":"Versione firmware","kind":"text","required":false}]'),
	('Storage', 'NAS, SAN e unità di backup', '[{"key":"capacity_tb","label":"Capacità (TB)","kind":"number","required":false}]'),
	('Stampante', 'Stampanti e multifunzione', '[]'),
	('Altro', 'Tutto ciò che non rientra negli altri tipi', '[]');
