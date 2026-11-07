CREATE TABLE "route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "shop" ADD COLUMN "route_id" uuid;--> statement-breakpoint
ALTER TABLE "shop" ADD COLUMN "visit_order" integer;--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_route_id_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."route"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_route_id_idx" ON "shop" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_route_visit_order_unique" ON "shop" USING btree ("route_id","visit_order") WHERE "shop"."route_id" is not null and "shop"."visit_order" is not null;--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_visit_order_positive" CHECK ("shop"."visit_order" is null or "shop"."visit_order" > 0);--> statement-breakpoint
ALTER TABLE "shop" ADD CONSTRAINT "shop_route_assignment_consistent" CHECK (("shop"."route_id" is null) = ("shop"."visit_order" is null));