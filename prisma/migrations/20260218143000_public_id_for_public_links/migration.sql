-- AlterTable
ALTER TABLE `files` ADD COLUMN `public_id` CHAR(21) NULL;

-- Backfill with nanoid (21 chars, URL-safe random)
UPDATE `files` SET `public_id` = SUBSTRING(UUID(), 1, 21) WHERE `public_id` IS NULL;

-- Enforce constraints
ALTER TABLE `files` MODIFY `public_id` CHAR(21) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `files_public_id_key` ON `files`(`public_id`);
