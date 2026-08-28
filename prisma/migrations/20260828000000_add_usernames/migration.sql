ALTER TABLE "User" ADD COLUMN "username" TEXT;

UPDATE "User"
SET "username" = replace("id"::text, '-', '');

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
