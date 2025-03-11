-- CreateEnum
CREATE TYPE "FileStorageType" AS ENUM ('FILES_SERVICE', 'WEBJS_CLIENT', 'FILES_CLIENT');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size" INTEGER NOT NULL,
    "dir_type" VARCHAR(20) NOT NULL,
    "storage_id" INTEGER NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storages" (
    "id" INTEGER NOT NULL,
    "instance" VARCHAR(30) NOT NULL,
    "type" "FileStorageType" NOT NULL,
    "details" JSON,

    CONSTRAINT "storages_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "FK_FILE_STORAGE" FOREIGN KEY ("storage_id") REFERENCES "storages"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
