CREATE TABLE "DashboardNote" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'shared-dashboard',
    "content" TEXT NOT NULL DEFAULT '',
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DashboardNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DashboardNote_scope_key" ON "DashboardNote"("scope");

ALTER TABLE "DashboardNote" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "DashboardNote" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "DashboardNote" FROM authenticated;
  END IF;
END $$;
