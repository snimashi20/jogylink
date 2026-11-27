CREATE TYPE "public"."web_order_status" AS ENUM('new', 'confirmed', 'packed', 'handed_to_courier', 'in_transit', 'delivered', 'delivery_failed', 'returned', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."web_payment_method" AS ENUM('cod', 'card');--> statement-breakpoint
CREATE TYPE "public"."web_payment_status" AS ENUM('pending', 'authorised', 'settled', 'failed', 'awaiting_collection', 'collected', 'remitted', 'refund_pending', 'refunded');--> statement-breakpoint
CREATE TABLE "web_order_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"web_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	CONSTRAINT "web_order_line_quantity_positive" CHECK ("web_order_line"."quantity" > 0),
	CONSTRAINT "web_order_line_price_non_negative" CHECK ("web_order_line"."unit_price" >= 0),
	CONSTRAINT "web_order_line_total_adds_up" CHECK ("web_order_line"."line_total" = "web_order_line"."unit_price" * "web_order_line"."quantity")
);
--> statement-breakpoint
CREATE TABLE "web_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"tracking_token" text NOT NULL,
	"status" "web_order_status" DEFAULT 'new' NOT NULL,
	"status_reason" text,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address_line" text NOT NULL,
	"city" text NOT NULL,
	"note" text,
	"payment_method" "web_payment_method" NOT NULL,
	"payment_status" "web_payment_status" NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"delivery_charge" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"courier_name" text,
	"tracking_number" text,
	"courier_tracking_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "web_order_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "web_order_tracking_token_unique" UNIQUE("tracking_token"),
	CONSTRAINT "web_order_money_non_negative" CHECK ("web_order"."subtotal" >= 0 and "web_order"."delivery_charge" >= 0),
	CONSTRAINT "web_order_total_adds_up" CHECK ("web_order"."total" = "web_order"."subtotal" + "web_order"."delivery_charge"),
	CONSTRAINT "web_order_number_format" CHECK ("web_order"."order_number" ~ '^WO-[0-9]{4}-[0-9]{5}$'),
	CONSTRAINT "web_order_courier_known_after_dispatch" CHECK ("web_order"."status" not in ('handed_to_courier', 'in_transit', 'delivered', 'delivery_failed', 'returned')
          or ("web_order"."courier_name" is not null and "web_order"."tracking_number" is not null)),
	CONSTRAINT "web_order_reason_when_cancelled_or_failed" CHECK ("web_order"."status" not in ('cancelled', 'delivery_failed') or "web_order"."status_reason" is not null),
	CONSTRAINT "web_order_payment_status_matches_method" CHECK (("web_order"."payment_method" = 'card' and "web_order"."payment_status" in ('pending', 'authorised', 'settled', 'failed', 'refund_pending', 'refunded'))
          or ("web_order"."payment_method" = 'cod' and "web_order"."payment_status" in ('awaiting_collection', 'collected', 'remitted', 'refund_pending', 'refunded')))
);
--> statement-breakpoint
ALTER TABLE "web_order_line" ADD CONSTRAINT "web_order_line_web_order_id_web_order_id_fk" FOREIGN KEY ("web_order_id") REFERENCES "public"."web_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_order_line" ADD CONSTRAINT "web_order_line_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "web_order_line_order_product_unique" ON "web_order_line" USING btree ("web_order_id","product_id");--> statement-breakpoint
CREATE INDEX "web_order_line_product_idx" ON "web_order_line" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "web_order_status_idx" ON "web_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "web_order_created_at_idx" ON "web_order" USING btree ("created_at");