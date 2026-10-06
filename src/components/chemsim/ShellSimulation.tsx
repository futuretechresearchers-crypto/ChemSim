import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactionResult } from '../../types/chemistry';
import { buildShellVisualModel, electronPosition, makeShellLayout, partialChargePosition, shellCaptionPosition, shellRadius, shellVisualState, transferPosition } from './shellPresentation';

export default function ShellSimulation({ result }: { result: ReactionResult }) {
  const model = useMemo(() => buildShellVisualModel(result), [result]);
  const [stepIndex, setStepIndex] = useState(0), [playing, setPlaying] = useState(false), [slow, setSlow] = useState(false);
  const [progress, setProgress] = useState(0), progressRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { setStepIndex(0); setPlaying(false); progressRef.current = 0; setProgress(0); }, [result]);
  // One clock controls the logical timeline and the moving electron; Pause retains its fraction.
  useEffect(() => {
    if (!playing || !model.supported) return;
    if (stepIndex >= model.plan.steps.length - 1) { setPlaying(false); return; }
    const duration = reducedMotion ? 250 : Math.max(500, model.plan.steps[stepIndex].durationMs * (slow ? 1.7 : 1));
    let last = performance.now(), frame = 0;
    const tick = (now: number) => {
      const fraction = Math.min(1, progressRef.current + (now - last) / duration);
      last = now; progressRef.current = fraction; setProgress(fraction);
      if (fraction >= 1) { progressRef.current = 0; setProgress(0); setStepIndex(index => index + 1); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, model, stepIndex, slow, reducedMotion]);
  if (!model.supported) return <div className="shell-unavailable" role="status"><strong>Shell simulation unavailable</strong><p>{model.reason}</p></div>;
  const { graph, plan } = model, step = plan.steps[stepIndex], state = shellVisualState(model, stepIndex), layout = makeShellLayout(model, result.geometry);
  const activeEdge = step.edgeIndex === undefined ? undefined : graph.edges[step.edgeIndex];
  const bondStep = plan.steps.findIndex(s => s.kind === 'bond'), chargeStep = plan.steps.findIndex(s => s.kind === 'charge');
  const jump = (index: number, fraction = .5) => { setPlaying(false); setStepIndex(Math.max(0, Math.min(plan.steps.length - 1, index))); progressRef.current = fraction; setProgress(fraction); };
  const polarLabels = new Map<string, string>();
  if (result.bondType === 'polar covalent') for (const edge of graph.edges) {
    const a = graph.nodes.find(n => n.id === edge.sourceAtomId)!, b = graph.nodes.find(n => n.id === edge.targetAtomId)!;
    if (a.element.electronegativity === b.element.electronegativity) continue;
    const positive = (a.element.electronegativity ?? 0) < (b.element.electronegativity ?? 0);
    polarLabels.set(a.id, positive ? 'δ+' : 'δ−'); polarLabels.set(b.id, positive ? 'δ−' : 'δ+');
  }
  const from = state.flying ? electronPosition(state.flying.electron, layout.points) : undefined, to = state.flying ? electronPosition(state.flying.destination, layout.points) : undefined;
  const flyingPoint = from && to ? transferPosition(from, to, reducedMotion ? .5 : progress) : undefined;
  return <section className="shell-simulation" aria-label="Interactive graph-based shell simulation">
    <div className="shell-heading"><div><span className="eyebrow">GRAPH-DRIVEN SHELL SIM</span><h3>{result.formula}</h3></div><span className={`shell-model-badge ${plan.bondModel}`}>{result.bondType}</span></div>
    <div className="shell-summary"><span>{plan.bondModel === 'ionic' ? `Electron transfer · ${model.transfers.length} e⁻` : `Electron sharing · ${model.pairs.length} shared pair${model.pairs.length === 1 ? '' : 's'}`}</span><span>{graph.nodes.length} atoms · {graph.edges.length} graph bonds</span></div>
    <div className="shell-canvas-wrap"><svg className="shell-canvas" viewBox={layout.viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="shell-svg-title shell-svg-desc">
      <title id="shell-svg-title">{result.formula} electron shell simulation</title><desc id="shell-svg-desc">Graph-derived atoms and individual electron ownership. Current step: {step.title}.</desc>
      <g className="shell-layer-atoms">{graph.nodes.map(node => {
        const p = layout.points.get(node.id)!, shells = model.shells.get(node.id)!, active = activeEdge?.sourceAtomId === node.id || activeEdge?.targetAtomId === node.id;
        return <g key={node.id} className={`shell-atom ${active ? 'is-active' : ''}`} data-atom-id={node.id} data-category={node.element.category}>
          {shells.map((_, i) => <circle key={i} className={`shell-ring ${i === shells.length - 1 ? 'valence-ring' : ''}`} cx={p.x} cy={p.y} r={shellRadius(i)} />)}<circle className="shell-nucleus" cx={p.x} cy={p.y} r="21" />
        </g>;
      })}</g>
      <g className="shell-layer-stationary">{state.stationary.map(e => {
        const p = electronPosition(e, layout.points), valence = e.shell === model.shells.get(e.atomId)!.length - 1, selected = state.highlightedId === e.id;
        return <circle key={e.id} data-electron-id={e.id} data-atom-id={e.atomId} data-origin-atom-id={e.originAtomId} data-shell={e.shell} className={`shell-electron stationary-electron ${valence ? 'valence-electron' : ''} ${selected ? 'highlighted' : ''}`} cx={p.x} cy={p.y} r={selected ? 5 : 3.5} />;
      })}</g>
      <g className="shell-layer-bonds">{graph.edges.map((edge, edgeIndex) => {
        const a = layout.points.get(edge.sourceAtomId)!, b = layout.points.get(edge.targetAtomId)!, pairs = state.shared.filter(p => p.edgeIndex === edgeIndex);
        if (!pairs.length && stepIndex < bondStep) return null;
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1, axis = { x: dx / length, y: dy / length }, normal = { x: -dy / length, y: dx / length };
        const ar = shellRadius(model.shells.get(edge.sourceAtomId)!.length - 1) + 6, br = shellRadius(model.shells.get(edge.targetAtomId)!.length - 1) + 6, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        return <g key={edge.id} data-edge-id={edge.id} className={edge.bondType === 'ionic' ? 'shell-ionic-link' : 'shell-covalent-link'}>
          {Array.from({ length: edge.bondType === 'ionic' ? 1 : edge.bondOrder }, (_, i) => { const offset = edge.bondType === 'ionic' ? 0 : (i - (edge.bondOrder - 1) / 2) * 24;
            return <line key={i} x1={a.x + axis.x * ar + normal.x * offset} y1={a.y + axis.y * ar + normal.y * offset} x2={b.x - axis.x * br + normal.x * offset} y2={b.y - axis.y * br + normal.y * offset} />; })}
          {pairs.map(pair => { const offset = (pair.pairIndex - 1 - (edge.bondOrder - 1) / 2) * 24, p = { x: cx + normal.x * offset, y: cy + normal.y * offset };
            return <g key={pair.id} className="shell-shared-cloud" data-pair-id={pair.id} aria-label={`Shared pair ${pair.pairIndex} of ${edge.bondOrder} on ${edge.id}`}>
              <ellipse cx={p.x} cy={p.y} rx="16" ry="10" transform={`rotate(${Math.atan2(dy, dx) * 180 / Math.PI} ${p.x} ${p.y})`} />
              {pair.electrons.map((e, i) => <circle key={e.id} data-electron-id={e.id} data-origin-atom-id={e.originAtomId} className="shell-electron shared-electron" cx={p.x + axis.x * (i ? 5 : -5)} cy={p.y + axis.y * (i ? 5 : -5)} r="3.8" />)}
            </g>; })}
          {edge.bondType === 'covalent' && (edge.bondOrder > 1 || graph.nodes.length === 2) && <text className="shell-bond-order" x={cx + normal.x * ((edge.bondOrder - 1) * 12 + 48)} y={cy + normal.y * ((edge.bondOrder - 1) * 12 + 48) + 6}>{['', 'single', 'double', 'triple'][edge.bondOrder]}</text>}
          <title>{edge.bondType === 'ionic' ? `${edge.transferredElectrons} graph electron transfers; ionic attraction` : `${edge.bondOrder} graph shared pairs`}</title>
        </g>;
      })}</g>
      <g className="shell-layer-transfer">{state.flying && from && to && flyingPoint && <g className="shell-transfer-trail" data-event-id={state.flying.id}>
        <path d={`M ${from.x} ${from.y} Q ${2 * transferPosition(from, to, .5).x - (from.x + to.x) / 2} ${2 * transferPosition(from, to, .5).y - (from.y + to.y) / 2} ${to.x} ${to.y}`} />
        <circle className="shell-flying-electron" data-electron-id={state.flying.electron.id} data-origin-atom-id={state.flying.electron.originAtomId} cx={flyingPoint.x} cy={flyingPoint.y} r="5" />
      </g>}</g>
      <g className="shell-layer-labels">{graph.nodes.map(node => {
        const p = layout.points.get(node.id)!, counts = model.shells.get(node.id)!, radius = shellRadius(counts.length - 1), occupancy = counts.map((_, i) => state.stationary.filter(e => e.atomId === node.id && e.shell === i).length), polarPoint = partialChargePosition(node.id, model, layout.points), captionPoint = shellCaptionPosition(node.id, model, layout.points);
        return <g key={node.id} data-atom-id={node.id}>
          <text className="shell-symbol" x={p.x} y={p.y + 7}>{node.element.symbol}</text>
          <text className="shell-name" aria-label={`${node.element.name} stationary shell counts ${occupancy.join(', ')}`} x={captionPoint.x} y={captionPoint.y}>{occupancy.join(' · ')}</text>
          {polarLabels.has(node.id) && <g className="shell-polar-labels" data-atom-id={node.id} aria-label={`${node.element.symbol} partial charge ${polarLabels.get(node.id)}`}><text x={polarPoint.x} y={polarPoint.y} textAnchor="middle">{polarLabels.get(node.id)}</text></g>}
          {chargeStep >= 0 && stepIndex >= chargeStep && node.formalCharge !== 0 && <g className={`shell-charge ${node.formalCharge > 0 ? 'positive' : 'negative'}`}><rect x={p.x - 18} y={p.y - radius - 38} width="36" height="26" rx="9" /><text x={p.x} y={p.y - radius - 19}>{node.formalCharge > 0 ? '+' : '−'}{Math.abs(node.formalCharge)}</text></g>}
        </g>;
      })}</g>
    </svg></div>
    <div className="shell-step-copy" aria-live="polite"><div className="shell-step-heading"><span>Step {stepIndex + 1} of {plan.steps.length}</span><strong>{step.title}</strong></div><p>{step.description}</p></div>
    <input className="shell-progress" aria-label="Simulation step" type="range" min={0} max={plan.steps.length - 1} value={stepIndex} onChange={event => jump(Number(event.target.value))} />
    <div className="shell-controls" aria-label="Simulation controls">
      <button type="button" onClick={() => jump(0, 0)} aria-label="Replay from beginning">Replay</button><button type="button" onClick={() => jump(stepIndex - 1)} aria-label="Previous step">Previous</button>
      <button type="button" className="shell-play" onClick={() => { if (playing) setPlaying(false); else { if (stepIndex >= plan.steps.length - 1) { setStepIndex(0); progressRef.current = 0; setProgress(0); } setPlaying(true); } }} aria-label={playing ? 'Pause simulation' : 'Play simulation'}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" onClick={() => jump(stepIndex + 1)} aria-label="Advance one step">Step</button><button type="button" aria-pressed={slow} onClick={() => setSlow(value => !value)} aria-label="Toggle slow motion">{slow ? 'Slow: on' : 'Slow'}</button>
    </div>
    <div className="shell-atom-key">{graph.nodes.map(node => <span key={node.id}><b>{node.element.symbol}</b> {node.element.name}</span>)}</div>
    <p className="shell-model-note">Simplified Bohr model. Numbers below atoms count stationary shell electrons; shared pairs and moving electrons are shown separately. Each dot has one owner.</p>
  </section>;
}
