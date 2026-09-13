CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY,
 device TEXT NOT NULL,
 day TEXT NOT NULL,
 created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS requests_day ON requests(day);
CREATE INDEX IF NOT EXISTS requests_device_day ON requests(device, day);
CREATE INDEX IF NOT EXISTS requests_created ON requests(created);

