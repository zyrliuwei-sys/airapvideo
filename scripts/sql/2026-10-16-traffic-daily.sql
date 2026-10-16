-- 2026-10-16: daily Cloudflare Web Analytics traffic (src/config/db/schema.sqlite.ts → traffic_daily).
-- Additive only (new table + index). Filled by: npx tsx scripts/sync-traffic.ts
-- Apply: npx wrangler d1 execute hotel-lobby-db --remote --file scripts/sql/2026-10-16-traffic-daily.sql

CREATE TABLE IF NOT EXISTS `traffic_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`dim` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`page_views` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_traffic_daily_dim_day` ON `traffic_daily` (`dim`,`day`);
