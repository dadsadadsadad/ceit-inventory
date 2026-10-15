-- calendar events, rls on CustomField, sign-in rate limit kind, drop a duplicate index

-- AlterEnum
ALTER TYPE "PublicRequestKind" ADD VALUE IF NOT EXISTS 'SIGN_IN';

-- already covered by the unique index
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

-- rls like the other tables
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
