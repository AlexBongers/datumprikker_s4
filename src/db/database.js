const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(__dirname, '../../data/datumprikker.db');

const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    admin_token TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    slot_datetime TEXT NOT NULL,
    slot_end_datetime TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    responder_name TEXT NOT NULL,
    responder_type TEXT NOT NULL CHECK(responder_type IN ('student', 'ondernemer')),
    time_slot_id INTEGER NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id),
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id),
    UNIQUE(event_id, responder_name, responder_type, time_slot_id)
  );
`);

// Migrate: add slot_end_datetime column to existing databases that predate it
try {
  db.exec('ALTER TABLE time_slots ADD COLUMN slot_end_datetime TEXT');
} catch (_) {
  // Column already exists — safe to ignore
}

module.exports = db;
