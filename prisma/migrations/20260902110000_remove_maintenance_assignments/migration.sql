-- Maintenance requests are no longer assigned to individual accounts.
-- This removes only the unused assignment field; the maintenance records,
-- reporter details, resolutions, and audit history remain intact.
ALTER TABLE "MaintenanceTicket" DROP COLUMN "assignedToName";
