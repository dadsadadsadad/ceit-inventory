-- one notes box per item: keep description and the pc description text in notes first
UPDATE "InventoryItem"
SET "notes" = concat_ws(E'\n\n', NULLIF(btrim("description"), ''), NULLIF(btrim("notes"), ''))
WHERE NULLIF(btrim("description"), '') IS NOT NULL;

UPDATE "InventoryItem" AS item
SET "notes" = concat_ws(
  E'\n\n',
  NULLIF(btrim(item."notes"), ''),
  'Hardware: ' || NULLIF(btrim(pc."hardwareDescription"), ''),
  'Software: ' || NULLIF(btrim(pc."softwareDescription"), '')
)
FROM "Computer" AS pc
WHERE pc."itemId" = item."id"
  AND (NULLIF(btrim(pc."hardwareDescription"), '') IS NOT NULL
    OR NULLIF(btrim(pc."softwareDescription"), '') IS NOT NULL);

ALTER TABLE "InventoryItem" DROP COLUMN "description";

-- not tracked anymore
ALTER TABLE "Computer"
  DROP COLUMN "macAddress",
  DROP COLUMN "ipAddress",
  DROP COLUMN "hardwareDescription",
  DROP COLUMN "softwareDescription";

ALTER TABLE "ComputerSoftware" DROP COLUMN "licenseKeyHint";
