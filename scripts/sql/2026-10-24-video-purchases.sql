CREATE TABLE `video_purchase` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_no` text,
	`email` text DEFAULT '' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`input` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`task_id` text,
	`error` text,
	`email_sent_at` integer,
	`email_claimed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_purchase_order_no_unique` ON `video_purchase` (`order_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `video_purchase_task_id_unique` ON `video_purchase` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_video_purchase_user` ON `video_purchase` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_video_purchase_email` ON `video_purchase` (`email`);--> statement-breakpoint
CREATE INDEX `idx_video_purchase_status` ON `video_purchase` (`status`,`created_at`);