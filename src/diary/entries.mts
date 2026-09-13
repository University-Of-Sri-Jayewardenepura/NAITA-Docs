import { randomUUID, createHash } from 'node:crypto';

export const SECTIONS = {
  work: 'Work carried out',
  problems: 'Problems encountered',
  solutions: 'How they were solved',
  learning: 'Learning',
  improvements: 'Improvements for next week',
};
export function cleanText(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A point must contain some text.');
  const text = value
    .replace(/^\s*[-*•]\s+/, '')
    // oxlint-disable-next-line no-control-regex -- remove terminal control bytes from user notes
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) throw new Error('A point must contain some text.');
  if (text.length > 5000)
    throw new Error('Keep each point under 5,000 characters; split longer notes into several points.');
  return text;
}
export const stableId = (value) => createHash('sha256').update(value).digest('hex').slice(0, 16);
export function point(text, source = 'manual', evidence = []) {
  return { id: randomUUID(), text: cleanText(text), source, evidence };
}
export function blankWeek(week) {
  return {
    schemaVersion: 1,
    number: week.number,
    monday: week.monday,
    sunday: week.sunday,
    days: Object.fromEntries(week.days.map((day) => [day.date, []])),
    sections: Object.fromEntries(Object.keys(SECTIONS).map((key) => [key, []])),
    suggestions: [],
    dismissedSuggestions: [],
    screenshots: { captions: {}, notRequiredReason: '' },
    reviewedFingerprint: null,
  };
}
export function validateWeek(entry, expected) {
  if (
    entry.schemaVersion !== 1 ||
    entry.monday !== expected.monday ||
    entry.sunday !== expected.sunday ||
    entry.number !== expected.number
  ) {
    throw new Error(
      'Week dates/number do not match the training period. Use a separate --workspace when changing the period.',
    );
  }
  const ids = new Set();
  function checkPoints(points) {
    if (!Array.isArray(points)) throw new Error('Weekly sections and daily points must be arrays.');
    for (const value of points) {
      if (!value || typeof value.id !== 'string' || !value.id || ids.has(value.id))
        throw new Error('Every point and suggestion needs a unique id.');
      ids.add(value.id);
      cleanText(value.text);
      if (
        value.evidence !== undefined &&
        (!Array.isArray(value.evidence) || !value.evidence.every((item) => typeof item === 'string'))
      )
        throw new Error('Point evidence must be an array of commit hashes.');
    }
  }
  for (const key of Object.keys(SECTIONS)) checkPoints(entry.sections?.[key]);
  for (const day of expected.days) checkPoints(entry.days?.[day.date]);
  if (Object.keys(entry.days).some((date) => !expected.days.some((day) => day.date === date)))
    throw new Error('Daily notes contain a date outside this week.');
  checkPoints(entry.suggestions);
  for (const suggestion of entry.suggestions) {
    if (!Object.hasOwn(SECTIONS, suggestion.section) || !['draft', 'question'].includes(suggestion.kind))
      throw new Error('Invalid suggestion section or kind.');
  }
  if (!Array.isArray(entry.dismissedSuggestions) || !entry.dismissedSuggestions.every((id) => typeof id === 'string'))
    throw new Error('dismissedSuggestions must be an array of ids.');
  if (
    !entry.screenshots ||
    typeof entry.screenshots.captions !== 'object' ||
    entry.screenshots.captions === null ||
    Array.isArray(entry.screenshots.captions) ||
    !Object.values(entry.screenshots.captions).every((text) => typeof text === 'string') ||
    typeof entry.screenshots.notRequiredReason !== 'string'
  )
    throw new Error('Invalid screenshot captions or exemption reason.');
  return entry;
}
export function describeCommit(subject) {
  const text = cleanText(subject)
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^(feat|fix|docs|test|refactor|chore|style|perf|build|ci)(\([^)]*\))?!?:\s*/i, '');
  const verbs = {
    add: 'Added',
    fix: 'Fixed',
    update: 'Updated',
    implement: 'Implemented',
    remove: 'Removed',
    improve: 'Improved',
    create: 'Created',
    refactor: 'Refactored',
    test: 'Tested',
    write: 'Wrote',
    redesign: 'Redesigned',
    prevent: 'Prevented',
    support: 'Supported',
    configure: 'Configured',
    handle: 'Handled',
    use: 'Used',
  };
  const first = text.split(' ')[0].toLowerCase();
  const result = verbs[first] ? text.replace(/^\S+/, verbs[first]) : text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(result) ? result : `${result}.`;
}
export function dailyPoints(day, entry) {
  if (day.status === 'outside') return [];
  if (day.status !== 'work')
    return [{ text: { leave: 'Authorized leave.', medical: 'Medical leave.', off: 'Non-working day.' }[day.status] }];
  const manual = entry.days[day.date];
  if (manual.length) return manual;
  return [...new Map(day.commits.map((commit) => [commit.subject, { text: describeCommit(commit.subject) }])).values()];
}
export function editPoint(entry, { section, date, text, before, id, remove = false }) {
  if (Boolean(section) === Boolean(date)) throw new Error('Choose exactly one --section or --date.');
  if (section && !Object.hasOwn(SECTIONS, section))
    throw new Error(`Section must be one of: ${Object.keys(SECTIONS).join(', ')}.`);
  const points = date ? entry.days[date] : entry.sections[section];
  if (!points) throw new Error('Date is not in this week.');
  if (id && before) throw new Error('Use --id to edit or --before to insert, not both.');
  if (remove && !id) throw new Error('--remove requires --id.');
  if (id) {
    const index = points.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Point ${id} not found.`);
    if (remove) points.splice(index, 1);
    else points[index] = { ...points[index], text: cleanText(text), source: 'manual' };
    return;
  }
  const index = before ? points.findIndex((item) => item.id === before) : points.length;
  if (index < 0) throw new Error(`Point ${before} not found.`);
  points.splice(index, 0, point(text));
}
