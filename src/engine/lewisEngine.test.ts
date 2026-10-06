import { describe, expect, it } from 'vitest';
import { buildLewisStructure } from './lewisEngine';
import { validateReaction } from './reactionEngine';

const cases = [
  { formula: 'H2', atoms: ['H', 'H'], lonePairs: 0, bonds: [1] },
  { formula: 'O2', atoms: ['O', 'O'], lonePairs: 4, bonds: [2] },
  { formula: 'N2', atoms: ['N', 'N'], lonePairs: 2, bonds: [3] },
  { formula: 'HF', atoms: ['H', 'F'], lonePairs: 3, bonds: [1] },
  { formula: 'HCl', atoms: ['H', 'Cl'], lonePairs: 3, bonds: [1] },
  { formula: 'H2O', atoms: ['H', 'H', 'O'], lonePairs: 2, bonds: [1, 1] },
  { formula: 'NH3', atoms: ['N', 'H', 'H', 'H'], lonePairs: 1, bonds: [1, 1, 1] },
  { formula: 'CH4', atoms: ['C', 'H', 'H', 'H', 'H'], lonePairs: 0, bonds: [1, 1, 1, 1] },
  { formula: 'CO2', atoms: ['C', 'O', 'O'], lonePairs: 4, bonds: [2, 2] },
] as const;

function derive(atoms: readonly string[]) {
  return buildLewisStructure(validateReaction([...atoms]));
}

describe('graph-derived Lewis structures', () => {
  it.each(cases)('$formula has graph bond orders and the expected lone-pair count', ({ atoms, formula, lonePairs, bonds }) => {
    const result = derive(atoms);
    expect(result.supported).toBe(true);
    if (!result.supported) return;
    const { structure } = result;
    expect(structure.formula).toBe(formula);
    expect(structure.bonds.map(bond => bond.bondOrder)).toEqual(bonds);
    expect(structure.atoms.reduce((sum, atom) => sum + atom.lonePairCount, 0)).toBe(lonePairs);
    expect(structure.atoms.reduce((sum, atom) => sum + atom.nonbondingElectrons, 0)).toBe(lonePairs * 2);
    expect(structure.usedBondElectrons + structure.remainingLonePairElectrons).toBe(structure.totalValenceElectrons);
  });

  it('keeps ionic transfers, charges, and lone pairs distinct from covalent sharing', () => {
    for (const [atoms, charges, transfers, lonePairs] of [
      [['Na', 'Cl'], [1, -1], 1, 4],
      [['Mg', 'O'], [2, -2], 2, 4],
      [['Al', 'Al', 'O', 'O', 'O'], [3, 3, -2, -2, -2], 6, 12],
    ] as const) {
      const result = derive(atoms);
      expect(result.supported).toBe(true);
      if (!result.supported) continue;
      expect(result.structure.bondModel).toBe('ionic');
      expect(result.structure.atoms.map(atom => atom.formalCharge)).toEqual(charges);
      expect(result.structure.bonds.reduce((sum, bond) => sum + bond.transferredElectronCount, 0)).toBe(transfers);
      expect(result.structure.bonds.every(bond => bond.bondOrder === 0 && bond.sharedElectronCount === 0)).toBe(true);
      expect(result.structure.atoms.reduce((sum, atom) => sum + atom.lonePairCount, 0)).toBe(lonePairs);
    }
  });

  it('returns structured unsupported results for incomplete, disconnected, transition-metal, and invalid-valence graphs', () => {
    expect(buildLewisStructure(validateReaction(['H', 'O']))).toMatchObject({ supported: false });

    const disconnected = validateReaction(['C', 'O', 'O']);
    disconnected.graph!.edges.pop();
    expect(buildLewisStructure(disconnected)).toMatchObject({ supported: false });

    const transition = validateReaction(['Na', 'Cl']);
    transition.graph!.nodes[0].element.category = 'transition metal';
    expect(buildLewisStructure(transition)).toMatchObject({ supported: false, reason: expect.stringContaining('Transition-metal') });

    const impossible = validateReaction(['H', 'H']);
    Object.assign(impossible.graph!.edges[0], { bondOrder: 4 });
    expect(buildLewisStructure(impossible)).toMatchObject({ supported: false });
  });
});
