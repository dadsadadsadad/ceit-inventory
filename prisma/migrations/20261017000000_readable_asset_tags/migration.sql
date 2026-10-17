-- readable category and room codes, tags without a status: CATEGORY-ROOM-0001
ALTER TABLE "Category" ALTER COLUMN "assetTagCode" TYPE VARCHAR(6);
ALTER TABLE "Location" ALTER COLUMN "assetTagCode" TYPE VARCHAR(6);

-- picked by hand for the department's existing setup, editable later
UPDATE "Category" AS category
SET "assetTagCode" = readable.code
FROM (VALUES
  ('ADAPTERS', 'ADAPT'),
  ('CABLES', 'CABLE'),
  ('COMPUTERS (MAC)', 'MAC'),
  ('COMPUTERS (PC)', 'PC'),
  ('COMPUTERS (THINCLIENT)', 'THIN'),
  ('DISPLAYS (LCD)', 'LCD'),
  ('DISPLAYS (PROJECTORS)', 'PROJ'),
  ('DISPLAYS (STAND)', 'STAND'),
  ('DISPLAYS (TV)', 'TV'),
  ('ECE ANTENNA', 'ANTEN'),
  ('ECE EQUIPMENT', 'ECE'),
  ('ELECTRONICS', 'ELEC'),
  ('MICROPROCESSORS', 'MICRO'),
  ('NETWORKING', 'NET'),
  ('PERIPHERALS (MAC)', 'MACPER'),
  ('PERIPHERALS (PC)', 'PCPER'),
  ('PERIPHERALS (PRESENTER)', 'PRES'),
  ('PERIPHERALS (PRINTERS)', 'PRINT'),
  ('ROBOTICS', 'ROBOT'),
  ('ROOM EQUIPMENT', 'ROOM'),
  ('TOOLS & UTILITIES', 'TOOLS')
) AS readable(name, code)
WHERE category.name = readable.name
  AND NOT EXISTS (
    SELECT 1 FROM "Category" AS other
    WHERE other."assetTagCode" = readable.code AND other.id <> category.id
  );

-- old room codes were 2 digit numbers, swap them for a short form of the name
DO $$
DECLARE
  room RECORD;
  base TEXT;
  code TEXT;
  sequence INT;
BEGIN
  FOR room IN
    SELECT id, name FROM "Location" WHERE "assetTagCode" IS NULL OR "assetTagCode" ~ '^[0-9]{2}$'
    ORDER BY name, id
  LOOP
    base := CASE upper(room.name)
      WHEN 'MIKROTIK' THEN 'MIKRO'
      WHEN 'FACULTY' THEN 'FAC'
      ELSE left(regexp_replace(upper(room.name), '[^A-Z0-9]', '', 'g'), 5)
    END;
    IF length(base) < 2 THEN
      base := rpad(base, 2, 'X');
    END IF;
    code := base;
    sequence := 2;
    WHILE EXISTS (SELECT 1 FROM "Location" WHERE "assetTagCode" = code AND id <> room.id) LOOP
      code := left(base, 4) || sequence;
      sequence := sequence + 1;
    END LOOP;
    UPDATE "Location" SET "assetTagCode" = code WHERE id = room.id;
  END LOOP;
END $$;

-- renumber old INV-CAT-ST-ROOM-0001 tags per category and room, keeping their old order
UPDATE "InventoryItem" AS item
SET "assetTag" = renamed.tag
FROM (
  SELECT
    item.id,
    category."assetTagCode" || '-' || location."assetTagCode" || '-' || lpad(
      row_number() OVER (
        PARTITION BY item."categoryId", item."locationId"
        ORDER BY split_part(item."assetTag", '-', 5), item."createdAt", item.id
      )::text,
      4,
      '0'
    ) AS tag
  FROM "InventoryItem" AS item
  JOIN "Category" AS category ON category.id = item."categoryId"
  JOIN "Location" AS location ON location.id = item."locationId"
  WHERE item."assetTag" ~ '^INV-[A-Z0-9]{3}-[A-Z]{2}-[0-9]{2}-[0-9]{4}$'
    AND category."assetTagCode" IS NOT NULL
    AND location."assetTagCode" IS NOT NULL
) AS renamed
WHERE item.id = renamed.id;
