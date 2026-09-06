CREATE TYPE "public"."bank_connection_status" AS ENUM('active', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."bank_provider" AS ENUM('wise');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_result_type" AS ENUM('expense', 'payment');--> statement-breakpoint
CREATE TYPE "public"."bank_transaction_status" AS ENUM('pending', 'categorized', 'ignored');--> statement-breakpoint
CREATE TABLE "bank_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"wise_balance_id" text NOT NULL,
	"currency" text NOT NULL,
	"name" text,
	"amount_minor" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "bank_provider" DEFAULT 'wise' NOT NULL,
	"wise_profile_id" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"status" "bank_connection_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"last_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"balance_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"raw_type" text,
	"fee_minor" integer DEFAULT 0 NOT NULL,
	"running_balance_minor" integer,
	"raw_payload" jsonb NOT NULL,
	"status" "bank_transaction_status" DEFAULT 'pending' NOT NULL,
	"result_type" "bank_transaction_result_type",
	"result_id" uuid,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "bank_balances" ADD CONSTRAINT "bank_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_balances" ADD CONSTRAINT "bank_balances_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_balance_id_bank_balances_id_fk" FOREIGN KEY ("balance_id") REFERENCES "public"."bank_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bank_balances_connection_wise_idx" ON "bank_balances" USING btree ("connection_id","wise_balance_id");--> statement-breakpoint
CREATE INDEX "bank_balances_user_idx" ON "bank_balances" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_connections_user_profile_idx" ON "bank_connections" USING btree ("user_id","provider","wise_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_transactions_balance_external_idx" ON "bank_transactions" USING btree ("balance_id","external_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_user_status_idx" ON "bank_transactions" USING btree ("user_id","status","occurred_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");