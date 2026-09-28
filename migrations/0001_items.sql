-- Every photographed item and the listing we drafted for it.
CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  photo_key       TEXT    NOT NULL,          -- object key in the PHOTOS bucket
  brand           TEXT,
  item_name       TEXT    NOT NULL,
  category        TEXT,
  condition       TEXT,
  notes           TEXT,                      -- anything the seller typed in
  price_low       REAL,
  price_high      REAL,
  suggested_price REAL,
  price_reasoning TEXT,
  drafts_json     TEXT    NOT NULL,          -- per-platform title/description
  platform        TEXT,                      -- where it was actually listed
  listed_price    REAL,
  status          TEXT    NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'listed', 'sold', 'donated', 'kept')),
  sold_price      REAL,
  sold_at         TEXT
);

CREATE INDEX items_created_at ON items (created_at DESC);
CREATE INDEX items_status ON items (status);
