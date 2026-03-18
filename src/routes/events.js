const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../db/database');

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// View event and submit availability
router.get('/:id', readLimiter, (req, res) => {
  const { id } = req.params;
  const { type } = req.query;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) return res.status(404).render('404');

  const validTypes = ['student', 'ondernemer'];
  const responderType = validTypes.includes(type) ? type : null;

  const slots = db
    .prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime')
    .all(id);

  const responses = db
    .prepare(
      `SELECT r.responder_name, r.responder_type, r.time_slot_id
       FROM responses r
       WHERE r.event_id = ?`
    )
    .all(id);

  // Aggregate responses per slot
  const slotResponses = {};
  for (const slot of slots) {
    slotResponses[slot.id] = { students: [], ondernemers: [] };
  }
  for (const resp of responses) {
    if (slotResponses[resp.time_slot_id]) {
      if (resp.responder_type === 'student') {
        slotResponses[resp.time_slot_id].students.push(resp.responder_name);
      } else {
        slotResponses[resp.time_slot_id].ondernemers.push(resp.responder_name);
      }
    }
  }

  const success = req.query.success === '1';
  const error = req.query.error || null;

  res.render('events/show', { event, slots, slotResponses, responderType, success, error });
});

// Submit availability
router.post('/:id/respond', writeLimiter, (req, res) => {
  const { id } = req.params;
  const { name, type, slots, contact_name, contact_email, contact_phone, location_preference } = req.body;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) return res.status(404).render('404');

  const validTypes = ['student', 'ondernemer'];
  if (!name || !name.trim() || !validTypes.includes(type)) {
    return res.redirect(`/events/${id}?type=${type}&error=Vul+je+naam+in`);
  }

  const allSlots = db
    .prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime')
    .all(id);

  const selectedSlotIds = Array.isArray(slots) ? slots.map(Number) : slots ? [Number(slots)] : [];

  // Validate that the slot IDs belong to this event
  const validSlotIds = new Set(allSlots.map((s) => s.id));

  const deleteOld = db.prepare(
    'DELETE FROM responses WHERE event_id = ? AND responder_name = ? AND responder_type = ?'
  );
  const insertResponse = db.prepare(
    `INSERT OR IGNORE INTO responses
       (event_id, responder_name, responder_type, time_slot_id, contact_name, contact_email, contact_phone, location_preference)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // Contact fields are only relevant for ondernemers
  const cleanContactName = type === 'ondernemer' ? (contact_name || '').trim() || null : null;
  const cleanEmail = type === 'ondernemer' ? (contact_email || '').trim() || null : null;
  const cleanPhone = type === 'ondernemer' ? (contact_phone || '').trim() || null : null;
  const cleanLocation = type === 'ondernemer' ? (location_preference || '').trim() || null : null;

  const submitResponse = db.transaction(() => {
    deleteOld.run(id, name.trim(), type);
    for (const slotId of selectedSlotIds) {
      if (validSlotIds.has(slotId)) {
        insertResponse.run(id, name.trim(), type, slotId, cleanContactName, cleanEmail, cleanPhone, cleanLocation);
      }
    }
  });

  submitResponse();

  res.redirect(`/events/${id}?type=${type}&success=1`);
});

module.exports = router;
