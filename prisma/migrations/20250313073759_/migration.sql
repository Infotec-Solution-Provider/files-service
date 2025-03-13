-- CreateTable
CREATE TABLE `files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `id_storage` VARCHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `size` INTEGER NOT NULL,
    `dir_type` ENUM('public', 'models') NOT NULL,
    `storage_id` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `storages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `instance` VARCHAR(30) NOT NULL,
    `type` ENUM('server', 'client') NOT NULL,
    `client_url` VARCHAR(191) NULL,
    `timeout` INTEGER NULL,
    `token` VARCHAR(191) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `files` ADD CONSTRAINT `FK_FILE_STORAGE` FOREIGN KEY (`storage_id`) REFERENCES `storages`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
