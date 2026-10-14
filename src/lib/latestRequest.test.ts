import { describe, expect, it } from 'vitest';
import { createLatestRequest } from './latestRequest';

describe('profile request ordering', () => {
  it('ignores a delayed refresh after switching accounts', async () => {
    const requests = createLatestRequest();
    let resolve!: (profile: string) => void;
    const delayed = new Promise<string>(done => { resolve = done; });
    const old = requests.begin();
    let visible = 'student-B';
    const completion = delayed.then(profile => { if (requests.isCurrent(old)) visible = profile; });
    const current = requests.begin();
    resolve('teacher-A');
    await completion;
    expect(visible).toBe('student-B');
    expect(requests.isCurrent(current)).toBe(true);
  });
  it('invalidates in-flight work on sign-out or unmount', () => {
    const requests = createLatestRequest();
    const pending = requests.begin();
    requests.invalidate();
    expect(requests.isCurrent(pending)).toBe(false);
  });
});
