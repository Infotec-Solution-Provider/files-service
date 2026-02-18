-- AlterTable
ALTER TABLE `files` ADD COLUMN `content_hash` CHAR(64) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `UQ_FILES_STORAGE_DIR_HASH` ON `files`(`storage_id`, `dir_type`, `content_hash`);