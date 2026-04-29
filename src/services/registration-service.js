const crypto = require('crypto');
const db = require('../db/database');

function normalizeSlotInputs(starts, ends) {
  const startList = Array.isArray(starts) ? starts : starts ? [starts] : [];
  const endList = Array.isArray(ends) ? ends : ends ? [ends] : [];
  return startList
    .map((start, index) => ({
      start: (start || '').trim(),
      end: (endList[index] || '').trim() || null,
    }))
    .filter((slot) => slot.start);
}

function validateRegistration(payload, role) {
  const errors = [];
  if (!payload.name || !payload.name.trim()) errors.push('Vul je naam in.');
  if (role === 'ondernemer' && (!payload.organization || !payload.organization.trim())) {
    errors.push('Vul de naam van je organisatie in.');
  }
  const slots = normalizeSlotInputs(payload.slots, payload.slots_end);
  if (slots.length === 0) errors.push('Voeg minimaal één voorkeursdatum toe.');
  return { errors, slots };
}

function createRegistration(payload, role) {
  const { slots } = validateRegistration(payload, role);
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO self_registrations (id, role, name, email, phone, organization, notes, preferred_slots, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    id,
    role,
    payload.name.trim(),
    (payload.email || '').trim() || null,
    (payload.phone || '').trim() || null,
    (payload.organization || '').trim() || null,
    (payload.notes || '').trim() || null,
    JSON.stringify(slots)
  );
  return id;
}

function getAllRegistrations() {
  return db.prepare(`
    SELECT * FROM self_registrations ORDER BY created_at DESC
  `).all();
}

function getRegistrationById(id) {
  return db.prepare('SELECT * FROM self_registrations WHERE id = ?').get(id);
}

function setRegistrationStatus(id, status) {
  db.prepare('UPDATE self_registrations SET status = ? WHERE id = ?').run(status, id);
}

function deleteRegistration(id) {
  db.prepare('DELETE FROM self_registrations WHERE id = ?').run(id);
}

module.exports = {
  validateRegistration,
  createRegistration,
  getAllRegistrations,
  getRegistrationById,
  setRegistrationStatus,
  deleteRegistration,
};
