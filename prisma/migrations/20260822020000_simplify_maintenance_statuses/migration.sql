UPDATE "MaintenanceTicket" SET "status" = 'OPEN' WHERE "status"::text = 'IN_PROGRESS';

ALTER TABLE "MaintenanceTicket" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "MaintenanceStatus" RENAME TO "MaintenanceStatus_old";

CREATE TYPE "MaintenanceStatus" AS ENUM ('OPEN', 'RESOLVED');

ALTER TABLE "MaintenanceTicket"
  ALTER COLUMN "status" TYPE "MaintenanceStatus"
  USING "status"::text::"MaintenanceStatus";

ALTER TABLE "MaintenanceTicket" ALTER COLUMN "status" SET DEFAULT 'OPEN';

DROP TYPE "MaintenanceStatus_old";
