import { afterEach, describe, expect, it, vi } from 'vitest';
import { reviewedBackendSupports } from './backendCapabilities';

afterEach(() => vi.unstubAllEnvs());
function flags() {
  vi.stubEnv('VITE_TEACHER_AUTHORIZATION', 'enabled');
  vi.stubEnv('VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT', 'enabled');
  vi.stubEnv('VITE_TEACHER_AUTHORIZATION_CONTRACT', 'teacher-authorization-v1');
  vi.stubEnv('VITE_ASSESSMENT_CONTRACT', 'phase7-assessments-v1');
}
describe('reviewed backend release boundary', () => {
  it.each(['http://127.0.0.1:55341', 'http://localhost:54321', 'http://[::1]:54321'])('preserves explicit local testing at %s', url => {
    flags(); vi.stubEnv('VITE_SUPABASE_URL', url);
    expect(reviewedBackendSupports('teacher-authorization-v1')).toBe(true);
    expect(reviewedBackendSupports('phase7-assessments-v1')).toBe(true);
  });
  it('keeps independent capabilities off without their own opt-in', () => {
    flags(); vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:55341');
    vi.stubEnv('VITE_TEACHER_AUTHORIZATION', '');
    expect(reviewedBackendSupports('teacher-authorization-v1')).toBe(false);
    expect(reviewedBackendSupports('phase7-assessments-v1')).toBe(true);
    vi.stubEnv('VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT', '');
    expect(reviewedBackendSupports('phase7-assessments-v1')).toBe(false);
  });
  it.each([
    'https://fqtofogbhimpxhywxvpw.supabase.co',
    'https://unreviewed.supabase.co',
    'https://localhost.evil.invalid',
    'https://127.0.0.1.evil.invalid',
    'https://fqtofogbhimpxhywxvpw.supabase.co@evil.invalid',
    'https://fqtofogbhimpxhywxvpw.supabase.co/?local=localhost',
    'http://fqtofogbhimpxhywxvpw.supabase.co',
    'not a URL',
  ])('does not enable any unverified hosted endpoint through flags: %s', url => {
    flags(); vi.stubEnv('VITE_SUPABASE_URL', url);
    expect(reviewedBackendSupports('teacher-authorization-v1')).toBe(false);
    expect(reviewedBackendSupports('phase7-assessments-v1')).toBe(false);
  });
});
