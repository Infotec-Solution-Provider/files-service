/*
  Warnings:

  - Changed the type of `dir_type` on the `files` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "files" DROP COLUMN "dir_type",
ADD COLUMN     "dir_type" "FileDirType" NOT NULL;
