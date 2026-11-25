/** Rollout controls only. Database/Auth authorization remains mandatory. */
export type BackendContract = 'teacher-authorization-v1' | 'phase7-assessments-v1';

type VerifiedHostedBackend = {
  apiOrigin: string;
  appOrigins: readonly string[];
  contracts: readonly BackendContract[];
};

// Deliberately empty: no hosted backend has passed installation/security gates.
// Adding an entry is a separately reviewed release change, never an env-only opt-in.
const verifiedHostedBackends: readonly VerifiedHostedBackend[] = [];

export function reviewedBackendSupports(contract: BackendContract): boolean {
  try {
    const url = new URL(import.meta.env.VITE_SUPABASE_URL);
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return contract === 'teacher-authorization-v1'
        ? import.meta.env.VITE_TEACHER_AUTHORIZATION === 'enabled'
        : contract === 'phase7-assessments-v1'
          && import.meta.env.VITE_PHASE7_LOCAL_TRANSACTION_CONTRACT === 'enabled';
    }
    const enabled = contract === 'teacher-authorization-v1'
      ? import.meta.env.VITE_TEACHER_AUTHORIZATION === 'enabled'
        && import.meta.env.VITE_TEACHER_AUTHORIZATION_CONTRACT === contract
      : contract === 'phase7-assessments-v1'
        && import.meta.env.VITE_ASSESSMENT_CONTRACT === contract;
    if (!enabled) return false;
    if (url.protocol !== 'https:' || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return false;
    const appOrigin = typeof window === 'undefined' ? '' : window.location.origin;
    return verifiedHostedBackends.some(backend => backend.apiOrigin === url.origin
      && backend.appOrigins.includes(appOrigin) && backend.contracts.includes(contract));
  } catch { return false; }
}
