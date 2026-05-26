CREATE TABLE "mock_exam_drafts" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"attempt_id" text NOT NULL,
	"detail" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mock_exam_drafts_user_id_cert_pk" PRIMARY KEY("user_id","cert")
);
--> statement-breakpoint
CREATE TABLE "mock_exam_revisions" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mock_exam_revisions_user_id_cert_pk" PRIMARY KEY("user_id","cert"),
	CONSTRAINT "mock_exam_revisions_revision_non_negative" CHECK ("mock_exam_revisions"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mock_exam_submitted_attempts" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"attempt_id" text NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"time_used_seconds" integer NOT NULL,
	"auto_submitted" boolean NOT NULL,
	"detail" jsonb NOT NULL,
	CONSTRAINT "mock_exam_submitted_attempts_user_id_cert_attempt_id_pk" PRIMARY KEY("user_id","cert","attempt_id")
);
--> statement-breakpoint
ALTER TABLE "mock_exam_drafts" ADD CONSTRAINT "mock_exam_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam_revisions" ADD CONSTRAINT "mock_exam_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mock_exam_submitted_attempts" ADD CONSTRAINT "mock_exam_submitted_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;