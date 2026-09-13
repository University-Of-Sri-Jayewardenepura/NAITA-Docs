import { describe, expect, it } from 'vitest';
import { calendar, parseDateList, validDate, validatePeriod } from '../../src/diary/dates.mts';
import { updateAbsence } from '../../src/diary/attendance.mts';
import { PROFILE } from '../helpers/fixtures.mts';

describe('calendar dates and attendance', () => {
  it.each(['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', 'x', '2026-1-1'])(
    'rejects invalid date %s',
    (date) => {
      expect(validDate(date)).toBe(false);
      expect(() => parseDateList(date)).toThrow();
    },
  );
  it('accepts leap days and inclusive ranges across month/year boundaries', () => {
    expect(validDate('2024-02-29')).toBe(true);
    expect([...parseDateList('2025-12-31..2026-01-02, 2026-01-01')]).toEqual([
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(parseDateList('')).toEqual(new Set());
    expect(() => parseDateList('2026-04-07..2026-04-06')).toThrow();
    expect(() => parseDateList('2026-04-06..2026-04-07..2026-04-08')).toThrow();
    expect(() => validatePeriod('2026-01-01', '9999-01-01')).toThrow();
  });
  it('builds partial Monday-Sunday weeks and gives absence precedence over evidence', () => {
    const weeks = calendar(
      { ...PROFILE, trainingStart: '2026-04-08', trainingEnd: '2026-04-14' },
      [
        { date: '2026-04-09', subject: 'fix issue' },
        { date: '2026-04-11', subject: 'add task' },
      ],
      { leave: ['2026-04-09'], medical: ['2026-04-10'], off: ['2026-04-13'] },
    );
    expect(weeks.map((week) => [week.monday, week.sunday])).toEqual([
      ['2026-04-06', '2026-04-12'],
      ['2026-04-13', '2026-04-19'],
    ]);
    expect(weeks[0].days.map((day) => day.status)).toEqual([
      'outside',
      'outside',
      'work',
      'leave',
      'medical',
      'work',
      'off',
    ]);
    expect(weeks[1].days.map((day) => day.status)).toEqual([
      'off',
      'work',
      'outside',
      'outside',
      'outside',
      'outside',
      'outside',
    ]);
  });
  it('rejects overlapping or out-of-period absences without changing saved state', () => {
    const state = { absence: { leave: ['2026-04-10'], medical: null, off: [] } };
    expect(() => updateAbsence(state, PROFILE, { medical: '2026-04-10' })).toThrow(/more than once/);
    expect(() => updateAbsence(state, PROFILE, { leave: '2026-05-01' })).toThrow(/training period/);
    expect(state.absence.medical).toBeNull();
    expect(updateAbsence(state, PROFILE, { leave: '', medical: '' }).absence).toEqual({
      leave: [],
      medical: [],
      off: [],
    });
  });
});
