CREATE TABLE "month_incomes" (
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "month_incomes_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "income_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "month_incomes" ADD CONSTRAINT "month_incomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;