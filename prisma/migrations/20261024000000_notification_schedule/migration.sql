-- when and how often each person gets email
ALTER TABLE "User"
  ADD COLUMN "notifyLater" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "summaryFrequency" TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN "summaryDay" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "summaryTime" TEXT NOT NULL DEFAULT 'morning',
  ADD CONSTRAINT "User_summaryFrequency_check"
    CHECK ("summaryFrequency" IN ('daily', 'weekdays', 'weekly', 'off')),
  ADD CONSTRAINT "User_summaryDay_check" CHECK ("summaryDay" BETWEEN 0 AND 6),
  ADD CONSTRAINT "User_summaryTime_check" CHECK ("summaryTime" IN ('morning', 'afternoon'));
