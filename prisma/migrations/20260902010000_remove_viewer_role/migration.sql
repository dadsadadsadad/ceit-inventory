-- move viewers to staff before dropping the role
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
