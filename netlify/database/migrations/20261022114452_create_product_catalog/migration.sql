CREATE TABLE "products" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"family" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"price" double precision NOT NULL,
	"size" text DEFAULT '50 ml' NOT NULL,
	"tag" text,
	"glass" text DEFAULT '#e8cfd2' NOT NULL,
	"liquid" text DEFAULT '#b97880' NOT NULL,
	"cap" text DEFAULT '#6B1F3A' NOT NULL,
	"backdrop" text DEFAULT '#EDE3D7' NOT NULL,
	"shape" text DEFAULT 'square' NOT NULL,
	"image_url" text,
	"image_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sold_out" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
