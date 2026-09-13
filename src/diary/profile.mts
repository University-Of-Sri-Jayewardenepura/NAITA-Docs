import { validatePeriod } from './dates.mts';

export const PROFILE_FIELDS = {
  name: 'Student name',
  privateAddress: 'Private address',
  phone: 'Contact phone number',
  category: 'Category',
  field: 'Field / trade of training',
  instituteRegistration: 'Institute registration number',
  naitaRegistration: 'NAITA registration number',
  establishment: 'Training establishment',
  trainingLocation: 'Training location',
  trainingStart: 'Training start (YYYY-MM-DD)',
  trainingEnd: 'Training end (YYYY-MM-DD)',
};
export const REQUIRED_FIELDS = ['name', 'establishment', 'trainingStart', 'trainingEnd'];
export function validateProfile(config, { partial = false } = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Profile must be a JSON object.');
  for (const key of Object.keys(PROFILE_FIELDS)) {
    if (config[key] !== undefined && typeof config[key] !== 'string') throw new Error(`${key} must be text.`);
  }
  if (!partial)
    for (const key of REQUIRED_FIELDS) {
      if (!config[key]?.trim()) throw new Error(`${key} is required. Use profile --field ${key} --text VALUE.`);
    }
  if (config.trainingStart && config.trainingEnd) validatePeriod(config.trainingStart, config.trainingEnd);
  if (
    config.workingDays !== undefined &&
    (!Array.isArray(config.workingDays) ||
      !config.workingDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6))
  ) {
    throw new Error('workingDays must be an array of weekday numbers (Sunday 0 through Saturday 6).');
  }
  return config;
}
