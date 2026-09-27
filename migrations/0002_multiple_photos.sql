-- Items can have several photos (e.g. front, back, tag). photo_key stays as
-- the cover photo; photo_keys holds all of them, in order, as a JSON array.
ALTER TABLE items ADD COLUMN photo_keys TEXT;
UPDATE items SET photo_keys = json_array(photo_key) WHERE photo_keys IS NULL;
