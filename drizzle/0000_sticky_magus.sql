CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "cert_progress_revisions" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cert_progress_revisions_user_id_cert_pk" PRIMARY KEY("user_id","cert"),
	CONSTRAINT "cert_progress_revisions_revision_non_negative" CHECK ("revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "question_progress" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"qid" integer NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"last_picks" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"last_correct" boolean,
	"last_answered_at" timestamp with time zone,
	"bookmarked" boolean DEFAULT false NOT NULL,
	"bookmark_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_progress_user_id_cert_qid_pk" PRIMARY KEY("user_id","cert","qid"),
	CONSTRAINT "question_progress_qid_positive" CHECK ("qid" > 0),
	CONSTRAINT "question_progress_counts_non_negative" CHECK ("correct_count" >= 0 AND "wrong_count" >= 0),
	CONSTRAINT "question_progress_answer_state_consistent" CHECK ((array_length("last_picks", 1) IS NULL AND "last_correct" IS NULL AND "last_answered_at" IS NULL AND "correct_count" = 0 AND "wrong_count" = 0) OR (array_length("last_picks", 1) IS NOT NULL AND "last_correct" IS NOT NULL AND "last_answered_at" IS NOT NULL AND ("correct_count" > 0 OR "wrong_count" > 0))),
	CONSTRAINT "question_progress_non_empty" CHECK (array_length("last_picks", 1) IS NOT NULL OR "bookmark_updated_at" IS NOT NULL),
	CONSTRAINT "question_progress_bookmark_timestamp_required" CHECK ("bookmarked" = false OR "bookmark_updated_at" IS NOT NULL),
	CONSTRAINT "question_progress_latest_correctness_count_consistent" CHECK ("last_correct" IS NULL OR ("last_correct" = true AND "correct_count" > 0) OR ("last_correct" = false AND "wrong_count" > 0))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_cert" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cert_progress_revisions" ADD CONSTRAINT "cert_progress_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_progress" ADD CONSTRAINT "question_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
