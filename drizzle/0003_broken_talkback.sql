CREATE TABLE `codebase_doc_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`codebase_id` text NOT NULL,
	`slug` text NOT NULL,
	`content` text NOT NULL,
	`origin` text NOT NULL,
	`base_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`codebase_id`) REFERENCES `codebases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `codebase_doc_proposals_codebase_slug_uq` ON `codebase_doc_proposals` (`codebase_id`,`slug`);--> statement-breakpoint
ALTER TABLE `agent_tokens` ADD `window_started_at` integer;--> statement-breakpoint
ALTER TABLE `agent_tokens` ADD `window_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `codebases` ADD `analysis_job_id` text;--> statement-breakpoint
ALTER TABLE `codebases` ADD `analysis_summary` text;