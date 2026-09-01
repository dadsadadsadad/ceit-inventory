WITH available_codes AS (
  SELECT lpad(candidate::text, 2, '0') AS code, row_number() OVER (ORDER BY candidate) AS sequence
  FROM generate_series(1, 99) AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM "Location"
    WHERE "assetTagCode" = lpad(candidate::text, 2, '0')
  )
), unassigned_locations AS (
  SELECT id, row_number() OVER (ORDER BY name, id) AS sequence
  FROM "Location"
  WHERE "assetTagCode" IS NULL
)
UPDATE "Location" AS location
SET "assetTagCode" = available_codes.code
FROM unassigned_locations
JOIN available_codes ON available_codes.sequence = unassigned_locations.sequence
WHERE location.id = unassigned_locations.id;
