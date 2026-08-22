DROP INDEX IF EXISTS "Location_building_roomNumber_key";

ALTER TABLE "Location" DROP COLUMN IF EXISTS "building";
ALTER TABLE "Location" DROP COLUMN IF EXISTS "floor";

CREATE UNIQUE INDEX "Location_name_key" ON "Location"("name");
