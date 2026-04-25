const express = require('express');
const rateLimit = require('express-rate-limit');

const {
  addInvitee,
  createEvent,
  deleteEvent,
  duplicateEvent,
  finalizeEvent,
  getDashboardData,
  getEventByAdminToken,
  getEventWithDetails,
  markReminder,
  removeInvitee,
  setEventStatus,
  updateEvent,
  validateEventInput,
} = require('../services/event-service');

const router = express.Router();

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });

if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable must be set in production.');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

function loadAdminEvent(req, res) {
  const { id } = req.params;
  const token = req.query.token || req.body.token;
  const event = getEventByAdminToken(id, token);
  if (!event) {
    return {
      error: res.status(403).render('403', { message: 'Deze beheerderslink is ongeldig of verlopen.' }),
    };
  }
  return { event, token };
}

router.get('/login', readLimiter, (req, res) => {
  if (req.session && req.session.isAdmin) return res.redirect('/admin/dashboard');
  res.render('admin/login', { error: null });
});

router.post('/login', writeLimiter, (req, res) => {
  const password = (req.body.password || '').trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';
  if (password === adminPassword) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  return res.status(401).render('admin/login', { error: 'Ongeldig wachtwoord.' });
});

router.post('/logout', writeLimiter, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/dashboard', readLimiter, requireAdmin, (req, res) => {
  const events = getDashboardData();
  const totals = events.reduce(
    (acc, event) => {
      acc.events += 1;
      acc.invitees += event.invitee_count;
      acc.responses += event.responded_invitee_count;
      acc.matches += event.strong_match_count;
      return acc;
    },
    { events: 0, invitees: 0, responses: 0, matches: 0 }
  );
  res.render('admin/dashboard', { events, totals });
});

router.get('/', readLimiter, requireAdmin, (req, res) => {
  res.render('admin/index', {
    error: null,
    values: {
      location_mode: 'onsite',
    },
  });
});

router.post('/events', writeLimiter, requireAdmin, (req, res) => {
  const { errors } = validateEventInput(req.body);
  if (errors.length > 0) {
    return res.status(400).render('admin/index', {
      error: errors.join(' '),
      values: req.body,
    });
  }

  const { eventId, adminToken } = createEvent(req.body);
  return res.redirect(`/admin/events/${eventId}?token=${adminToken}`);
});

router.get('/events/:id', readLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  const details = getEventWithDetails(loaded.event.id);
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.render('admin/event', {
    ...details,
    token: loaded.token,
    baseUrl,
  });
});

router.get('/events/:id/edit', readLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  const details = getEventWithDetails(loaded.event.id);
  res.render('admin/edit', {
    ...details,
    token: loaded.token,
    error: null,
  });
});

router.post('/events/:id/edit', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;

  const { errors } = validateEventInput(req.body);
  if (errors.length > 0) {
    const details = getEventWithDetails(loaded.event.id);
    return res.status(400).render('admin/edit', {
      ...details,
      token: loaded.token,
      error: errors.join(' '),
    });
  }

  updateEvent(loaded.event.id, req.body);
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/invitees', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;

  if (!req.body.name || !req.body.role) {
    return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}&error=participant`);
  }

  addInvitee(loaded.event.id, req.body);
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/invitees/:inviteeId/delete', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  removeInvitee(loaded.event.id, req.params.inviteeId);
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/finalize', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  finalizeEvent(loaded.event.id, Number(req.body.slot_id));
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/archive', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  setEventStatus(loaded.event.id, req.body.status === 'open' ? 'open' : 'archived');
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/remind', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  markReminder(loaded.event.id);
  return res.redirect(`/admin/events/${loaded.event.id}?token=${loaded.token}`);
});

router.post('/events/:id/duplicate', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  const duplicated = duplicateEvent(loaded.event.id);
  return res.redirect(`/admin/events/${duplicated.eventId}?token=${duplicated.adminToken}`);
});

router.post('/events/:id/delete', writeLimiter, (req, res) => {
  const loaded = loadAdminEvent(req, res);
  if (loaded.error) return loaded.error;
  deleteEvent(loaded.event.id);
  return res.redirect('/admin/dashboard');
});

module.exports = router;
