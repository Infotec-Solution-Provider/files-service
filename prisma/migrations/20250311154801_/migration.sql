/*
  Warnings:

  - The values [files_service,wwebjs_client,files_client] on the enum `FileStorageType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FileStorageType_new" AS ENUM ('server', 'client');
ALTER TABLE "storages" ALTER COLUMN "type" TYPE "FileStorageType_new" USING ("type"::text::"FileStorageType_new");
ALTER TYPE "FileStorageType" RENAME TO "FileStorageType_old";
ALTER TYPE "FileStorageType_new" RENAME TO "FileStorageType";
DROP TYPE "FileStorageType_old";
COMMIT;
