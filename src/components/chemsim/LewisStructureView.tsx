import type { LewisStructure, LewisStructureResult } from '../../engine/lewisEngine';

type LewisStructureViewProps = { result: LewisStructureResult; geometry?: string };
type Point = { x: number; y: number };
const WIDTH = 760;
const HEIGHT = 420;
const ATOM_RADIUS = 24;
const PAIR_RADIUS = 39;
const DOT_RADIUS = 4.5;

function circularDistance(a: number, b: number): number {
  const difference = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(difference, 360 - difference);
}

function makePositions(structure: LewisStructure, geometry?: string): Map<string, Point> {
  const nodes = structure.atoms;
  const positions = new Map<string, Point>();
  if (nodes.length === 2) {
    positions.set(nodes[0].id, { x: WIDTH * .32, y: HEIGHT / 2 });
    positions.set(nodes[1].id, { x: WIDTH * .68, y: HEIGHT / 2 });
    return positions;
  }

  const neighbors = new Map(nodes.map(node => [node.id, new Set<string>()]));
  for (const bond of structure.bonds) {
    neighbors.get(bond.sourceAtomId)?.add(bond.targetAtomId);
    neighbors.get(bond.targetAtomId)?.add(bond.sourceAtomId);
  }
  const center = [...nodes].sort((a, b) => (neighbors.get(b.id)?.size ?? 0) - (neighbors.get(a.id)?.size ?? 0)
    || b.bondOrderTotal - a.bondOrderTotal)[0];
  const outerNodes = nodes.filter(node => node.id !== center.id);
  const centerPoint = { x: WIDTH / 2, y: HEIGHT / 2 };
  positions.set(center.id, centerPoint);

  const centerNeighbors = outerNodes.filter(node => neighbors.get(center.id)?.has(node.id));
  const geometryAngle = Number(geometry?.match(/(\d+(?:\.\d+)?)\s*°/)?.[1] ?? 120);
  const directions = centerNeighbors.length === 2
    ? (geometry?.toLowerCase().includes('linear') ? [0, 180] : [-geometryAngle / 2, geometryAngle / 2])
    : centerNeighbors.map((_, index) => -90 + (360 * index) / Math.max(centerNeighbors.length, 1));
  centerNeighbors.forEach((node, index) => {
    const angle = (directions[index] ?? -90 + index * 360 / centerNeighbors.length) * Math.PI / 180;
    positions.set(node.id, { x: centerPoint.x + Math.cos(angle) * 132, y: centerPoint.y + Math.sin(angle) * 132 });
  });

  // For connected non-star graphs, place any remaining atoms around the center.
  const unplaced = outerNodes.filter(node => !positions.has(node.id));
  unplaced.forEach((node, index) => {
    const angle = (-90 + 360 * index / Math.max(unplaced.length, 1)) * Math.PI / 180;
    positions.set(node.id, { x: centerPoint.x + Math.cos(angle) * 132, y: centerPoint.y + Math.sin(angle) * 132 });
  });
  return positions;
}

function lonePairAngles(atomId: string, structure: LewisStructure, positions: Map<string, Point>, pairCount: number): number[] {
  const point = positions.get(atomId)!;
  const occupied: number[] = [];
  for (const bond of structure.bonds) {
    const otherId = bond.sourceAtomId === atomId ? bond.targetAtomId : bond.targetAtomId === atomId ? bond.sourceAtomId : undefined;
    const other = otherId ? positions.get(otherId) : undefined;
    if (other) occupied.push((Math.atan2(other.y - point.y, other.x - point.x) * 180 / Math.PI + 360) % 360);
  }
  const atom = structure.atoms.find(item => item.id === atomId)!;
  if (atom.formalCharge) occupied.push(315); // reserve space for the charge marker
  const candidates = Array.from({ length: 24 }, (_, index) => index * 15);
  const selected: number[] = [];
  while (selected.length < pairCount && candidates.length) {
    candidates.sort((a, b) => {
      const score = (angle: number) => Math.min(...[...occupied, ...selected].map(other => circularDistance(angle, other)), 180);
      return score(b) - score(a) || a - b;
    });
    selected.push(candidates.shift()!);
  }
  return selected;
}

function electronDots(cx: number, cy: number, angle: number) {
  const radians = angle * Math.PI / 180;
  const tangentX = -Math.sin(radians) * 5.2;
  const tangentY = Math.cos(radians) * 5.2;
  const centerX = cx + Math.cos(radians) * PAIR_RADIUS;
  const centerY = cy + Math.sin(radians) * PAIR_RADIUS;
  return [
    { x: centerX - tangentX, y: centerY - tangentY },
    { x: centerX + tangentX, y: centerY + tangentY },
  ];
}

export default function LewisStructureView({ result, geometry }: LewisStructureViewProps) {
  if (!result.supported) return <div className="lewis-unavailable" role="status">Lewis structure unavailable: {result.reason}</div>;

  const { structure } = result;
  const positions = makePositions(structure, geometry);
  const nodes = new Map(structure.atoms.map(atom => [atom.id, atom]));
  // Crop empty canvas space only; atom positions and Lewis derivation stay unchanged.
  const xs = [...positions.values()].map(point => point.x), ys = [...positions.values()].map(point => point.y);
  const padding = 60;
  const viewBox = `${Math.min(...xs) - padding} ${Math.min(...ys) - padding} ${Math.max(...xs) - Math.min(...xs) + padding * 2} ${Math.max(...ys) - Math.min(...ys) + padding * 2}`;

  return <section className="lewis-structure-view" aria-label={`Lewis structure for ${structure.formula}`}>
    <div className="lewis-electron-summary" aria-label="Valence electron accounting">
      <span>{structure.totalValenceElectrons} valence electrons</span>
      <span>{structure.usedBondElectrons} bonding electrons</span>
      <span>{structure.remainingLonePairElectrons / 2} lone pairs</span>
    </div>
    <div className="lewis-canvas-wrap">
      <svg className="lewis-canvas" viewBox={viewBox} role="img" aria-label={`Lewis structure diagram for ${structure.formula}`}>
        {structure.bonds.map(bond => {
          const source = positions.get(bond.sourceAtomId)!;
          const target = positions.get(bond.targetAtomId)!;
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const length = Math.hypot(dx, dy) || 1;
          const perpendicular = { x: -dy / length, y: dx / length };
          const lineCount = bond.bondType === 'ionic' ? 1 : bond.bondOrder;
          const gap = 9;
          return <g key={bond.id} className={`lewis-bond ${bond.bondType}`} aria-label={bond.bondType === 'ionic' ? 'Ionic link, no shared electron pairs' : `${bond.bondOrder === 1 ? 'Single' : bond.bondOrder === 2 ? 'Double' : 'Triple'} covalent bond, ${bond.sharedElectronCount / 2} shared electron pairs`}>
            {Array.from({ length: lineCount }, (_, index) => {
              const offset = (index - (lineCount - 1) / 2) * gap;
              return <line key={index} className="lewis-bond-line" x1={source.x + perpendicular.x * offset} y1={source.y + perpendicular.y * offset}
                x2={target.x + perpendicular.x * offset} y2={target.y + perpendicular.y * offset} />;
            })}
            <title>{bond.bondType === 'ionic' ? 'Ionic electron transfer link' : `${bond.bondOrder} bond order`}</title>
          </g>;
        })}
        {structure.atoms.map(atom => {
          const point = positions.get(atom.id)!;
          const angles = lonePairAngles(atom.id, structure, positions, atom.lonePairCount);
          return <g key={atom.id} className="lewis-atom" data-atom-id={atom.id} aria-label={`${atom.symbol}, ${atom.lonePairCount} lone pairs, formal charge ${atom.formalCharge}`}>
            {angles.map((angle, pairIndex) => <g key={pairIndex} className="lewis-lone-pair" role="img" aria-label={`${atom.symbol} lone pair ${pairIndex + 1}`}>
              <title>{atom.symbol} lone pair {pairIndex + 1}</title>
              {electronDots(point.x, point.y, angle).map((dot, index) => <circle key={index} className="lewis-electron-dot" cx={dot.x} cy={dot.y} r={DOT_RADIUS} />)}
            </g>)}
            <circle className="lewis-atom-disc" cx={point.x} cy={point.y} r={ATOM_RADIUS} />
            <text className="lewis-atom-symbol" x={point.x} y={point.y + 6} textAnchor="middle">{atom.symbol}</text>
            {atom.formalCharge !== 0 && <text className="lewis-formal-charge" x={point.x + 24} y={point.y - 28}>
              {atom.formalCharge > 0 ? '+' : '−'}{Math.abs(atom.formalCharge) === 1 ? '' : Math.abs(atom.formalCharge)}
            </text>}
          </g>;
        })}
      </svg>
    </div>
    <p className="lewis-accounting-note">Bond lines and orders come from the reaction graph. Each lone pair is two nonbonding electrons.</p>
  </section>;
}
