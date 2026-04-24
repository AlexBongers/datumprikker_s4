function safeDate(value) {
  return value ? new Date(value) : null;
}

function formatDateLabel(value, locale = 'nl-NL', timeZone = 'Europe/Amsterdam') {
  const date = safeDate(value);
  if (!date || Number.isNaN(date.getTime())) return 'Onbekend moment';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(date);
}

function formatTime(value, locale = 'nl-NL', timeZone = 'Europe/Amsterdam') {
  const date = safeDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

function formatDateTimeRange(start, end, timeZone = 'Europe/Amsterdam') {
  const startLabel = formatDateLabel(start, 'nl-NL', timeZone);
  const startTime = formatTime(start, 'nl-NL', timeZone);
  const endTime = end ? formatTime(end, 'nl-NL', timeZone) : '';
  return endTime ? `${startLabel} · ${startTime} – ${endTime}` : `${startLabel} · ${startTime}`;
}

function formatRelativeState(status) {
  const labels = {
    open: 'Open voor reacties',
    finalized: 'Definitief gepland',
    archived: 'Gearchiveerd',
  };
  return labels[status] || status;
}

function formatDeadlineLabel(deadline, timeZone = 'Europe/Amsterdam') {
  if (!deadline) return 'Geen deadline ingesteld';
  return formatDateTimeRange(deadline, null, timeZone);
}

module.exports = {
  formatDateLabel,
  formatDateTimeRange,
  formatRelativeState,
  formatDeadlineLabel,
};
