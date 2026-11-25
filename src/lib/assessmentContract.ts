import { reviewedBackendSupports } from './backendCapabilities';

/** Prepared RPCs must never be called on an unverified hosted database. */
export function requireLocalAssessmentContract(): void {
  if (!reviewedBackendSupports('phase7-assessments-v1')) {
    throw new Error('Transactional assessment saving requires the reviewed local integration environment.');
  }
}
