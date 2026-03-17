const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Require ADMIN_PASSWORD to be explicitly set in production
if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable must be set in production.');
}

// Middleware: require admin session
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.redirect('/admin/login');
}

// Helper: verify token matches event; returns event or null
function getEventByToken(id, token) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!event || event.admin_token !== token) return null;
  return event;
}

// Dashboard login page
router.get('/login', readLimiter, (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { error: null });
});

// Handle login
router.post('/login', writeLimiter, (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  if (password === adminPassword) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.status(401).render('admin/login', { error: 'Ongeldig wachtwoord.' });
});

// Handle logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Dashboard – overview of all events
router.get('/dashboard', readLimiter, requireAdmin, (req, res) => {
  const events = db
    .prepare(
      `SELECT e.*,
              COUNT(DISTINCT ts.id)  AS slot_count,
              COUNT(DISTINCT r.id)   AS response_count
       FROM events e
       LEFT JOIN time_slots ts ON ts.event_id = e.id
       LEFT JOIN responses r  ON r.event_id  = e.id
       GROUP BY e.id
       ORDER BY e.created_at DESC`
    )
    .all();

  // Per-event match count: slots with at least one student AND one ondernemer response
  const matchRows = db
    .prepare(
      `SELECT ts.event_id, COUNT(DISTINCT ts.id) AS match_count
       FROM time_slots ts
       WHERE EXISTS (
         SELECT 1 FROM responses r
         WHERE r.time_slot_id = ts.id AND r.responder_type = 'student'
       )
       AND EXISTS (
         SELECT 1 FROM responses r
         WHERE r.time_slot_id = ts.id AND r.responder_type = 'ondernemer'
       )
       GROUP BY ts.event_id`
    )
    .all();

  const matchByEvent = {};
  for (const row of matchRows) matchByEvent[row.event_id] = row.match_count;

  const eventsWithStats = events.map((e) => ({
    ...e,
    match_count: matchByEvent[e.id] || 0,
  }));

  const totalMatches = Object.values(matchByEvent).reduce((a, b) => a + b, 0);

  res.render('admin/dashboard', { events: eventsWithStats, totalMatches });
});

// Admin home - create new event
router.get('/', readLimiter, (req, res) => {
  res.render('admin/index');
});

// Create event with time slots
router.post('/events', writeLimiter, (req, res) => {
  const { title, description, slots, slots_end } = req.body;

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
    'INSERT INTO time_slots (event_id, slot_datetime, slot_end_datetime) VALUES (?, ?, ?)'
  );

  const slotList = Array.isArray(slots) ? slots : [slots];
  const slotEndList = Array.isArray(slots_end) ? slots_end : (slots_end ? [slots_end] : []);

  const createEvent = db.transaction(() => {
    insertEvent.run(eventId, title, description || '', adminToken);
    for (let i = 0; i < slotList.length; i++) {
      const start = slotList[i]?.trim();
      const end = (slotEndList[i] || '').trim() || null;
      if (start) insertSlot.run(eventId, start, end);
    }
  });

  createEvent();

  res.redirect(`/admin/events/${eventId}?token=${adminToken}`);
});

// Admin event detail
router.get('/events/:id', readLimiter, (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  const event = getEventByToken(id, token);
  if (!event) {
    const exists = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    return exists ? res.status(403).render('403') : res.status(404).render('404');
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

  const baseUrl =
    process.env.BASE_URL ||
    `${req.protocol}://${req.get('host')}`;

  res.render('admin/event', { event, slots, slotResponses, token, baseUrl });
});

// Edit event form
router.get('/events/:id/edit', readLimiter, (req, res) => {
  const { id } = req.params;
  const { token } = req.query;

  const event = getEventByToken(id, token);
  if (!event) {
    const exists = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    return exists ? res.status(403).render('403') : res.status(404).render('404');
  }

  const slots = db
    .prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime')
    .all(id);

  res.render('admin/edit', { event, slots, token });
});

// Update event
router.post('/events/:id/edit', writeLimiter, (req, res) => {
  const { id } = req.params;
  const { token, title, description, slots, slots_end } = req.body;

  const event = getEventByToken(id, token);
  if (!event) {
    const exists = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    return exists ? res.status(403).render('403') : res.status(404).render('404');
  }

  const slotList = Array.isArray(slots) ? slots : (slots ? [slots] : []);
  const slotEndList = Array.isArray(slots_end) ? slots_end : (slots_end ? [slots_end] : []);

  if (!title || slotList.length === 0) {
    const existingSlots = db
      .prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime')
      .all(id);
    return res.status(400).render('admin/edit', {
      event,
      slots: existingSlots,
      token,
      error: 'Vul een titel in en selecteer minimaal één tijdslot.',
    });
  }

  const updateEvent = db.prepare(
    'UPDATE events SET title = ?, description = ? WHERE id = ?'
  );
  const deleteSlots = db.prepare('DELETE FROM time_slots WHERE event_id = ?');
  const insertSlot = db.prepare(
    'INSERT INTO time_slots (event_id, slot_datetime, slot_end_datetime) VALUES (?, ?, ?)'
  );

  db.transaction(() => {
    updateEvent.run(title, description || '', id);
    deleteSlots.run(id);
    for (let i = 0; i < slotList.length; i++) {
      const start = slotList[i]?.trim();
      const end = (slotEndList[i] || '').trim() || null;
      if (start) insertSlot.run(id, start, end);
    }
  })();

  res.redirect(`/admin/events/${id}?token=${token}`);
});

// Delete event
router.post('/events/:id/delete', writeLimiter, (req, res) => {
  const { id } = req.params;
  const { token } = req.body;

  const event = getEventByToken(id, token);
  if (!event) {
    const exists = db.prepare('SELECT id FROM events WHERE id = ?').get(id);
    return exists ? res.status(403).render('403') : res.status(404).render('404');
  }

  db.transaction(() => {
    db.prepare('DELETE FROM responses WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM time_slots WHERE event_id = ?').run(id);
    db.prepare('DELETE FROM events WHERE id = ?').run(id);
  })();

  res.redirect('/admin/dashboard');
});

module.exports = router;
