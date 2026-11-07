CREATE TYPE "public"."role" AS ENUM('owner', 'worker');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('piece', 'weight');--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"unit_type" "unit_type" NOT NULL,
	"wholesale_price" numeric(12, 2) NOT NULL,
	"retail_markup_override" numeric(6, 4),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_wholesale_price_non_negative" CHECK ("product"."wholesale_price" >= 0),
	CONSTRAINT "product_markup_override_range" CHECK ("product"."retail_markup_override" is null or ("product"."retail_markup_override" >= 1 and "product"."retail_markup_override" <= 10))
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;