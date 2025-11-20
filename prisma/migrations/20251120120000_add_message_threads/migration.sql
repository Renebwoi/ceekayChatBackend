-- CreateEnum migration not required

ALTER TABLE "Message"
    ADD COLUMN "parentMessageId" TEXT,
    ADD COLUMN "deleted" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX "Message_courseId_createdAt_idx" ON "Message"("courseId", "createdAt");
CREATE INDEX "Message_courseId_parentMessageId_createdAt_idx" ON "Message"("courseId", "parentMessageId", "createdAt");

ALTER TABLE "Message"
    ADD CONSTRAINT "Message_parentMessageId_fkey" FOREIGN KEY ("parentMessageId")
    REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
