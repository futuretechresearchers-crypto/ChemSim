import { describe, expect, it } from 'vitest';
import { validateReaction } from '../../engine/reactionEngine';
import { buildShellVisualModel, shellVisualState, transferPosition } from './shellPresentation';
import { studentReactionFeedback } from './reactionFeedback';

const cases: [string, string[], number, number][] = [
  ['H2', ['H','H'], 0, 1], ['O2', ['O','O'], 0, 2], ['N2', ['N','N'], 0, 3],
  ['H2O', ['H','H','O'], 0, 2], ['CO2', ['C','O','O'], 0, 4],
  ['CH4', ['C','H','H','H','H'], 0, 4], ['NH3', ['N','H','H','H'], 0, 3],
  ['HF', ['H','F'], 0, 1], ['HCl', ['H','Cl'], 0, 1],
  ['NaCl', ['Na','Cl'], 1, 0], ['MgO', ['Mg','O'], 2, 0], ['Al2O3', ['Al','Al','O','O','O'], 6, 0],
];
describe('graph-derived visual ownership', () => {
  it.each(cases)('%s conserves unique electrons at every event', (_formula, symbols, transfers, pairs) => {
    const result = validateReaction(symbols), model = buildShellVisualModel(result);
    expect(model.supported).toBe(true);
    if (!model.supported) return;
    expect(buildShellVisualModel(validateReaction(symbols))).toEqual(model);
    expect(model.transfers).toHaveLength(transfers);
    expect(model.pairs).toHaveLength(pairs);
    expect(new Set(model.plan.steps.map(e => e.id)).size).toBe(model.plan.steps.length);
    expect(new Set(model.transfers.map(t => t.electron.id)).size).toBe(transfers);
    const original = model.electrons.map(e => e.id).sort();
    expect(original.length).toBe(model.graph.nodes.reduce((n, atom) => n + atom.element.atomicNumber, 0));
    model.plan.steps.forEach((event, index) => {
      const state = shellVisualState(model, index);
      const displayed = [...state.stationary, ...state.shared.flatMap(p => p.electrons), ...(state.flying ? [state.flying.electron] : [])];
      expect(displayed.map(e => e.id).sort()).toEqual(original);
      expect(new Set(displayed.map(e => e.id)).size).toBe(original.length);
      if (event.kind === 'highlight') expect(state.stationary.some(e => e.id === state.highlightedId)).toBe(true);
      if (event.kind === 'transfer') expect(state.flying?.id).toBe(event.id);
      state.shared.forEach(pair => {
        const edge = model.graph.edges[pair.edgeIndex];
        expect(pair.electrons.map(e => e.originAtomId).sort()).toEqual([edge.sourceAtomId, edge.targetAtomId].sort());
      });
    });
    const final = shellVisualState(model, model.plan.steps.length - 1);
    expect(final.shared).toHaveLength(pairs);
    expect(final.flying).toBeUndefined();
    if (transfers) model.graph.nodes.forEach(atom => expect(final.stationary.filter(e => e.atomId === atom.id).length).toBe(atom.element.atomicNumber - atom.formalCharge));
  });
  it('rejects invalid inputs and malformed graphs without invented electrons', () => {
    for (const input of [[], ['H','O'], ['Fe','O']]) expect(buildShellVisualModel(validateReaction(input)).supported).toBe(false);
    const result = structuredClone(validateReaction(['Na','Cl']));
    result.graph!.edges[0].targetAtomId = 'missing';
    expect(buildShellVisualModel(result).supported).toBe(false);
  });
  it('moves along a clamped path from the owned donor slot to the receiver slot', () => {
    const from = {x:0,y:0}, to = {x:100,y:0};
    expect(transferPosition(from,to,-1)).toEqual(from);
    expect(transferPosition(from,to,2)).toEqual(to);
    expect(transferPosition(from,to,.5)).toEqual({x:50,y:12});
  });
});
describe('student feedback consumes solver support', () => {
  it('distinguishes empty, incomplete, and unsupported selections', () => {
    expect(studentReactionFeedback(validateReaction([]), []).feedback).toContain('Select elements');
    for (const symbols of [['H','O'], ['C','O']]) {
      const result = validateReaction(symbols), feedback = studentReactionFeedback(result,symbols);
      expect(feedback.missingAtoms).toEqual(result.missingAtoms);
      expect(validateReaction([...symbols,...feedback.missingAtoms!]).valid).toBe(true);
    }
    const symbols = ['Fe','O'];
    const feedback = studentReactionFeedback(validateReaction(symbols),symbols);
    expect(feedback.feedback).toContain('Unsupported combination');
    expect(feedback.missingAtoms).toBeUndefined();
  });
  it('preserves successful engine results unchanged', () => {
    for (const [,symbols] of cases) { const result = validateReaction(symbols); expect(studentReactionFeedback(result,symbols)).toBe(result); }
  });
});
