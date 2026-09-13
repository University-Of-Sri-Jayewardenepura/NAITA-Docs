export const isoDate = (date) => date.toISOString().slice(0, 10);
export const utcDate = (value) => new Date(`${value}T00:00:00Z`);
export function validDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(utcDate(value).valueOf()) &&
    isoDate(utcDate(value)) === value
  );
}
export function addDays(value, count) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date;
}
export function validatePeriod(start, end) {
  if (!validDate(start) || !validDate(end)) throw new Error('Training dates must be real dates in YYYY-MM-DD format.');
  if (start > end) throw new Error('Training start must be on or before training end.');
  if ((utcDate(end) - utcDate(start)) / 86400000 > 3660) throw new Error('Training period cannot exceed ten years.');
}
export function parseDateList(value = '') {
  const dates = new Set();
  for (const entry of value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const parts = entry.split('..').map((part) => part.trim());
    const [start, end = start] = parts;
    if (parts.length > 2 || !validDate(start) || !validDate(end) || start > end) {
      throw new Error(`Invalid date or range: ${entry}. Use YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD.`);
    }
    validatePeriod(start, end);
    for (let date = utcDate(start); isoDate(date) <= end; date = addDays(date, 1)) dates.add(isoDate(date));
  }
  return dates;
}
export const displayDate = (date) => date.split('-').reverse().join('/');

export function calendar(config, commits = [], absence = {}) {
  validatePeriod(config.trainingStart, config.trainingEnd);
  const byDate = new Map();
  for (const commit of commits) {
    if (!byDate.has(commit.date)) byDate.set(commit.date, []);
    byDate.get(commit.date).push(commit);
  }
  const leave = new Set(absence.leave || []);
  const medical = new Set(absence.medical || []);
  const off = new Set(absence.off || []);
  const start = utcDate(config.trainingStart);
  const firstMonday = addDays(start, -((start.getUTCDay() + 6) % 7));
  const weeks = [];
  for (let monday = firstMonday; isoDate(monday) <= config.trainingEnd; monday = addDays(monday, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = isoDate(addDays(monday, index));
      const dayCommits = byDate.get(date) || [];
      const inPeriod = date >= config.trainingStart && date <= config.trainingEnd;
      const scheduled = (config.workingDays || [1, 2, 3, 4, 5]).includes((index + 1) % 7);
      const status = !inPeriod
        ? 'outside'
        : leave.has(date)
          ? 'leave'
          : medical.has(date)
            ? 'medical'
            : off.has(date) || (!scheduled && !dayCommits.length)
              ? 'off'
              : 'work';
      return { date, inPeriod, status, commits: dayCommits };
    });
    weeks.push({ number: weeks.length + 1, monday: isoDate(monday), sunday: isoDate(addDays(monday, 6)), days });
  }
  return weeks;
}
