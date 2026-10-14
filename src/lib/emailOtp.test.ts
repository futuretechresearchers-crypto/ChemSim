import { describe, expect, it, vi } from 'vitest';
import { requireVerifiedOtpUser, requestRecoveryCode } from './emailOtp';
const client = (user: unknown, error: unknown = null) => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error }) } }) as unknown as Parameters<typeof requireVerifiedOtpUser>[0];
describe('OTP account verification', () => {
  it('accepts only the confirmed expected account and email', async () => {
    const user = { id: 'a', email: 'teacher@example.invalid', email_confirmed_at: '2026-10-14' };
    expect(await requireVerifiedOtpUser(client(user), 'a', ' Teacher@example.invalid ')).toEqual(user);
  });
  it.each([null, { id: 'b', email: 'a@example.invalid', email_confirmed_at: 'confirmed' },
    { id: 'a', email: 'b@example.invalid', email_confirmed_at: 'confirmed' }, { id: 'a', email: 'a@example.invalid' }])('rejects missing, switched or unconfirmed users', async user => {
    await expect(requireVerifiedOtpUser(client(user), 'a', 'a@example.invalid')).rejects.toThrow('Verification could not be confirmed');
  });
  it('rejects a failed auth lookup', async () => {
    await expect(requireVerifiedOtpUser(client(null, new Error('offline')), 'a', 'a@example.invalid')).rejects.toThrow();
  });
});

describe('recovery requests', () => {
  const fixture = (error: unknown = null) => ({ auth: { resetPasswordForEmail: vi.fn().mockResolvedValue({ error }) } }) as unknown as Parameters<typeof requestRecoveryCode>[0];
  it('uses the explicit recovery route and normalizes email', async () => {
    const c = fixture();
    await requestRecoveryCode(c, ' a@example.invalid ', 'http://127.0.0.1:5173');
    expect(c.auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.invalid', { redirectTo: 'http://127.0.0.1:5173/recover' });
  });
  it('keeps missing-account responses generic', async () => {
    await expect(requestRecoveryCode(fixture({ code: 'email_not_found' }), 'a@example.invalid', 'http://localhost')).resolves.toBeUndefined();
  });
  it('reports cooldown and delivery failure without provider details', async () => {
    await expect(requestRecoveryCode(fixture({ status: 429 }), 'a@example.invalid', 'http://localhost')).rejects.toThrow('Too many recovery requests');
    await expect(requestRecoveryCode(fixture({ status: 500, message: 'provider detail' }), 'a@example.invalid', 'http://localhost')).rejects.toThrow('Recovery email could not be requested');
  });
});
