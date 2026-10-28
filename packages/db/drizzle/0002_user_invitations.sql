ALTER TABLE "users" ALTER COLUMN "auth_key_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kdf_salt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kdf_ops_limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "kdf_mem_limit" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invitation_token_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invitation_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_invitation_token_hash_key" ON "users" USING btree ("invitation_token_hash");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_credentials_complete" CHECK (num_nulls("users"."auth_key_hash", "users"."kdf_salt", "users"."kdf_ops_limit", "users"."kdf_mem_limit") in (0, 4));