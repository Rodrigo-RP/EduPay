CREATE TABLE "sso_assertions_used" (
	"jti" varchar(128) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_sso_assertions_used_expires" ON "sso_assertions_used" USING btree ("expires_at" timestamptz_ops);