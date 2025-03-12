/*
  Warnings:

  - You are about to drop the column `details` on the `storages` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "storages" DROP COLUMN "details",
ADD COLUMN     "server_url" TEXT,
ADD COLUMN     "timeout" INTEGER,
ADD COLUMN     "token" TEXT;
