import type { ReactionResult } from '../types/chemistry';

export type ShellStepKind = 'ready' | 'approach' | 'highlight' | 'transfer' | 'received' | 'sharing' | 'charge' | 'bond' | 'complete';
export interface ShellSimulationStep {
  id: string;
  kind: ShellStepKind;
  title: string;
  description: string;
  edgeIndex?: number;
  electronIndex?: number;
  pairIndex?: number;
  durationMs: number;
}
export type ShellSimulationPlan =
  | { supported: true; steps: ShellSimulationStep[]; bondModel: 'ionic' | 'covalent'; }
  | { supported: false; reason: string };

/** Translate the authoritative bonding result into presentation events. It does not infer chemistry. */
export function createShellSimulationPlan(result: ReactionResult): ShellSimulationPlan {
  const graph = result.graph;
  if (!result.valid || !graph?.valid || !result.formula || !result.bondType) {
    return { supported: false, reason: 'Shell simulation needs a valid bonding result with a solved atom graph.' };
  }
  if (graph.formula !== result.formula || graph.nodes.length !== result.reactants.length || graph.nodes.length < 2 || graph.edges.length === 0) {
    return { supported: false, reason: 'The displayed product and atom graph do not agree, so this result cannot be animated safely.' };
  }
  const bondModel = result.bondType === 'ionic' ? 'ionic' : 'covalent';
  if (graph.edges.some(edge => edge.bondType !== bondModel || edge.electronBehavior !== (bondModel === 'ionic' ? 'transfer' : 'sharing'))) {
    return { supported: false, reason: 'The graph bond behavior conflicts with the compound result. The shell view is paused to avoid showing the wrong chemistry.' };
  }
  if (bondModel === 'covalent' && graph.edges.some(edge => edge.sharedElectrons !== edge.bondOrder * 2)) {
    return { supported: false, reason: 'The graph shared-electron count does not match its bond order.' };
  }
  const ids = new Set(graph.nodes.map(node => node.id));
  if (graph.edges.some(edge => !ids.has(edge.sourceAtomId) || !ids.has(edge.targetAtomId) || edge.sourceAtomId === edge.targetAtomId)) {
    return { supported: false, reason: 'The graph contains an invalid bond connection.' };
  }
  const reached = new Set([graph.nodes[0].id]);
  const queue = [graph.nodes[0].id];
  while (queue.length) {
    const id = queue.pop()!;
    for (const edge of graph.edges) {
      const next = edge.sourceAtomId === id ? edge.targetAtomId : edge.targetAtomId === id ? edge.sourceAtomId : undefined;
      if (next && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  if (reached.size !== graph.nodes.length) return { supported: false, reason: 'The graph has disconnected atom groups and cannot be animated as one product.' };
  if (graph.edges.some(edge => edge.bondOrderContribution !== (edge.bondType === 'ionic' ? 0 : edge.bondOrder))) {
    return { supported: false, reason: 'The graph bond-order contributions do not match their bond types.' };
  }

  const steps: ShellSimulationStep[] = [
    { id: 'ready', kind: 'ready', title: 'Atoms are ready', description: `Inspect the valence electrons and ${bondModel === 'ionic' ? 'electron transfers' : 'shared electron pairs'} recorded in the bonding graph.`, durationMs: 800 },
  ];
  if (bondModel === 'ionic') {
    const positiveCharge = graph.nodes.filter(node => node.formalCharge > 0).reduce((sum, node) => sum + node.formalCharge, 0);
    const negativeCharge = graph.nodes.filter(node => node.formalCharge < 0).reduce((sum, node) => sum + node.formalCharge, 0);
    const transferCount = graph.edges.reduce((sum, edge) => sum + (edge.transferredElectrons ?? 0), 0);
    const electronsOut = graph.nodes.reduce((sum, node) => sum + node.transferredElectronsOut, 0);
    const electronsIn = graph.nodes.reduce((sum, node) => sum + node.transferredElectronsIn, 0);
    if (positiveCharge <= 0 || positiveCharge + negativeCharge !== 0 || transferCount !== positiveCharge || electronsOut !== transferCount || electronsIn !== transferCount) {
      return { supported: false, reason: 'The graph electron transfers do not balance the formal ion charges.' };
    }
    steps.push({ id: 'approach', kind: 'approach', title: 'Valence shells approach', description: 'The graph identifies the donor and receiving atoms for each transfer.', durationMs: 700 });
    graph.edges.forEach((edge, edgeIndex) => {
      for (let electronIndex = 1; electronIndex <= (edge.transferredElectrons ?? 0); electronIndex++) {
        steps.push({ id: `highlight-${edgeIndex}-${electronIndex}`, kind: 'highlight', title: `Electron ${electronIndex} highlighted`, description: 'A valence electron recorded on this bond edge is selected for transfer.', edgeIndex, electronIndex, durationMs: 650 });
        steps.push({ id: `transfer-${edgeIndex}-${electronIndex}`, kind: 'transfer', title: 'Electron transfers', description: 'The electron follows a glowing path from the positive ion source to its receiving atom.', edgeIndex, electronIndex, durationMs: 900 });
        steps.push({ id: `received-${edgeIndex}-${electronIndex}`, kind: 'received', title: 'Electron received', description: 'The receiving atom updates its outer-shell electron count.', edgeIndex, electronIndex, durationMs: 650 });
      }
    });
    steps.push({ id: 'charges', kind: 'charge', title: 'Ions form', description: 'Formal charges from the graph appear on the atoms after electron transfer.', durationMs: 700 });
  } else {
    steps.push({ id: 'approach', kind: 'approach', title: 'Atoms approach', description: 'The covalent graph connects atoms that share electron pairs.', durationMs: 700 });
    graph.edges.forEach((edge, edgeIndex) => {
      for (let pairIndex = 1; pairIndex <= edge.bondOrder; pairIndex++) {
        steps.push({ id: `sharing-${edgeIndex}-${pairIndex}`, kind: 'sharing', title: `Shared pair ${pairIndex}`, description: `This bond edge shares electron pair ${pairIndex} of ${edge.bondOrder}.`, edgeIndex, pairIndex, durationMs: 700 });
      }
    });
  }
  steps.push({ id: 'bond', kind: 'bond', title: bondModel === 'ionic' ? 'Ionic attraction forms' : 'Covalent bonds form', description: 'The bond lines and orders shown are read directly from the graph.', durationMs: 850 });
  steps.push({ id: 'complete', kind: 'complete', title: 'Bonding visualization complete', description: `${result.formula} — ${result.bondType}. This is a simplified shell model of the graph result.`, durationMs: 1000 });
  return { supported: true, steps, bondModel };
}

export function getShellOccupancies(atomicNumber: number, valenceElectrons: number, period: number): number[] {
  if (period <= 1) return [valenceElectrons];
  let core = Math.max(0, atomicNumber - valenceElectrons);
  const capacities = [2, 8, 18, 32];
  const shells: number[] = [];
  for (let index = 0; index < period - 1; index++) {
    const count = Math.min(core, capacities[index] ?? 0);
    shells.push(count);
    core -= count;
  }
  shells.push(valenceElectrons);
  return shells;
}
