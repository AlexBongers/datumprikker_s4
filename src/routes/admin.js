const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Admin home - create new event
router.get('/', readLimiter, (req, res) => {
  res.render('admin/index');
});

// Create event with time slots
router.post('/events', writeLimiter, (req, res) => {
  const { title, description, slots } = req.body;

  if (!title || !slots || slots.length === 0) {
    return res.status(400).render('admin/index', {
      error: 'Vul een titel in en selecteer minimaal één tijdslot.',
      title,
      description,
    });
  }

  const eventId = uuidv4();
  const adminToken = uuidv4();

  const insertEvent = db.prepare(
    'INSERT INTO events (id, title, description, admin_token) VALUES (?, ?, ?, ?)'
  );
  const insertSlot = db.prepare(
    'INSERT INTO time_slots (event_id, slot_datetime) VALUES (?, ?)'
  );

  const createEvent = db.transaction(() => {
    insertEvent.run(eventId, title, description || '', adminToken);
    const slotList = Array.isArray(slots) ? slots : [slots];
    for (const slot of slotList) {
      if (slot && slot.trim()) {
        insertSlot.run(eventId, slot.trim());
      }
    }
  });

  createEvent();

  res.redirect(`/admin/events/${eventId}?token=${adminToken}`);
});

// Admin event detail
router.get('/events/:id', readLimiter, (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event) return res.status(404).render('404');

  if (event.admin_token !== token) {
    return res.status(403).render('403');
  }

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

  // Build match overview: slots where both student and ondernemer have responded
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

  res.render('admin/event', { event, slots, slotResponses, token });
});

module.exports = router;
