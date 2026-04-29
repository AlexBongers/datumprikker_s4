const WEIGHTS = {
  preferred: 4,
  available: 3,
  if_needed: 1,
  unavailable: 0,
};

function buildRankedSlots(slots, invitees, availabilityRows, finalizedSlotId = null) {
  const inviteeById = new Map(invitees.map((invitee) => [invitee.id, invitee]));
  const availabilityBySlot = new Map();

  for (const slot of slots) {
    availabilityBySlot.set(slot.id, []);
  }
  for (const row of availabilityRows) {
    if (availabilityBySlot.has(row.slot_id)) {
      availabilityBySlot.get(row.slot_id).push(row);
    }
  }

  const ranked = slots.map((slot) => {
    const rows = availabilityBySlot.get(slot.id) || [];
    const summary = {
      preferred: 0,
      available: 0,
      if_needed: 0,
      unavailable: 0,
      studentPreferred: 0,
      studentAvailable: 0,
      ondernemerPreferred: 0,
      ondernemerAvailable: 0,
      requiredCovered: 0,
      requiredMissing: 0,
      respondedCount: 0,
      invitees: [],
    };

    for (const row of rows) {
      const invitee = inviteeById.get(row.invitee_id);
      if (!invitee) continue;
      summary.respondedCount += 1;
      summary[row.availability] += 1;
      if (invitee.role === 'student') {
        if (row.availability === 'preferred') summary.studentPreferred += 1;
        if (row.availability === 'available') summary.studentAvailable += 1;
      }
      if (invitee.role === 'ondernemer') {
        if (row.availability === 'preferred') summary.ondernemerPreferred += 1;
        if (row.availability === 'available') summary.ondernemerAvailable += 1;
      }
      const contributes = row.availability === 'preferred' || row.availability === 'available' || row.availability === 'if_needed';
      if (invitee.is_required) {
        if (contributes) summary.requiredCovered += 1;
        else summary.requiredMissing += 1;
      }
      summary.invitees.push({
        invitee,
        availability: row.availability,
      });
    }

    const roleCoverage = (summary.studentPreferred + summary.studentAvailable) > 0 && (summary.ondernemerPreferred + summary.ondernemerAvailable) > 0;
    const softCoverage = roleCoverage || (summary.studentPreferred + summary.studentAvailable + summary.if_needed) > 0 && (summary.ondernemerPreferred + summary.ondernemerAvailable + summary.if_needed) > 0;

    const score =
      summary.preferred * WEIGHTS.preferred +
      summary.available * WEIGHTS.available +
      summary.if_needed * WEIGHTS.if_needed +
      summary.requiredCovered * 3 -
      summary.requiredMissing * 2 +
      (roleCoverage ? 6 : softCoverage ? 3 : 0);

    const reasons = [];
    if (summary.preferred) reasons.push(`${summary.preferred} voorkeur${summary.preferred === 1 ? '' : 'en'}`);
    if (summary.available) reasons.push(`${summary.available} beschikbaar`);
    if (summary.if_needed) reasons.push(`${summary.if_needed} als het moet`);
    if (summary.requiredCovered) reasons.push(`${summary.requiredCovered} verplichte deelnemer(s) gedekt`);
    if (roleCoverage) reasons.push('beide rollen direct vertegenwoordigd');

    return {
      ...slot,
      score,
      isFinalized: finalizedSlotId === slot.id,
      isStrongMatch: roleCoverage,
      isSoftMatch: softCoverage,
      summary,
      explanation: reasons.join(' · ') || 'Nog geen reacties',
    };
  });

  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.slot_datetime) - new Date(b.slot_datetime);
  });
}

module.exports = {
  buildRankedSlots,
  WEIGHTS,
};
