-- preventive maintenance schedules and when they were done

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "intervalDays" INTEGER NOT NULL,
    "categoryId" UUID,
    "locationId" UUID,
    "itemId" UUID,
    "nextDueOn" DATE NOT NULL,
    "lastDoneAt" TIMESTAMP(3),
    "lastDoneByName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenancePlan_intervalDays_check" CHECK ("intervalDays" BETWEEN 1 AND 730),
    CONSTRAINT "MaintenancePlan_scope_check"
      CHECK ("itemId" IS NOT NULL OR "categoryId" IS NOT NULL OR "locationId" IS NOT NULL)
);

-- CreateTable
CREATE TABLE "MaintenancePlanLog" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneByName" TEXT,
    "notes" TEXT,
    "itemCount" INTEGER NOT NULL,

    CONSTRAINT "MaintenancePlanLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaintenancePlan_isActive_nextDueOn_idx" ON "MaintenancePlan"("isActive", "nextDueOn");

-- CreateIndex
CREATE INDEX "MaintenancePlan_itemId_idx" ON "MaintenancePlan"("itemId");

-- CreateIndex
CREATE INDEX "MaintenancePlanLog_planId_doneAt_idx" ON "MaintenancePlanLog"("planId", "doneAt");

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlanLog" ADD CONSTRAINT "MaintenancePlanLog_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- rls like the other tables
ALTER TABLE "MaintenancePlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaintenancePlanLog" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ceit_inventory_app') THEN
    FOREACH target_table IN ARRAY ARRAY['MaintenancePlan', 'MaintenancePlanLog']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS "ceit_inventory_app_access" ON public.%I', target_table);
      EXECUTE format('CREATE POLICY "ceit_inventory_app_access" ON public.%I FOR ALL TO ceit_inventory_app USING (true) WITH CHECK (true)', target_table);
    END LOOP;
  END IF;
END $$;
