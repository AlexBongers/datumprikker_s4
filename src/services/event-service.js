const crypto = require('crypto');
const db = require('../db/database');
const { buildRankedSlots } = require('./ranking-service');
const { logActivity } = require('./activity-service');

function normalizeLocationMode(value) {
  return value === 'online' ? 'online' : 'onsite';
}

function normalizeSlotInputs(starts, ends) {
  const startList = Array.isArray(starts) ? starts : starts ? [starts] : [];
  const endList = Array.isArray(ends) ? ends : ends ? [ends] : [];

  const slots = startList
    .map((start, index) => ({
      slot_datetime: (start || '').trim(),
      slot_end_datetime: (endList[index] || '').trim() || null,
    }))
    .filter((slot) => slot.slot_datetime);

  const seen = new Set();
  return slots.filter((slot) => {
    const key = `${slot.slot_datetime}::${slot.slot_end_datetime || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeInviteeInputs(payload) {
  const names = Array.isArray(payload.invitee_name) ? payload.invitee_name : payload.invitee_name ? [payload.invitee_name] : [];
  const roles = Array.isArray(payload.invitee_role) ? payload.invitee_role : payload.invitee_role ? [payload.invitee_role] : [];
  const emails = Array.isArray(payload.invitee_email) ? payload.invitee_email : payload.invitee_email ? [payload.invitee_email] : [];
  const phones = Array.isArray(payload.invitee_phone) ? payload.invitee_phone : payload.invitee_phone ? [payload.invitee_phone] : [];
  const organizations = Array.isArray(payload.invitee_organization) ? payload.invitee_organization : payload.invitee_organization ? [payload.invitee_organization] : [];
  const requiredIndices = new Set(Array.isArray(payload.invitee_required) ? payload.invitee_required : payload.invitee_required ? [payload.invitee_required] : []);

  return names
    .map((name, index) => ({
      name: (name || '').trim(),
      role: (roles[index] || 'student').trim(),
      email: (emails[index] || '').trim() || null,
      phone: (phones[index] || '').trim() || null,
      organization: (organizations[index] || '').trim() || null,
      is_required: requiredIndices.has(String(index)) ? 1 : 0,
    }))
    .filter((invitee) => invitee.name && ['student', 'ondernemer'].includes(invitee.role));
}

function validateEventInput(payload) {
  const slots = normalizeSlotInputs(payload.slots, payload.slots_end);
  const errors = [];
  if (!payload.title || !payload.title.trim()) {
    errors.push('Geef het event een duidelijke titel.');
  }
  if (slots.length === 0) {
    errors.push('Voeg minimaal één datumoptie toe.');
  }
  return { errors, slots };
}

function createEvent(payload) {
  const eventId = crypto.randomUUID();
  const adminToken = crypto.randomUUID();
  const slots = normalizeSlotInputs(payload.slots, payload.slots_end);
  const invitees = normalizeInviteeInputs(payload);

  db.transaction(() => {
    db.prepare(`
      INSERT INTO events (
        id, title, description, admin_token, timezone, location_mode, location_details, response_deadline, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')
    `).run(
      eventId,
      payload.title.trim(),
      (payload.description || '').trim(),
      adminToken,
      payload.timezone || 'Europe/Amsterdam',
      normalizeLocationMode(payload.location_mode),
      (payload.location_details || '').trim() || null,
      payload.response_deadline || null
    );

    for (const slot of slots) {
      db.prepare(
        'INSERT INTO time_slots (event_id, slot_datetime, slot_end_datetime) VALUES (?, ?, ?)'
      ).run(eventId, slot.slot_datetime, slot.slot_end_datetime);
    }

    for (const invitee of invitees) {
      db.prepare(`
        INSERT INTO invitees (
          id, event_id, name, email, phone, organization, role, is_required, invite_token
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        eventId,
        invitee.name,
        invitee.email,
        invitee.phone,
        invitee.organization,
        invitee.role,
        invitee.is_required,
        crypto.randomUUID()
      );
    }

    logActivity(eventId, 'Beheerder', 'event_created', `Event aangemaakt met ${slots.length} datumopties.`);
  })();

  return { eventId, adminToken };
}

function getEventByAdminToken(eventId, token) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event || event.admin_token !== token) return null;
  return event;
}

function getEventWithDetails(eventId) {
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  if (!event) return null;

  const slots = db.prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime').all(eventId);
  const invitees = db.prepare('SELECT * FROM invitees WHERE event_id = ? ORDER BY role, name').all(eventId);
  const availabilityRows = db.prepare(`
    SELECT a.*, i.name AS invitee_name, i.role, i.organization, i.is_required
    FROM availabilities a
    JOIN invitees i ON i.id = a.invitee_id
    JOIN time_slots s ON s.id = a.slot_id
    WHERE i.event_id = ?
  `).all(eventId);
  const activities = db.prepare('SELECT * FROM activity_log WHERE event_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').all(eventId);

  const rankedSlots = buildRankedSlots(slots, invitees, availabilityRows, event.finalized_slot_id);
  const bestSlot = rankedSlots[0] || null;
  const respondedInvitees = invitees.filter((invitee) => invitee.responded_at).length;

  return {
    event,
    slots,
    invitees,
    availabilityRows,
    rankedSlots,
    bestSlot,
    activities,
    stats: {
      inviteeCount: invitees.length,
      respondedInvitees,
      pendingInvitees: Math.max(invitees.length - respondedInvitees, 0),
      slotCount: slots.length,
      strongMatches: rankedSlots.filter((slot) => slot.isStrongMatch).length,
    },
  };
}

function getDashboardData() {
  const events = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all();
  return events.map((event) => {
    const details = getEventWithDetails(event.id);
    return {
      ...event,
      invitee_count: details.stats.inviteeCount,
      responded_invitee_count: details.stats.respondedInvitees,
      slot_count: details.stats.slotCount,
      strong_match_count: details.stats.strongMatches,
      best_slot: details.bestSlot,
    };
  });
}

function updateEvent(eventId, payload) {
  const slots = normalizeSlotInputs(payload.slots, payload.slots_end);

  db.transaction(() => {
    db.prepare(`
      UPDATE events
      SET title = ?, description = ?, timezone = ?, location_mode = ?, location_details = ?, response_deadline = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.title.trim(),
      (payload.description || '').trim(),
      payload.timezone || 'Europe/Amsterdam',
      normalizeLocationMode(payload.location_mode),
      (payload.location_details || '').trim() || null,
      payload.response_deadline || null,
      eventId
    );

    const existingSlotIds = db.prepare('SELECT id FROM time_slots WHERE event_id = ?').all(eventId).map((row) => row.id);
    for (const slotId of existingSlotIds) {
      db.prepare('DELETE FROM availabilities WHERE slot_id = ?').run(slotId);
    }
    db.prepare('DELETE FROM time_slots WHERE event_id = ?').run(eventId);
    for (const slot of slots) {
      db.prepare('INSERT INTO time_slots (event_id, slot_datetime, slot_end_datetime) VALUES (?, ?, ?)').run(eventId, slot.slot_datetime, slot.slot_end_datetime);
    }

    logActivity(eventId, 'Beheerder', 'event_updated', `Eventdetails bijgewerkt, ${slots.length} datumopties actief.`);
  })();
}

function deleteEvent(eventId) {
  db.transaction(() => {
    db.prepare('DELETE FROM activity_log WHERE event_id = ?').run(eventId);
    db.prepare('DELETE FROM events WHERE id = ?').run(eventId);
  })();
}

function addInvitee(eventId, payload) {
  const invitee = {
    id: crypto.randomUUID(),
    event_id: eventId,
    name: (payload.name || '').trim(),
    email: (payload.email || '').trim() || null,
    phone: (payload.phone || '').trim() || null,
    organization: (payload.organization || '').trim() || null,
    role: payload.role,
    is_required: payload.is_required ? 1 : 0,
    invite_token: crypto.randomUUID(),
  };

  db.prepare(`
    INSERT INTO invitees (id, event_id, name, email, phone, organization, role, is_required, invite_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invitee.id,
    invitee.event_id,
    invitee.name,
    invitee.email,
    invitee.phone,
    invitee.organization,
    invitee.role,
    invitee.is_required,
    invitee.invite_token
  );

  logActivity(eventId, 'Beheerder', 'invitee_added', `${invitee.name} toegevoegd als ${invitee.role}.`);
}

function removeInvitee(eventId, inviteeId) {
  const invitee = db.prepare('SELECT * FROM invitees WHERE id = ? AND event_id = ?').get(inviteeId, eventId);
  if (!invitee) return false;
  db.prepare('DELETE FROM invitees WHERE id = ?').run(inviteeId);
  logActivity(eventId, 'Beheerder', 'invitee_removed', `${invitee.name} verwijderd uit het event.`);
  return true;
}

function markReminder(eventId) {
  db.prepare('UPDATE invitees SET reminder_sent_at = CURRENT_TIMESTAMP WHERE event_id = ? AND responded_at IS NULL').run(eventId);
  logActivity(eventId, 'Beheerder', 'reminders_marked', 'Herinnering gemarkeerd voor openstaande deelnemers.');
}

function finalizeEvent(eventId, slotId) {
  db.prepare(`
    UPDATE events
    SET finalized_slot_id = ?, status = 'finalized', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(slotId, eventId);
  logActivity(eventId, 'Beheerder', 'event_finalized', `Datumoptie ${slotId} vastgezet als definitief moment.`);
}

function setEventStatus(eventId, status) {
  db.prepare('UPDATE events SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, eventId);
  logActivity(eventId, 'Beheerder', 'status_changed', `Eventstatus gewijzigd naar ${status}.`);
}

function duplicateEvent(eventId) {
  const details = getEventWithDetails(eventId);
  if (!details) return null;
  const duplicated = createEvent({
    title: `${details.event.title} (kopie)`,
    description: details.event.description,
    timezone: details.event.timezone,
    location_mode: normalizeLocationMode(details.event.location_mode),
    location_details: details.event.location_details,
    response_deadline: details.event.response_deadline,
    slots: details.slots.map((slot) => slot.slot_datetime),
    slots_end: details.slots.map((slot) => slot.slot_end_datetime || ''),
    invitee_name: details.invitees.map((invitee) => invitee.name),
    invitee_role: details.invitees.map((invitee) => invitee.role),
    invitee_email: details.invitees.map((invitee) => invitee.email || ''),
    invitee_phone: details.invitees.map((invitee) => invitee.phone || ''),
    invitee_organization: details.invitees.map((invitee) => invitee.organization || ''),
    invitee_required: details.invitees.map((invitee, index) => invitee.is_required ? String(index) : null).filter(Boolean),
  });
  logActivity(duplicated.eventId, 'Beheerder', 'event_duplicated', `Gekopieerd vanaf event ${details.event.title}.`);
  return duplicated;
}

function getInviteeByToken(token) {
  const invitee = db.prepare('SELECT * FROM invitees WHERE invite_token = ?').get(token);
  if (!invitee) return null;
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(invitee.event_id);
  if (!event) return null;
  const slots = db.prepare('SELECT * FROM time_slots WHERE event_id = ? ORDER BY slot_datetime').all(event.id);
  const selections = db.prepare('SELECT * FROM availabilities WHERE invitee_id = ?').all(invitee.id);
  const selectionBySlotId = Object.fromEntries(selections.map((selection) => [selection.slot_id, selection]));
  const allInvitees = db.prepare('SELECT * FROM invitees WHERE event_id = ? ORDER BY role, name').all(event.id);
  const availabilityRows = db.prepare(`
    SELECT a.*, i.name AS invitee_name, i.role, i.organization
    FROM availabilities a
    JOIN invitees i ON i.id = a.invitee_id
    WHERE i.event_id = ?
  `).all(event.id);
  const rankedSlots = buildRankedSlots(slots, allInvitees, availabilityRows, event.finalized_slot_id);
  return { event, invitee, slots, selections, selectionBySlotId, rankedSlots, allInvitees };
}

function saveInviteeAvailability(inviteeId, payload) {
  const invitee = db.prepare('SELECT * FROM invitees WHERE id = ?').get(inviteeId);
  if (!invitee) return false;
  const slots = db.prepare('SELECT id FROM time_slots WHERE event_id = ?').all(invitee.event_id).map((slot) => slot.id);
  const validSlotIds = new Set(slots);

  const slotIds = Array.isArray(payload.slot_ids) ? payload.slot_ids : payload.slot_ids ? [payload.slot_ids] : [];
  const availabilityMap = {};
  for (const slotId of slotIds) {
    availabilityMap[Number(slotId)] = payload[`availability_${slotId}`] || 'unavailable';
  }

  db.transaction(() => {
    db.prepare('DELETE FROM availabilities WHERE invitee_id = ?').run(inviteeId);
    for (const slotId of slotIds.map(Number)) {
      const availability = availabilityMap[slotId];
      if (!validSlotIds.has(slotId)) continue;
      if (!['preferred', 'available', 'if_needed', 'unavailable'].includes(availability)) continue;
      db.prepare(`
        INSERT INTO availabilities (invitee_id, slot_id, availability)
        VALUES (?, ?, ?)
      `).run(inviteeId, slotId, availability);
    }
    db.prepare(`
      UPDATE invitees
      SET response_note = ?, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run((payload.response_note || '').trim() || null, inviteeId);
    logActivity(invitee.event_id, invitee.name, 'availability_updated', `${invitee.name} heeft beschikbaarheid bijgewerkt.`);
  })();

  return true;
}

module.exports = {
  addInvitee,
  createEvent,
  deleteEvent,
  duplicateEvent,
  finalizeEvent,
  getDashboardData,
  getEventByAdminToken,
  getEventWithDetails,
  getInviteeByToken,
  markReminder,
  normalizeInviteeInputs,
  normalizeLocationMode,
  normalizeSlotInputs,
  removeInvitee,
  saveInviteeAvailability,
  setEventStatus,
  updateEvent,
  validateEventInput,
};
