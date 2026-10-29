CREATE TYPE "public"."element_type" AS ENUM('asset');--> statement-breakpoint
CREATE TYPE "public"."relation_kind" AS ENUM('depends_on', 'runs_on', 'located_in', 'backed_up_to', 'connected_to', 'related_to');--> statement-breakpoint
CREATE TABLE "relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "relation_kind" NOT NULL,
	"source_type" "element_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"target_type" "element_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relations_not_self" CHECK ("relations"."source_type" <> "relations"."target_type" OR "relations"."source_id" <> "relations"."target_id")
);
--> statement-breakpoint
ALTER TABLE "relations" ADD CONSTRAINT "relations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "relations_ends_key" ON "relations" USING btree ("kind","source_type","source_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "relations_source_idx" ON "relations" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "relations_target_idx" ON "relations" USING btree ("target_type","target_id");--> statement-breakpoint
-- Relation ends have no foreign keys (they are polymorphic): each element table
-- gets this trigger, with its element type as argument, so that deleting an
-- element also deletes its relations in the same transaction.
CREATE FUNCTION "delete_element_relations"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	DELETE FROM "relations"
	WHERE ("source_type" = TG_ARGV[0]::"element_type" AND "source_id" = OLD."id")
		OR ("target_type" = TG_ARGV[0]::"element_type" AND "target_id" = OLD."id");
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "assets_delete_relations" AFTER DELETE ON "assets"
	FOR EACH ROW EXECUTE FUNCTION "delete_element_relations"('asset');
