/*
  Warnings:

  - The values [temp] on the enum `FileDirType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "FileDirType_new" AS ENUM ('public', 'models');
ALTER TABLE "files" ALTER COLUMN "dir_type" TYPE "FileDirType_new" USING ("dir_type"::text::"FileDirType_new");
ALTER TYPE "FileDirType" RENAME TO "FileDirType_old";
ALTER TYPE "FileDirType_new" RENAME TO "FileDirType";
DROP TYPE "FileDirType_old";
COMMIT;

-- AlterTable
CREATE SEQUENCE storages_id_seq;
ALTER TABLE "storages" ALTER COLUMN "id" SET DEFAULT nextval('storages_id_seq');
ALTER SEQUENCE storages_id_seq OWNED BY "storages"."id";
