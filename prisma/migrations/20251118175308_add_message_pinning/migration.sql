-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
