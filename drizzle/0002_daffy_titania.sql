CREATE TABLE "daily_question_stats" (
	"user_id" text NOT NULL,
	"cert" text NOT NULL,
	"local_date" date NOT NULL,
	"source_id" text NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "daily_question_stats_user_id_cert_local_date_source_id_pk" PRIMARY KEY("user_id","cert","local_date","source_id"),
	CONSTRAINT "daily_question_stats_counts_non_negative" CHECK ("daily_question_stats"."correct_count" >= 0 AND "daily_question_stats"."wrong_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "daily_question_stats" ADD CONSTRAINT "daily_question_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;