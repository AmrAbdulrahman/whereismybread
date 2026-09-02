CREATE TABLE "recipient_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon_key" text DEFAULT 'transfer' NOT NULL,
	"color" text DEFAULT '#6321d6' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "recipient_method_id" uuid;--> statement-breakpoint
ALTER TABLE "recipient_methods" ADD CONSTRAINT "recipient_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_methods_user_name_uq" ON "recipient_methods" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recipient_method_id_recipient_methods_id_fk" FOREIGN KEY ("recipient_method_id") REFERENCES "public"."recipient_methods"("id") ON DELETE set null ON UPDATE no action;