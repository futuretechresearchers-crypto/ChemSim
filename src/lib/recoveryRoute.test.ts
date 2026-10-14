import { describe, expect, it } from 'vitest';
import { isRecoveryLocation } from './recoveryRoute';

describe('recovery routing intent', () => {
  it.each([
    { pathname: '/recover', search: '', hash: '' },
    { pathname: '/login', search: '?mode=recovery', hash: '' },
    { pathname: '/', search: '', hash: '#access_token=fixture&type=recovery' },
  ])('recognizes recovery independently of workspace role/session', location => {
    expect(isRecoveryLocation(location)).toBe(true);
  });
  it.each(['/student', '/teacher', '/login', '/'])('leaves normal routes unchanged', pathname => {
    expect(isRecoveryLocation({ pathname, search: '', hash: '' })).toBe(false);
  });
});
