-- Existing media IDs intentionally keep a NULL timestamp and refresh on next use.
ALTER TABLE `files` ADD COLUMN `waba_media_uploaded_at` DATETIME(3) NULL;
