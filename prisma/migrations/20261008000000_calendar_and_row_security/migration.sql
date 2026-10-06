-- Adds a table for the dashboard calendar's own events, row level security on the extra-fields
-- table from an earlier migration (it was created without it; every other table already has it, so
-- the public database API cannot read or write them), and a new kind of limited request so failed
-- sign-ins from one device can be counted. It also drops one redundant index. No data is changed or
-- removed, and the previous release keeps working against the result.

-- AlterEnum
ALTER TYPE "PublicRequestKind" ADD VALUE IF NOT EXISTS 'SIGN_IN';

-- A plain index on the room name that the unique indexes on the same column already cover. The
-- schema no longer declares it, so removing it leaves the database exactly as the schema describes.
DROP INDEX IF EXISTS "Location_name_idx";

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "eventDate" DATE NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_eventDate_idx" ON "CalendarEvent"("eventDate");

-- Row level security, like every other table.
ALTER TABLE "CalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomField" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ceit_inventory_app') THEN
    FOREACH target_table IN ARRAY ARRAY['CalendarEvent', 'CustomField']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS "ceit_inventory_app_access" ON public.%I', target_table);
      EXECUTE format('CREATE POLICY "ceit_inventory_app_access" ON public.%I FOR ALL TO ceit_inventory_app USING (true) WITH CHECK (true)', target_table);
    END LOOP;
  END IF;
END $$;
