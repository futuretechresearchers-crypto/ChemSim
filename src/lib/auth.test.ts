import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from './auth';

describe('auth helpers', () => {
  it('rejects the retired public activity route', () => {
    expect(sanitizeReturnTo('/activity/ABC123')).toBe('/');
  });

  it('blocks open redirect attempts', () => {
    expect(sanitizeReturnTo('https://evil.example')).toBe('/');
    expect(sanitizeReturnTo('//evil.example')).toBe('/');
  });
});
