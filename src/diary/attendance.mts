import { parseDateList, validDate } from './dates.mts';

export function validateAbsence(absence, config) {
  const seen = new Set();
  for (const key of ['leave', 'medical', 'off']) {
    if (absence[key] === null && key !== 'off') continue;
    if (!Array.isArray(absence[key])) throw new Error(`${key} must be a date array.`);
    for (const date of absence[key]) {
      if (!validDate(date) || date < config.trainingStart || date > config.trainingEnd)
        throw new Error(`${date} is not a date in the training period.`);
      if (seen.has(date)) throw new Error(`${date} is listed more than once in the absence calendar.`);
      seen.add(date);
    }
  }
}
export function updateAbsence(state, config, options) {
  const absence = structuredClone(state.absence);
  for (const key of ['leave', 'medical', 'off']) {
    if (options[key] !== undefined) absence[key] = [...parseDateList(options[key])].sort();
  }
  validateAbsence(absence, config);
  return { ...state, absence };
}
