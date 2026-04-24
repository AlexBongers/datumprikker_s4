const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/datumprikker.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    admin_token TEXT NOT NULL,
    timezone TEXT DEFAULT 'Europe/Amsterdam',
    location_mode TEXT DEFAULT 'hybrid' CHECK(location_mode IN ('online', 'onsite', 'hybrid')),
    location_details TEXT,
    response_deadline TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'finalized', 'archived')),
    finalized_slot_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    slot_datetime TEXT NOT NULL,
    slot_end_datetime TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    responder_name TEXT NOT NULL,
    responder_type TEXT NOT NULL CHECK(responder_type IN ('student', 'ondernemer')),
    time_slot_id INTEGER NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    location_preference TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    UNIQUE(event_id, responder_name, responder_type, time_slot_id)
  );

  CREATE TABLE IF NOT EXISTS invitees (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    organization TEXT,
    role TEXT NOT NULL CHECK(role IN ('student', 'ondernemer')),
    is_required INTEGER DEFAULT 0,
    invite_token TEXT NOT NULL UNIQUE,
    response_note TEXT,
    responded_at TEXT,
    reminder_sent_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS availabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invitee_id TEXT NOT NULL,
    slot_id INTEGER NOT NULL,
    availability TEXT NOT NULL CHECK(availability IN ('preferred', 'available', 'if_needed', 'unavailable')),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(invitee_id, slot_id),
    FOREIGN KEY (invitee_id) REFERENCES invitees(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_id) REFERENCES time_slots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL,
    actor_label TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );
`);

const eventMigrations = [
  "ALTER TABLE events ADD COLUMN timezone TEXT DEFAULT 'Europe/Amsterdam'",
  "ALTER TABLE events ADD COLUMN location_mode TEXT DEFAULT 'hybrid'",
  'ALTER TABLE events ADD COLUMN location_details TEXT',
  'ALTER TABLE events ADD COLUMN response_deadline TEXT',
  "ALTER TABLE events ADD COLUMN status TEXT DEFAULT 'open'",
  'ALTER TABLE events ADD COLUMN finalized_slot_id INTEGER',
  'ALTER TABLE events ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
];
for (const sql of eventMigrations) {
  try { db.exec(sql); } catch (_) {}
}

const responseMigrations = [
  'ALTER TABLE time_slots ADD COLUMN slot_end_datetime TEXT',
  'ALTER TABLE responses ADD COLUMN contact_name TEXT',
  'ALTER TABLE responses ADD COLUMN contact_email TEXT',
  'ALTER TABLE responses ADD COLUMN contact_phone TEXT',
  'ALTER TABLE responses ADD COLUMN location_preference TEXT',
];
for (const sql of responseMigrations) {
  try { db.exec(sql); } catch (_) {}
}

const legacyInvitees = db.prepare(`
  SELECT DISTINCT r.event_id, r.responder_name, r.responder_type,
         r.contact_email, r.contact_phone, r.contact_name, r.location_preference
  FROM responses r
  WHERE NOT EXISTS (
    SELECT 1 FROM invitees i
    WHERE i.event_id = r.event_id
      AND i.name = r.responder_name
      AND i.role = r.responder_type
  )
`).all();

const insertInvitee = db.prepare(`
  INSERT INTO invitees (
    id, event_id, name, email, phone, organization, role, is_required, invite_token, responded_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
`);
const insertAvailability = db.prepare(`
  INSERT OR IGNORE INTO availabilities (invitee_id, slot_id, availability)
  VALUES (?, ?, 'available')
`);

for (const legacyInvitee of legacyInvitees) {
  const inviteeId = crypto.randomUUID();
  const inviteToken = crypto.randomUUID();
  insertInvitee.run(
    inviteeId,
    legacyInvitee.event_id,
    legacyInvitee.responder_name,
    legacyInvitee.contact_email || null,
    legacyInvitee.contact_phone || null,
    legacyInvitee.responder_type === 'ondernemer' ? legacyInvitee.contact_name || legacyInvitee.responder_name : null,
    legacyInvitee.responder_type,
    inviteToken
  );

  const slots = db.prepare(`
    SELECT time_slot_id FROM responses
    WHERE event_id = ? AND responder_name = ? AND responder_type = ?
  `).all(legacyInvitee.event_id, legacyInvitee.responder_name, legacyInvitee.responder_type);

  for (const slot of slots) {
    insertAvailability.run(inviteeId, slot.time_slot_id);
  }
}

module.exports = db;
