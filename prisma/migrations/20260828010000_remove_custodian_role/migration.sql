-- PostgreSQL enum values cannot be removed in place. Temporarily use text,
-- map existing Custodian accounts to Staff, and recreate the constrained enum.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING ("role"::text);

UPDATE "User"
SET "role" = 'STAFF'
WHERE "role" = 'CUSTODIAN';

DROP TYPE "UserRole";
CREATE TYPE "UserRole" AS ENUM ('ADMINISTRATOR', 'STAFF', 'VIEWER');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'VIEWER';
