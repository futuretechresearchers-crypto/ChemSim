import { validateReaction } from '../../engine/reactionEngine';
import type { ReactionResult } from '../../types/chemistry';

/** Verify an engine suggestion before offering it to the learner; no new chemistry rules. */
export function studentReactionFeedback(result: ReactionResult, symbols: string[]): ReactionResult {
  if (result.valid) return result;
  if (!symbols.length) return { ...result, feedback: 'Select elements before starting the simulation.' };
  if (result.missingAtoms?.length) {
    const completed = validateReaction([...symbols, ...result.missingAtoms]);
    if (completed.valid) return result;
    return { ...result, missingAtoms: undefined, feedback: 'Unsupported combination. This selection is outside the chemistry currently supported by CHEMLAB.' };
  }
  return result;
}
