CREATE TABLE "credit_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"source_uuid" text NOT NULL,
	"sale_uuid" text,
	"due_date" date,
	"occurred_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"note" text,
	CONSTRAINT "credit_entry_source_uuid_unique" UNIQUE("source_uuid"),
	CONSTRAINT "credit_entry_kind_known" CHECK ("credit_entry"."kind" in ('sale', 'return', 'payment', 'adjustment')),
	CONSTRAINT "credit_entry_amount_non_zero" CHECK ("credit_entry"."amount" <> 0),
	CONSTRAINT "credit_entry_amount_matches_kind" CHECK (("credit_entry"."kind" = 'sale' and "credit_entry"."amount" > 0)
           or ("credit_entry"."kind" in ('return', 'payment') and "credit_entry"."amount" < 0)
           or "credit_entry"."kind" = 'adjustment'),
	CONSTRAINT "credit_entry_due_date_only_on_sale" CHECK ("credit_entry"."due_date" is null or "credit_entry"."kind" = 'sale')
);
--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_shop_id_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shop"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_entry" ADD CONSTRAINT "credit_entry_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_entry_shop_idx" ON "credit_entry" USING btree ("shop_id","occurred_at");--> statement-breakpoint
CREATE INDEX "credit_entry_due_date_idx" ON "credit_entry" USING btree ("due_date");