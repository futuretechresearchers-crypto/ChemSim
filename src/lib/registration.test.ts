import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  signUp: vi.fn(), replies: [] as Array<{ data: unknown; error: unknown }>,
  writes: [] as Array<{ method: string; value: Record<string, unknown> }>,
}));
vi.mock('./supabase', () => ({ supabase: {
  auth: { signUp: fake.signUp, getUser: async () => ({ data: { user: { id: 'account' } }, error: null }) },
  from() {
    const q: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'single', 'maybeSingle']) q[method] = () => q;
    for (const method of ['insert', 'update']) q[method] = (value: Record<string, unknown>) => { fake.writes.push({ method, value }); return q; };
    q.then = (resolve: (reply: unknown) => void) => resolve(fake.replies.shift());
    return q;
  },
} }));
import { saveOnboardingProfile, signUpUser } from './auth';
import { getProfileForUser } from './AuthContext';
import { destinationFor } from '../components/AuthScreen';

beforeEach(() => { fake.writes = []; fake.replies = []; fake.signUp.mockReset(); });
describe('trusted registration roles', () => {
  it('routes an approved teacher to the dashboard regardless of identity preference', () => {
    expect(destinationFor({ id: 'account', role: 'teacher', full_name: 'Fixture', identity_type: 'student', onboarding_completed: true })).toBe('/teacher');
  });
  it('blocks teacher routes for an unapproved teacher identity', () => {
    expect(destinationFor({ id: 'account', role: 'student', full_name: 'Fixture', identity_type: 'teacher', onboarding_completed: true }, '/teacher')).toBe('/student');
  });
  it('keeps ordinary students in their workspace', () => {
    expect(destinationFor({ id: 'account', role: 'student', full_name: 'Fixture', identity_type: 'student', onboarding_completed: true })).toBe('/student');
  });
  it('requires onboarding even for an approved teacher', () => {
    expect(destinationFor({ id: 'account', role: 'teacher', full_name: 'Fixture', onboarding_completed: false })).toBe('/onboarding');
  });
  it('does not forward forged signup role metadata', async () => {
    await signUpUser({ full_name: 'Fixture', email: 'fixture@example.invalid', password: 'fixture', role: 'teacher' } as Parameters<typeof signUpUser>[0]);
    expect(fake.signUp.mock.calls[0][0].options.data).toEqual({ full_name: 'Fixture' });
  });
  for (const role of ['student', 'teacher'] as const) {
    it(`preserves the authorized ${role} role during teacher-identity onboarding`, async () => {
      fake.replies = [{ data: { id: 'account', role }, error: null }, { data: null, error: null },
        { data: { id: 'account', role, identity_type: 'teacher', onboarding_completed: true }, error: null }];
      const result = await saveOnboardingProfile('account', { full_name: 'Fixture', identity_type: 'teacher', school_name: 'Fixture', role: 'teacher' } as Parameters<typeof saveOnboardingProfile>[1]);
      expect(result.role).toBe(role);
      expect(fake.writes[0].value).not.toHaveProperty('role');
    });
  }
  it('recovers a teacher-intended missing profile as student only', async () => {
    fake.replies = [{ data: null, error: null }, { data: null, error: null },
      { data: { id: 'account', role: 'student', onboarding_completed: true }, error: null }];
    await saveOnboardingProfile('account', { full_name: 'Fixture', identity_type: 'teacher', school_name: 'Fixture' });
    expect(fake.writes[0].value.role).toBe('student');
  });
  it('rejects a profile belonging to another authenticated account', async () => {
    fake.replies = [{ data: { id: 'other', role: 'teacher' }, error: null }];
    await expect(getProfileForUser('account')).rejects.toThrow('could not be loaded');
  });
});
