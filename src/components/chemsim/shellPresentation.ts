import { buildLewisStructure } from '../../engine/lewisEngine';
import { createShellSimulationPlan, getShellOccupancies } from '../../engine/shellSimulation';
import type { ReactionResult } from '../../types/chemistry';

export type Point = { x: number; y: number };
export type VisualElectron = { id: string; originAtomId: string; atomId: string; shell: number; slot: number; slots: number };
type Transfer = { id: string; edgeIndex: number; electronIndex: number; electron: VisualElectron; destination: VisualElectron };
type SharedPair = { id: string; edgeIndex: number; pairIndex: number; electrons: VisualElectron[] };
export type ShellVisualModel = ReturnType<typeof buildShellVisualModel>;
export const shellRadius = (index: number) => 32 + index * 12;

/** Presentation only: stable identities consume the existing graph/event plan. */
export function buildShellVisualModel(result: ReactionResult) {
  const plan = createShellSimulationPlan(result);
  const lewis = buildLewisStructure(result);
  if (!plan.supported || !lewis.supported || !result.graph) return {
    supported: false as const, reason: !plan.supported ? plan.reason : !lewis.supported ? lewis.reason : 'The atom graph is missing.',
  };
  const graph = result.graph;
  const electrons: VisualElectron[] = [];
  const available = new Map<string, VisualElectron[]>();
  const shells = new Map<string, number[]>();
  for (const node of graph.nodes) {
    const counts = getShellOccupancies(node.element.atomicNumber, node.element.valenceElectrons, node.element.period);
    shells.set(node.id, counts);
    const outer: VisualElectron[] = [];
    counts.forEach((count, shell) => {
      const slots = count + (shell === counts.length - 1 ? node.transferredElectronsIn : 0);
      for (let slot = 0; slot < count; slot++) {
        const electron = { id: `${node.id}:shell-${shell}:electron-${slot}`, originAtomId: node.id, atomId: node.id, shell, slot, slots };
        electrons.push(electron);
        if (shell === counts.length - 1) outer.push(electron);
      }
    });
    available.set(node.id, outer);
  }
  const transfers: Transfer[] = [];
  const pairs: SharedPair[] = [];
  const incoming = new Map(graph.nodes.map(n => [n.id, 0]));
  for (const step of plan.steps) {
    if (step.edgeIndex === undefined) continue;
    const edge = graph.edges[step.edgeIndex];
    if (step.kind === 'transfer') {
      const electron = available.get(edge.sourceAtomId)?.shift();
      if (!electron) return { supported: false as const, reason: 'The graph requests an unavailable donor electron.' };
      const counts = shells.get(edge.targetAtomId)!;
      const node = graph.nodes.find(n => n.id === edge.targetAtomId)!;
      const received = incoming.get(node.id)!;
      incoming.set(node.id, received + 1);
      transfers.push({ id: step.id, edgeIndex: step.edgeIndex, electronIndex: step.electronIndex!, electron,
        destination: { ...electron, atomId: node.id, shell: counts.length - 1, slot: counts.at(-1)! + received, slots: counts.at(-1)! + node.transferredElectronsIn } });
    }
    if (step.kind === 'sharing') {
      const first = available.get(edge.sourceAtomId)?.shift();
      const second = available.get(edge.targetAtomId)?.shift();
      if (!first || !second) return { supported: false as const, reason: 'The graph requests an unavailable bonding electron.' };
      pairs.push({ id: step.id, edgeIndex: step.edgeIndex, pairIndex: step.pairIndex!, electrons: [first, second] });
    }
  }
  return { supported: true as const, graph, plan, shells, electrons, transfers, pairs };
}

export function shellVisualState(model: Extract<ShellVisualModel, { supported: true }>, stepIndex: number) {
  const stationary = new Map(model.electrons.map(e => [e.id, e]));
  const shared: SharedPair[] = [];
  let flying: Transfer | undefined;
  let highlightedId: string | undefined;
  const step = model.plan.steps[stepIndex];
  for (const event of model.plan.steps.slice(0, stepIndex + 1)) {
    if (event.kind === 'transfer' || event.kind === 'received') {
      const transfer = model.transfers.find(t => t.edgeIndex === event.edgeIndex && t.electronIndex === event.electronIndex)!;
      stationary.delete(transfer.electron.id);
      if (event.kind === 'received') { stationary.set(transfer.destination.id, transfer.destination); flying = undefined; }
      else flying = transfer;
    }
    if (event.kind === 'sharing') {
      const pair = model.pairs.find(p => p.id === event.id)!;
      pair.electrons.forEach(e => stationary.delete(e.id));
      shared.push(pair);
    }
  }
  if (step.kind === 'highlight') highlightedId = model.transfers.find(t => t.edgeIndex === step.edgeIndex && t.electronIndex === step.electronIndex)?.electron.id;
  return { stationary: [...stationary.values()], shared, flying, highlightedId };
}

export function makeShellLayout(model: Extract<ShellVisualModel, { supported: true }>, geometry?: string) {
  const points = new Map<string, Point>();
  const nodes = model.graph.nodes;
  if (model.plan.bondModel === 'ionic') {
    const donors = nodes.filter(n => n.formalCharge > 0), receivers = nodes.filter(n => n.formalCharge < 0);
    const rows = Math.max(donors.length, receivers.length);
    const height = (rows - 1) * 196;
    donors.forEach((n, i) => points.set(n.id, { x: 0, y: donors.length === 1 ? height / 2 : i * height / (donors.length - 1) }));
    receivers.forEach((n, i) => points.set(n.id, { x: 180, y: receivers.length === 1 ? height / 2 : i * height / (receivers.length - 1) }));
  } else if (nodes.length === 2) {
    points.set(nodes[0].id, { x: 0, y: 0 });
    points.set(nodes[1].id, { x: 160, y: 0 });
  } else {
    const degree = (id: string) => model.graph.edges.filter(e => e.sourceAtomId === id || e.targetAtomId === id).length;
    const center = [...nodes].sort((a, b) => degree(b.id) - degree(a.id) || b.currentBondOrder - a.currentBondOrder)[0];
    points.set(center.id, { x: 0, y: 0 });
    const outer = nodes.filter(n => n.id !== center.id);
    const linear = geometry?.toLowerCase().includes('linear');
    const angle = Number(geometry?.match(/(\d+(?:\.\d+)?)\s*°/)?.[1] ?? 120);
    outer.forEach((n, i) => {
      const direction = outer.length === 2 ? linear ? i * 180 : 90 + (i ? angle / 2 : -angle / 2) : -90 + i * 360 / outer.length;
      const radians = direction * Math.PI / 180;
      points.set(n.id, { x: Math.cos(radians) * 144, y: Math.sin(radians) * 144 });
    });
  }
  // Reserve real label/shell space in the viewBox instead of shrinking a wide canvas.
  const margin = 96;
  const xs = [...points.values()].map(p => p.x), ys = [...points.values()].map(p => p.y);
  const minX = Math.min(...xs) - margin, minY = Math.min(...ys) - margin;
  return { points, viewBox: `${minX} ${minY} ${Math.max(...xs) - minX + margin} ${Math.max(...ys) - minY + margin}` };
}

export function electronPosition(electron: VisualElectron, points: Map<string, Point>): Point {
  const center = points.get(electron.atomId)!;
  const angle = (-90 + 360 * electron.slot / Math.max(1, electron.slots)) * Math.PI / 180;
  return { x: center.x + Math.cos(angle) * shellRadius(electron.shell), y: center.y + Math.sin(angle) * shellRadius(electron.shell) };
}

export function shellCaptionPosition(atomId: string, model: Extract<ShellVisualModel, { supported: true }>, points: Map<string, Point>): Point {
  const point = points.get(atomId)!;
  const radius = shellRadius(model.shells.get(atomId)!.length - 1);
  const angles = model.graph.edges.flatMap(edge => {
    const otherId = edge.sourceAtomId === atomId ? edge.targetAtomId : edge.targetAtomId === atomId ? edge.sourceAtomId : undefined;
    if (!otherId) return [];
    const other = points.get(otherId)!;
    return [(Math.atan2(other.y - point.y, other.x - point.x) * 180 / Math.PI + 360) % 360];
  });
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  if (angles.every(angle => distance(angle, 90) >= 30)) return { x: point.x, y: point.y + radius + 20 };
  const candidates = Array.from({ length: 24 }, (_, i) => i * 15);
  candidates.sort((a, b) => Math.min(...angles.map(o => distance(b, o))) - Math.min(...angles.map(o => distance(a, o))) || a - b);
  const angle = candidates[0] * Math.PI / 180;
  return { x: point.x + Math.cos(angle) * (radius + 28), y: point.y + Math.sin(angle) * (radius + 28) + 6 };
}

export function partialChargePosition(atomId: string, model: Extract<ShellVisualModel, { supported: true }>, points: Map<string, Point>): Point {
  const point = points.get(atomId)!;
  const caption = shellCaptionPosition(atomId, model, points);
  // Reserve the caption's actual sector, including captions moved away from a bond.
  const occupied = [(Math.atan2(caption.y - point.y - 6, caption.x - point.x) * 180 / Math.PI + 360) % 360];
  for (const edge of model.graph.edges) {
    const otherId = edge.sourceAtomId === atomId ? edge.targetAtomId : edge.targetAtomId === atomId ? edge.sourceAtomId : undefined;
    if (otherId) { const other = points.get(otherId)!; occupied.push((Math.atan2(other.y - point.y, other.x - point.x) * 180 / Math.PI + 360) % 360); }
  }
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const candidates = Array.from({ length: 24 }, (_, i) => i * 15);
  candidates.sort((a, b) => Math.min(...occupied.map(o => distance(b, o))) - Math.min(...occupied.map(o => distance(a, o))) || a - b);
  const angle = candidates[0] * Math.PI / 180, radius = shellRadius(model.shells.get(atomId)!.length - 1) + 28;
  return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius + 6 };
}

export function transferPosition(from: Point, to: Point, progress: number): Point {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
  const control = { x: (from.x + to.x) / 2 - dy / length * 24, y: (from.y + to.y) / 2 + dx / length * 24 };
  const t = Math.max(0, Math.min(1, progress));
  return { x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x,
    y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y };
}
