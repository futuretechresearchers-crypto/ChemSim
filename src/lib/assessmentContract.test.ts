import { afterEach, describe, expect, it, vi } from 'vitest';
import { requireLocalAssessmentContract } from './assessmentContract';
afterEach(() => vi.unstubAllEnvs());
describe('unapplied transaction compatibility boundary', () => {
  it('fails closed without explicit local opt-in', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT', '');
    expect(requireLocalAssessmentContract).toThrow('local integration');
  });
  it('rejects a remote endpoint even with local opt-in', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT', 'enabled');
    expect(requireLocalAssessmentContract).toThrow('local integration');
  });
  it('permits the explicit loopback integration contract', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
    vi.stubEnv('VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT', 'enabled');
    expect(requireLocalAssessmentContract).not.toThrow();
  });
});
