import { describe, expect, it } from 'vitest';
import { remainingSeconds, scorePercentage, validateSchedule } from './assessment';

describe('assessment presentation and scheduling', () => {
  it('displays the canonical deadline, including earlier due dates and resumed attempts', () => {
    expect(remainingSeconds('2026-10-07T01:05:00Z', Date.parse('2026-10-07T01:04:00Z'))).toBe(60);
    expect(remainingSeconds('2026-10-07T01:05:00Z', Date.parse('2026-10-07T01:06:00Z'))).toBe(0);
    expect(remainingSeconds(null)).toBeNull();
    expect(remainingSeconds('invalid')).toBeNull();
  });
  it('rejects reversed or invalid assignment windows while allowing open-ended schedules', () => {
    expect(() => validateSchedule('2026-10-08', '2026-10-07')).toThrow('Due date');
    expect(() => validateSchedule('invalid', null)).toThrow('valid');
    expect(() => validateSchedule(null, '2026-10-07')).not.toThrow();
    expect(() => validateSchedule(null, null)).not.toThrow();
  });
  it('uses point totals rather than question counts for percentages', () => {
    expect(scorePercentage(3, 4)).toBe(75);
    expect(scorePercentage(1, 3)).toBe(33.33);
    expect(scorePercentage(0, 0)).toBeNull();
  });
});
