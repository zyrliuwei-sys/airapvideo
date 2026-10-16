-- 2026-10-16: first-party funnel event table (src/config/db/schema.sqlite.ts → event).
-- Additive only (new table + indexes). Generated with drizzle-kit export.
-- Apply: npx wrangler d1 execute hotel-lobby-db --remote --file scripts/sql/2026-10-16-event-table.sql

CREATE TABLE IF NOT EXISTS `event` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`user_id` text,
	`event` text NOT NULL,
	`first_source` text DEFAULT '' NOT NULL,
	`first_referrer` text DEFAULT '' NOT NULL,
	`first_utm` text DEFAULT '' NOT NULL,
	`first_country` text DEFAULT '' NOT NULL,
	`build` text DEFAULT '' NOT NULL,
	`experiment` text DEFAULT '' NOT NULL,
	`payment_provider` text,
	`product_id` text,
	`path` text,
	`props` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_event_created` ON `event` (`created_at`,`event`);
CREATE INDEX IF NOT EXISTS `idx_event_visitor` ON `event` (`visitor_id`,`created_at`);
CREATE INDEX IF NOT EXISTS `idx_event_user` ON `event` (`user_id`,`created_at`);
