CREATE TYPE "public"."area_permission" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "area_members" (
	"area_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"permission" "area_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "area_members_area_id_user_id_pk" PRIMARY KEY("area_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "area_members" ADD CONSTRAINT "area_members_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_members" ADD CONSTRAINT "area_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_members_user_id_idx" ON "area_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "areas_name_key" ON "areas" USING btree (lower("name"));