CREATE TABLE "debt_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"debt_id" uuid NOT NULL,
	"entry_id" uuid,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"url" text NOT NULL,
	"pathname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "debts" ADD COLUMN "incurred_on" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "debt_attachments" ADD CONSTRAINT "debt_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_attachments" ADD CONSTRAINT "debt_attachments_debt_id_debts_id_fk" FOREIGN KEY ("debt_id") REFERENCES "public"."debts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_attachments" ADD CONSTRAINT "debt_attachments_entry_id_debt_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."debt_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "debt_attachments_debt_idx" ON "debt_attachments" USING btree ("debt_id");