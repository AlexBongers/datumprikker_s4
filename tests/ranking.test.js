const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRankedSlots } = require('../src/services/ranking-service');
const { normalizeSlotInputs, validateEventInput } = require('../src/services/event-service');

test('ranking prefers strong matches with preferred responses', () => {
  const slots = [
    { id: 1, slot_datetime: '2026-05-01T09:00', slot_end_datetime: '2026-05-01T10:00' },
    { id: 2, slot_datetime: '2026-05-02T09:00', slot_end_datetime: '2026-05-02T10:00' },
  ];
  const invitees = [
    { id: 'a', role: 'student', is_required: 1 },
    { id: 'b', role: 'ondernemer', is_required: 0 },
  ];
  const rows = [
    { invitee_id: 'a', slot_id: 1, availability: 'preferred' },
    { invitee_id: 'b', slot_id: 1, availability: 'available' },
    { invitee_id: 'a', slot_id: 2, availability: 'available' },
  ];

  const ranked = buildRankedSlots(slots, invitees, rows);
  assert.equal(ranked[0].id, 1);
  assert.equal(ranked[0].isStrongMatch, true);
  assert.match(ranked[0].explanation, /voorkeur/);
});

test('normalizeSlotInputs removes empty and duplicate slots', () => {
  const slots = normalizeSlotInputs(['2026-05-01T09:00', '', '2026-05-01T09:00'], ['', '', '']);
  assert.equal(slots.length, 1);
});

test('validateEventInput requires title and at least one slot', () => {
  const { errors } = validateEventInput({ title: '', slots: '' });
  assert.equal(errors.length, 2);
});
