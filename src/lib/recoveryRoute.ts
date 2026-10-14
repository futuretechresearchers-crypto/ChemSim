export function isRecoveryLocation(location: Pick<Location, 'pathname' | 'search' | 'hash'>): boolean {
  return location.pathname === '/recover'
    || new URLSearchParams(location.search).get('mode') === 'recovery'
    || new URLSearchParams(location.hash.replace(/^#/, '')).get('type') === 'recovery';
}

// Run before the workspace client initializes: recovery links must not install a
// workspace session. Discard URL credentials and ask for a fresh OTP instead.
export function prepareRecoveryRoute(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isRecoveryLocation(window.location)) return false;
  const legacy = Boolean(window.location.hash || new URLSearchParams(window.location.search).has('code')
    || new URLSearchParams(window.location.search).has('token_hash'));
  window.history.replaceState({}, '', '/recover' + (legacy ? '?legacy=1' : ''));
  return true;
}
