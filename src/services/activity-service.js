const db = require('../db/database');

function logActivity(eventId, actorLabel, action, details) {
  db.prepare(
    'INSERT INTO activity_log (event_id, actor_label, action, details) VALUES (?, ?, ?, ?)'
  ).run(eventId, actorLabel, action, details || null);
}

module.exports = { logActivity };
