CREATE TABLE "firebase_staff_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"nombre_completo" varchar(255) NOT NULL,
	"email" varchar(255),
	"rol_dashboard" varchar(64),
	"registro_sep" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" varchar(16) DEFAULT 'activo' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firebase_staff_candidates_tenant_uid_key" UNIQUE("tenant_id","firebase_uid")
);
--> statement-breakpoint
ALTER TABLE "firebase_staff_candidates" ADD CONSTRAINT "firebase_staff_candidates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;