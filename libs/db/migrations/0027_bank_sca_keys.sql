ALTER TABLE "bank_connections" ADD COLUMN "public_key_pem" text;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD COLUMN "encrypted_private_key_pem" text;