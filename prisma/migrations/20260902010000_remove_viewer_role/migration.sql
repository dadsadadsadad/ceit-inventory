-- The application now has exactly two account roles. Preserve any existing
-- Viewer accounts by giving them the operational Staff role before removing
-- the enum value; no user accounts or audit records are deleted.
UPDATE "User"
SET "role" = 'STAFF'::"UserRole"
WHERE "role" = 'VIEWER'::"UserRole";

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'STAFF');
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole"
  USING ("role"::TEXT::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STAFF';
DROP TYPE "UserRole_old";
