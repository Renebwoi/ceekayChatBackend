-- AlterTable
ALTER TABLE "User" ADD COLUMN     "department" TEXT;

-- Backfill existing student/lecturer rows with an empty string department.
UPDATE "User"
SET "department" = ''
WHERE "role" IN ('STUDENT', 'LECTURER')
	AND "department" IS NULL;
