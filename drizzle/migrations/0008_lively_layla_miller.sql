CREATE TABLE "external_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(32) DEFAULT 'firebase' NOT NULL,
	"subject" varchar(128) NOT NULL,
	"tenant_id" integer NOT NULL,
	"user_id" integer,
	"guardian_id" integer,
	"linked_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "external_identities_provider_subject_key" UNIQUE("provider","subject"),
	CONSTRAINT "external_identities_exactly_one_target" CHECK ((user_id IS NOT NULL) <> (guardian_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "firebase_campus_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"nivel" varchar(50) NOT NULL,
	"campus_id" integer NOT NULL,
	CONSTRAINT "firebase_campus_map_tenant_nivel_key" UNIQUE("tenant_id","nivel")
);
--> statement-breakpoint
CREATE TABLE "firebase_students" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"firebase_uid" varchar(128) NOT NULL,
	"student_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "firebase_students_tenant_uid_key" UNIQUE("tenant_id","firebase_uid"),
	CONSTRAINT "firebase_students_student_key" UNIQUE("student_id")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "firebase_id_escuela" varchar(64);--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "public"."guardians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firebase_campus_map" ADD CONSTRAINT "firebase_campus_map_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firebase_campus_map" ADD CONSTRAINT "firebase_campus_map_campus_id_fkey" FOREIGN KEY ("campus_id") REFERENCES "public"."campuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firebase_students" ADD CONSTRAINT "firebase_students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "firebase_students" ADD CONSTRAINT "firebase_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_user_key" ON "external_identities" USING btree ("provider" text_ops,"user_id" int4_ops) WHERE (user_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "external_identities_provider_guardian_key" ON "external_identities" USING btree ("provider" text_ops,"guardian_id" int4_ops) WHERE (guardian_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_external_identities_tenant" ON "external_identities" USING btree ("tenant_id" int4_ops);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_firebase_id_escuela_key" UNIQUE("firebase_id_escuela");