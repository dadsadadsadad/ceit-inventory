CREATE TYPE "PublicRequestKind" AS ENUM ('BORROW', 'RETURN');

ALTER TABLE "BorrowRequest" ADD COLUMN "personalDataExpiresAt" TIMESTAMP(3);
UPDATE "BorrowRequest" SET "personalDataExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '365 days' WHERE "personalDataExpiresAt" IS NULL;
ALTER TABLE "BorrowRequest" ALTER COLUMN "personalDataExpiresAt" SET NOT NULL;
CREATE INDEX "BorrowRequest_personalDataExpiresAt_idx" ON "BorrowRequest"("personalDataExpiresAt");

CREATE TABLE "PublicRequestAttempt" (
  "id" UUID NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "kind" "PublicRequestKind" NOT NULL,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRequestAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicRequestAttempt_fingerprint_kind_key" ON "PublicRequestAttempt"("fingerprint", "kind");
CREATE INDEX "PublicRequestAttempt_updatedAt_idx" ON "PublicRequestAttempt"("updatedAt");

ALTER TABLE "PublicRequestAttempt" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "Location_name_lower_key" ON "Location"(lower(name));
CREATE UNIQUE INDEX "Category_name_lower_key" ON "Category"(lower(name));

DO $$
DECLARE
  target_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ceit_inventory_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO ceit_inventory_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ceit_inventory_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ceit_inventory_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ceit_inventory_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ceit_inventory_app';

    FOREACH target_table IN ARRAY ARRAY['Location', 'Category', 'InventoryItem', 'Computer', 'ComputerSoftware', 'InventoryAudit', 'User', 'UserSession', 'DashboardNote', 'BorrowRequest', 'MaintenanceTicket', 'InventoryItemPhoto', 'PublicRequestAttempt']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS "ceit_inventory_app_access" ON public.%I', target_table);
      EXECUTE format('CREATE POLICY "ceit_inventory_app_access" ON public.%I FOR ALL TO ceit_inventory_app USING (true) WITH CHECK (true)', target_table);
    END LOOP;
  END IF;
END $$;
