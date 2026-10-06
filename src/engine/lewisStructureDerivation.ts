import type { AtomNode, MolecularGraph, ReactionResult } from '../types/chemistry';

export interface LewisAtom {
  id: string;
  symbol: string;
  valenceElectrons: number;
  formalCharge: number;
  bondOrderTotal: number;
  nonbondingElectrons: number;
  lonePairCount: number;
}

export interface LewisBond {
  id: string;
  sourceAtomId: string;
  targetAtomId: string;
  bondType: 'covalent' | 'ionic';
  /** Ionic graph links have zero Lewis bond order and never display shared pairs. */
  bondOrder: number;
  sharedElectronCount: number;
  transferredElectronCount: number;
}

export interface LewisStructure {
  formula: string;
  bondModel: 'covalent' | 'ionic';
  atoms: LewisAtom[];
  bonds: LewisBond[];
  totalValenceElectrons: number;
  usedBondElectrons: number;
  remainingLonePairElectrons: number;
}

export type LewisStructureResult =
  | { supported: true; structure: LewisStructure }
  | { supported: false; formula?: string; reason: string };

const unsupported = (reason: string, formula?: string): LewisStructureResult => ({ supported: false, formula, reason });
const symbolCounts = (symbols: string[]) => symbols.reduce<Record<string, number>>((counts, symbol) => {
  counts[symbol] = (counts[symbol] ?? 0) + 1;
  return counts;
}, {});

function countsMatch(left: string[], right: string[]): boolean {
  const a = symbolCounts(left); const b = symbolCounts(right);
  return Object.keys({ ...a, ...b }).every(symbol => a[symbol] === b[symbol]);
}

function graphIsConnected(graph: MolecularGraph): boolean {
  if (!graph.nodes.length) return false;
  const ids = new Set(graph.nodes.map(node => node.id));
  if (ids.size !== graph.nodes.length) return false;
  const reached = new Set([graph.nodes[0].id]); const queue = [graph.nodes[0].id];
  while (queue.length) {
    const current = queue.pop()!;
    for (const edge of graph.edges) {
      const next = edge.sourceAtomId === current ? edge.targetAtomId : edge.targetAtomId === current ? edge.sourceAtomId : undefined;
      if (next && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  return reached.size === graph.nodes.length;
}

function safeEdges(graph: MolecularGraph): boolean {
  const ids = new Set(graph.nodes.map(node => node.id));
  return graph.edges.length > 0 && graph.edges.every(edge => ids.has(edge.sourceAtomId) && ids.has(edge.targetAtomId)
    && edge.sourceAtomId !== edge.targetAtomId && Number.isInteger(edge.bondOrder) && edge.bondOrder >= 1 && edge.bondOrder <= 3);
}

function edgeText(edge: LewisBond, source: AtomNode, target: AtomNode): string {
  if (edge.bondType === 'ionic') {
    const ion = (node: AtomNode) => `${node.element.symbol}${node.formalCharge ? `${node.formalCharge > 0 ? '+' : '−'}${Math.abs(node.formalCharge) === 1 ? '' : Math.abs(node.formalCharge)}` : ''}`;
    return `${ion(source)}  ⋯  ${ion(target)}`;
  }
  const line = edge.bondOrder === 3 ? '≡' : edge.bondOrder === 2 ? '=' : '—';
  return `${source.element.symbol}${line}${target.element.symbol}`;
}

/** Derives Lewis presentation data from the authoritative validated reaction graph. */
export function buildLewisStructure(result: ReactionResult): LewisStructureResult {
  const graph = result.graph;
  if (!result.valid || !graph?.valid || !result.formula) return unsupported('A validated reaction graph is required.', result.formula);
  if (graph.formula !== result.formula || graph.nodes.length !== result.reactants.length) return unsupported('The reaction formula and graph atom list do not agree.', result.formula);
  if (!countsMatch(graph.nodes.map(node => node.element.symbol), result.reactants)) return unsupported('The graph atoms do not match the selected reactants.', result.formula);
  if (!safeEdges(graph) || !graphIsConnected(graph)) return unsupported('A connected graph with valid atom-to-atom bonds is required.', result.formula);
  if (graph.nodes.some(node => ['transition metal', 'lanthanide', 'actinide'].includes(node.element.category))) {
    return unsupported('Transition-metal Lewis structures are outside the supported educational scope.', result.formula);
  }
  if (result.bondType !== 'ionic' && result.bondType !== 'polar covalent' && result.bondType !== 'nonpolar covalent') {
    return unsupported('This bond classification is not supported by the Lewis renderer.', result.formula);
  }

  const bondModel = result.bondType === 'ionic' ? 'ionic' : 'covalent';
  if (graph.edges.some(edge => edge.bondType !== bondModel)) return unsupported('The graph bond types conflict with the reaction classification.', result.formula);
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const bondOrderTotals = new Map(graph.nodes.map(node => [node.id, 0]));
  const transferTotals = new Map(graph.nodes.map(node => [node.id, { incoming: 0, outgoing: 0 }]));
  const bonds: LewisBond[] = [];
  let usedBondElectrons = 0;
  let transferredElectronTotal = 0;

  for (const edge of graph.edges) {
    const source = nodeById.get(edge.sourceAtomId)!;
    const target = nodeById.get(edge.targetAtomId)!;
    if (bondModel === 'covalent') {
      if (edge.electronBehavior !== 'sharing' || edge.sharedElectrons !== edge.bondOrder * 2 || (edge.transferredElectrons ?? 0) !== 0) {
        return unsupported('The graph shared-electron count does not match its bond order.', result.formula);
      }
      if (edge.bondOrderContribution !== edge.bondOrder) return unsupported('The graph covalent bond-order contribution is inconsistent.', result.formula);
      bondOrderTotals.set(source.id, (bondOrderTotals.get(source.id) ?? 0) + edge.bondOrder);
      bondOrderTotals.set(target.id, (bondOrderTotals.get(target.id) ?? 0) + edge.bondOrder);
      usedBondElectrons += edge.bondOrder * 2;
      bonds.push({ id: edge.id, sourceAtomId: source.id, targetAtomId: target.id, bondType: 'covalent', bondOrder: edge.bondOrder, sharedElectronCount: edge.bondOrder * 2, transferredElectronCount: 0 });
    } else {
      const moved = edge.transferredElectrons ?? 0;
      if (edge.electronBehavior !== 'transfer' || edge.bondOrderContribution !== 0 || (edge.sharedElectrons ?? 0) !== 0 || !Number.isInteger(moved) || moved <= 0 || source.formalCharge <= 0 || target.formalCharge >= 0) {
        return unsupported('The ionic graph contains invalid transfer or charge semantics.', result.formula);
      }
      transferTotals.get(source.id)!.outgoing += moved;
      transferTotals.get(target.id)!.incoming += moved;
      transferredElectronTotal += moved;
      bonds.push({ id: edge.id, sourceAtomId: source.id, targetAtomId: target.id, bondType: 'ionic', bondOrder: 0, sharedElectronCount: 0, transferredElectronCount: moved });
    }
  }

  if (bondModel === 'ionic') {
    const netCharge = graph.nodes.reduce((sum, node) => sum + node.formalCharge, 0);
    if (netCharge !== 0 || transferredElectronTotal === 0) return unsupported('Ionic charges and transferred electrons must balance.', result.formula);
    for (const node of graph.nodes) {
      const totals = transferTotals.get(node.id)!;
      if (node.transferredElectronsIn !== totals.incoming || node.transferredElectronsOut !== totals.outgoing || node.formalCharge !== totals.outgoing - totals.incoming) {
        return unsupported('Ionic atom charges do not match the graph electron transfers.', result.formula);
      }
    }
  }

  const atoms: LewisAtom[] = [];
  let totalValenceElectrons = 0;
  let remainingLonePairElectrons = 0;
  for (const node of graph.nodes) {
    const valenceElectrons = node.element.valenceElectrons;
    const bondOrderTotal = bondOrderTotals.get(node.id) ?? 0;
    if (!Number.isInteger(valenceElectrons) || valenceElectrons < 0 || !Number.isInteger(node.formalCharge)) {
      return unsupported('Atom valence or formal charge data is invalid.', result.formula);
    }
    if (bondModel === 'covalent') {
      if (node.formalCharge !== 0 || node.currentBondOrder !== bondOrderTotal || (node.targetValence !== undefined && node.targetValence !== bondOrderTotal)) {
        return unsupported('Covalent graph valence data does not match its bond edges.', result.formula);
      }
    } else if (node.currentBondOrder !== 0 || bondOrderTotal !== 0) {
      return unsupported('Ionic transfers must not be treated as covalent bond orders.', result.formula);
    }

    const nonbondingElectrons = valenceElectrons - node.formalCharge - bondOrderTotal;
    if (!Number.isInteger(nonbondingElectrons) || nonbondingElectrons < 0 || nonbondingElectrons % 2 !== 0) {
      return unsupported(`The electron accounting for ${node.element.symbol} leaves an invalid nonbonding electron count.`, result.formula);
    }
    const lonePairCount = nonbondingElectrons / 2;
    if (bondModel === 'covalent') {
      const shellCapacity = node.element.symbol === 'H' ? 2 : 8;
      if (bondOrderTotal * 2 + nonbondingElectrons !== shellCapacity) {
        return unsupported(`${node.element.symbol} does not satisfy the supported duet/octet rule.`, result.formula);
      }
    } else if (node.formalCharge < 0 && valenceElectrons - node.formalCharge !== 8) {
      return unsupported(`${node.element.symbol} does not reach an octet in this ionic Lewis representation.`, result.formula);
    }
    totalValenceElectrons += valenceElectrons;
    remainingLonePairElectrons += nonbondingElectrons;
    atoms.push({ id: node.id, symbol: node.element.symbol, valenceElectrons, formalCharge: node.formalCharge, bondOrderTotal, nonbondingElectrons, lonePairCount });
  }

  if (usedBondElectrons + remainingLonePairElectrons !== totalValenceElectrons) {
    return unsupported('The Lewis electron total does not balance the reaction atom valence electrons.', result.formula);
  }
  return {
    supported: true,
    structure: { formula: graph.formula, bondModel, atoms, bonds, totalValenceElectrons, usedBondElectrons, remainingLonePairElectrons },
  };
}
