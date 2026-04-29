const express = require('express');
const rateLimit = require('express-rate-limit');

const { getEventByAdminToken, getEventWithDetails, getInviteeByToken, saveInviteeAvailability } = require('../services/event-service');

const router = express.Router();
const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

function buildIcs(event, slot) {
  const escape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const formatUtc = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Datumprikker//Matchmaker//NL',
    'BEGIN:VEVENT',
    `UID:${event.id}@datumprikker`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(slot.slot_datetime)}`,
    slot.slot_end_datetime ? `DTEND:${formatUtc(slot.slot_end_datetime)}` : '',
    `SUMMARY:${escape(event.title)}`,
    `DESCRIPTION:${escape(event.description || 'Definitief ingeplande afspraak via Datumprikker.')}`,
    `LOCATION:${escape(event.location_details || '')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

router.get('/respond/:token', readLimiter, (req, res) => {
  const details = getInviteeByToken(req.params.token);
  if (!details) return res.status(404).render('404');
  res.render('events/show', {
    ...details,
    success: req.query.success === '1',
  });
});

router.post('/respond/:token', writeLimiter, (req, res) => {
  const details = getInviteeByToken(req.params.token);
  if (!details) return res.status(404).render('404');

  const slotIds = details.slots.map((slot) => String(slot.id));
  const payload = {
    slot_ids: slotIds,
    response_note: req.body.response_note,
  };
  for (const slotId of slotIds) {
    payload[`availability_${slotId}`] = req.body[`availability_${slotId}`] || 'unavailable';
  }

  saveInviteeAvailability(details.invitee.id, payload);
  return res.redirect(`/events/respond/${req.params.token}?success=1`);
});

router.get('/:id/export', readLimiter, (req, res) => {
  const token = req.query.token;
  const event = getEventByAdminToken(req.params.id, token);
  if (!event) return res.status(403).render('403', { message: 'De exportlink is ongeldig.' });
  const details = getEventWithDetails(req.params.id);
  const finalizedSlot = details.rankedSlots.find((slot) => slot.id === event.finalized_slot_id);
  if (!finalizedSlot) {
    return res.status(400).render('403', { message: 'Er is nog geen definitief moment gekozen.' });
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}-definitief.ics"`);
  return res.send(buildIcs(event, finalizedSlot));
});

router.get('/:id', readLimiter, (req, res) => {
  const details = getEventWithDetails(req.params.id);
  if (!details) return res.status(404).render('404');
  res.render('events/public-summary', details);
});

module.exports = router;
