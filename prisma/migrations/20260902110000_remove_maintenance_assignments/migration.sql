-- tickets aren't assigned to accounts anymore
ALTER TABLE "MaintenanceTicket" DROP COLUMN "assignedToName";
