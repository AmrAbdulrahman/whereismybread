DROP INDEX "bank_connections_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_user_aspsp_idx" ON "bank_connections" USING btree ("user_id","aspsp_name","aspsp_country");