-- which email notifications each person gets
ALTER TABLE "User"
  ADD COLUMN "notifyOn" TEXT[] NOT NULL
  DEFAULT ARRAY['borrowRequests', 'returns', 'repairs', 'dailyLoans']::TEXT[];
