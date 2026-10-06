import { useEffect, useMemo, useRef, useState } from 'react';
import { elementBySymbol } from '../data/elementData';
import { buildLewisStructure } from '../engine/lewisEngine';
import { formatChemicalFormula } from '../engine/formatting';
import { getCompatibleElements, validateReaction } from '../engine/reactionEngine';
import type { Atom, ElementData, ReactionResult } from '../types/chemistry';
import PeriodicTable from './chemsim/PeriodicTable';
import ShellSimulation from './chemsim/ShellSimulation';
import LewisStructureView from './chemsim/LewisStructureView';
import { studentReactionFeedback } from './chemsim/reactionFeedback';

const ATTEMPT_SECONDS = 15;

type ChemLabSimulatorProps = {
  onResultChange?: (result: ReactionResult) => void;
};

type SimulationState = 'IDLE'|'SELECTING'|'READY'|'VALIDATING'|'DETECTED'|'ATTRACTING'|'ELECTRON_TRANSFER'|'ELECTRON_SHARING'|'LEWIS_GENERATION'|'FORMING'|'OCTET_CHECK'|'SUCCESS'|'INVALID'|'TIME_EXPIRED';
const categoryColor: Record<string, string> = {
  'alkali metal':'25 95% 60%', 'alkaline earth metal':'45 90% 55%', 'transition metal':'200 80% 55%', 'post-transition metal':'200 80% 55%', lanthanide:'200 80% 55%', actinide:'200 80% 55%', metalloid:'140 70% 50%', 'reactive nonmetal':'140 70% 50%', halogen:'290 75% 65%', 'noble gas':'180 70% 55%'
};
function AtomView({ atom, index, total, phase, angle }: { atom: Atom; index:number; total:number; phase:SimulationState; angle:number }) {
  const reacting = ['DETECTED','ATTRACTING','ELECTRON_SHARING','ELECTRON_TRANSFER','LEWIS_GENERATION','FORMING'].includes(phase);
  const x = total === 1 ? 50 : 17 + (66 * index / Math.max(total - 1, 1));
  const y = reacting ? 50 : 43 + (index % 2) * 14;
  const electrons = Array.from({ length: Math.min(atom.element.valenceElectrons, 8) });
  return <div className={`atom ${reacting ? 'reacting' : ''}`} style={{ left:`${x}%`,top:`${y}%`,'--atom-color':categoryColor[atom.element.category] ?? '245 70% 60%' } as React.CSSProperties} aria-label={`${atom.element.name} atom with ${atom.element.valenceElectrons} valence electrons`}>
    <span className="atom-shell" />
    {electrons.map((_, electronIndex) => { const a = angle + electronIndex * (360 / Math.max(electrons.length, 1)); return <span className="electron" key={electronIndex} style={{ transform:`rotate(${a}deg) translateX(43px)` }} />; })}
    <span className="atom-core"><span className="atom-symbol">{atom.element.symbol}</span></span>
  </div>;
}
function OctetPanel({ atoms, phase, valid, graph }: { atoms: Atom[]; phase: SimulationState; valid:boolean; graph?: ReactionResult['graph'] }) {
  if (!atoms.length) return null;
  const active = ['REACTION','ELECTRON_TRANSFER','ELECTRON_SHARING','LEWIS_GENERATION','OCTET_CHECK'].includes(phase);
  const ionic = graph?.edges.some(edge=>edge.bondType==='ionic');
  return <div className="octet-panel"><h3>{ionic?'Ion / transfer check':'Octet / duet check'}</h3>{atoms.map((atom,index) => { const node=graph?.nodes[index]; const required = node?.targetValence ?? (atom.element.symbol === 'H' ? 1 : 4); const current = node?.currentBondOrder ?? 0; const satisfied = valid && !!node && (ionic ? node.formalCharge!==0 : current===required); return <div className={`octet-row ${satisfied ? 'satisfied' : ''}`} key={atom.id}><span>{atom.element.symbol}: {atom.element.valenceElectrons} valence</span><span>{ionic&&node ? `${node.formalCharge>0?'+':''}${node.formalCharge} charge · ${node.transferredElectronsOut||node.transferredElectronsIn} e⁻ transfer` : satisfied ? `satisfied (${current}/${required} bonds)` : active ? 'checking' : `${current}/${required} bonds`}</span></div>; })}</div>;
}
function CompoundVisual({ result, lewis }: { result: ReactionResult; lewis?: ReturnType<typeof buildLewisStructure> }) {
  if (!result.formula || !result.compoundName) return null;
  return <div className="compound-visual" role="status" aria-label={`${result.compoundName} compound formed`}>
    <span className="compound-pulse" aria-hidden="true" />
    <span className="compound-check" aria-hidden="true">✓</span>
    <strong>{formatChemicalFormula(result.formula)}</strong><span>{result.compoundName}</span>
    <small>{result.bondType} · {result.animationType === 'electron-transfer' ? 'electron transfer' : 'electron sharing'}</small>
    {lewis?.supported && <small aria-label="Lewis structure preview">{lewis.structure.atoms.reduce((sum, atom) => sum + atom.lonePairCount, 0)} lone pairs · graph-derived</small>}
  </div>;
}
export default function ChemLabSimulator({ onResultChange }: ChemLabSimulatorProps) {
  const [atoms,setAtoms] = useState<Atom[]>([]); const [selectedSymbol,setSelectedSymbol] = useState<string>();
  const [result,setResult] = useState<ReactionResult>({valid:false,reactants:[],products:[],feedback:'Choose an element, then add a precise reactant group.'});
  const [phase,setPhase] = useState<SimulationState>('IDLE'); const [seconds,setSeconds] = useState(ATTEMPT_SECONDS); const [history,setHistory] = useState<string[]>([]); const [showBond,setShowBond] = useState(false); const [tab,setTab] = useState<'Compound'|'Shell Sim'|'Lewis'|'How?'|'Analysis'>('Compound'); const [orbitalAngle,setOrbitalAngle] = useState(0);
  const frame = useRef<number | null>(null); const timers = useRef<number[]>([]); const countdownDeadline = useRef<number | null>(null);
  useEffect(() => { onResultChange?.(result); }, [onResultChange, result]);
  useEffect(() => { let last=0; const orbit=(time:number) => { if (time-last>33) { setOrbitalAngle((time/24)%360); last=time; } frame.current=requestAnimationFrame(orbit); }; frame.current=requestAnimationFrame(orbit); return () => { if(frame.current) cancelAnimationFrame(frame.current); timers.current.forEach(clearTimeout); }; },[]);
  useEffect(() => {
    if (!atoms.length || ['SUCCESS','TIME_EXPIRED'].includes(phase)) { countdownDeadline.current = null; return; }
    if (countdownDeadline.current === null) return;
    const tick = () => {
      if (countdownDeadline.current === null) return;
      const remaining = Math.max(0, Math.ceil((countdownDeadline.current! - performance.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) {
        countdownDeadline.current = null;
        timers.current.forEach(clearTimeout); timers.current = [];
        setShowBond(false); setPhase('TIME_EXPIRED');
        setResult({valid:false,reactants:[],products:[],feedback:'Time expired. Continue or reset to start a new 15-second attempt.'});
      }
    };
    const interval = window.setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [atoms.length, phase]);
  const add = (symbol:string) => { const element=elementBySymbol(symbol); if(!element) return; if(!atoms.length || phase==='SUCCESS' || phase==='TIME_EXPIRED') { countdownDeadline.current=performance.now()+ATTEMPT_SECONDS*1000; setSeconds(ATTEMPT_SECONDS); } setSelectedSymbol(symbol); setAtoms(current => [...current,{id:crypto.randomUUID(),element,x:0,y:0,state:'idle'}]); setPhase('SELECTING'); setResult({valid:false,reactants:[],products:[],feedback:`${element.name} added. Add the exact quantities required, then start the reaction.`}); };
  const reset = () => { timers.current.forEach(clearTimeout);timers.current=[];countdownDeadline.current=null;setShowBond(false);setAtoms([]);setSeconds(ATTEMPT_SECONDS);setPhase('IDLE');setResult({valid:false,reactants:[],products:[],feedback:'Workspace reset. Select elements before starting the simulation.'}); };
  const continueAttempt = () => { countdownDeadline.current=performance.now()+ATTEMPT_SECONDS*1000;setSeconds(ATTEMPT_SECONDS);setPhase('SELECTING'); };
  const schedule = (ms:number, callback:()=>void) => timers.current.push(window.setTimeout(callback,ms));
  const analyze = () => { if(!atoms.length) return; timers.current.forEach(clearTimeout);timers.current=[]; const selectedAtoms=atoms.map(a=>a.element.symbol); const checked=studentReactionFeedback(validateReaction(selectedAtoms),selectedAtoms); setPhase('VALIDATING'); setResult({...checked,feedback:'Checking selected atoms against known reaction, stoichiometry, and valence rules…'}); schedule(300,() => { if(!checked.valid){setResult(checked);setPhase('INVALID');return;} setPhase('DETECTED'); schedule(600,()=>{setPhase('ATTRACTING'); schedule(500,()=>{setPhase(checked.bondType==='ionic'?'ELECTRON_TRANSFER':'ELECTRON_SHARING'); schedule(500,()=>{setPhase('LEWIS_GENERATION');schedule(500,()=>{setPhase('FORMING');schedule(600,()=>{setPhase('OCTET_CHECK');schedule(300,()=>{setAtoms(current=>current.map(atom=>({...atom,state:'product'})));setPhase('SUCCESS');setResult({...checked,feedback:`${checked.compoundName} formed successfully from the validated reactants.`});setHistory(h=>[checked.formula!,...h.filter(x=>x!==checked.formula)].slice(0,8));setShowBond(true);});});});});});}); }); };
  const lewis=useMemo(()=>buildLewisStructure(result),[result]); const reacting=['DETECTED','ATTRACTING','ELECTRON_TRANSFER','ELECTRON_SHARING','LEWIS_GENERATION','FORMING'].includes(phase);
  return <main className="sim-shell"><section className="palette card"><PeriodicTable selectedSymbol={selectedSymbol} onSelect={element=>setSelectedSymbol(element.symbol)} onAdd={add}/></section>
    <section className="workspace card" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();add(event.dataTransfer.getData('text/plain'));}}><div className="section-title"><div><span className="eyebrow">BONDING WORKSPACE</span><h2>Build a reaction</h2></div><div className={`timer ${seconds<=5?'critical':seconds<=10?'warning':''}`} aria-label={`${seconds} seconds remaining`}>{seconds}s</div></div>
      <div className={`atom-stage ${phase==='SUCCESS'?'product-stage':''}`} role="region" aria-label="Interactive atom simulation workspace">{!atoms.length&&<div className="stage-placeholder">Select an element from the table or drag it here.<br/>Tap/click selection works on every device.</div>}{phase!=='SUCCESS'&&atoms.map((atom,i)=><AtomView atom={atom} index={i} total={atoms.length} phase={phase} angle={orbitalAngle+i*26} key={atom.id}/>)}{phase==='SUCCESS'&&<CompoundVisual result={result} lewis={lewis}/>}</div>
      <p className="canvas-note">{phase==='ELECTRON_TRANSFER'?'Electron transfer is shown as an educational model.':phase==='ELECTRON_SHARING'?'Highlighted particles form shared electron pairs.':phase==='SUCCESS'?'The validated reactants are now represented as one stable compound.':'Drag elements here, or click a periodic-table tile to add it.'}</p><div className="tray">{atoms.length?atoms.map((a,i)=><button key={a.id} disabled={phase==='SUCCESS'} onClick={()=>setAtoms(all=>all.filter((_,n)=>n!==i))} aria-label={`Remove ${a.element.name}`}>{a.element.symbol} <span>×</span></button>):<span>Atoms will appear here</span>}</div><div className="controls">{phase==="SUCCESS"&&<button className="secondary" onClick={()=>setShowBond(true)}>Explore bonds</button>}<button className="secondary" onClick={reset}>Reset</button><button className="primary" disabled={!atoms.length||reacting||phase==='VALIDATING'||phase==='SUCCESS'} onClick={analyze}>Analyze &amp; bond</button></div></section>
    <aside className="analysis card"><span className="eyebrow">REACTION ANALYSIS · {phase.replaceAll('_',' ')}</span><h2>{result.formula?formatChemicalFormula(result.formula):'Ready to explore'}</h2><div className={result.valid&&phase==='SUCCESS'?'status success':'status'}>{result.feedback ?? 'Awaiting analysis.'}</div>{result.valid&&<><dl><dt>Compound</dt><dd>{result.compoundName}</dd><dt>Bond model</dt><dd>{result.bondType}</dd><dt>Geometry</dt><dd>{result.geometry}</dd><dt>Polarity</dt><dd>{result.polarity}</dd></dl><div className="lewis"><strong>Lewis structure</strong><small>{lewis?.supported ? `${lewis.structure.totalValenceElectrons} valence electrons · ${lewis.structure.atoms.reduce((sum, atom) => sum + atom.lonePairCount, 0)} lone pairs` : lewis?.reason}</small></div></>}<OctetPanel atoms={atoms} phase={phase} valid={result.valid&&phase==='SUCCESS'} graph={result.graph}/><div className="suggestions"><strong>Compatible suggestions</strong><p>{atoms.length?getCompatibleElements(atoms[0].element.symbol).slice(0,8).join(' · '):'Add an atom to see guided partners.'}</p></div><div className="history"><strong>Reaction book</strong>{history.length?history.map(f=><span key={f}>{formatChemicalFormula(f)}</span>):<p>No completed reactions yet.</p>}</div></aside>
    {phase==='TIME_EXPIRED'&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Time expired"><div className="modal"><button className="close" onClick={continueAttempt} aria-label="Close">×</button><h2>Time expired</h2><p>Reset the workspace or continue building your reactant group.</p><button className="primary" onClick={continueAttempt}>Continue</button> <button className="secondary" onClick={reset}>Reset</button></div></div>}
    {showBond&&result.valid&&<div className="overlay" role="dialog" aria-modal="true" aria-label="Bond explorer"><div className={`modal ${tab==='Shell Sim'?'modal-shell':''}`}><button className="close" onClick={()=>setShowBond(false)} aria-label="Close">×</button><span className="eyebrow">BOND EXPLORER</span><h1>{formatChemicalFormula(result.formula!)}</h1><h2>{result.compoundName}</h2><div className="tabs">{(['Compound','Shell Sim','Lewis','How?','Analysis'] as const).map(item=><button key={item} className={tab===item?'active':''} onClick={()=>setTab(item)}>{item}</button>)}</div>{tab==='Compound'&&<p><b>{result.bondType}</b> · {result.geometry}<br/>{result.polarity}<br/><br/>{result.explanation}</p>}{tab==='Shell Sim'&&<ShellSimulation result={result} />}{tab==='Lewis'&&<LewisStructureView result={lewis} geometry={result.geometry} />}{tab==='How?'&&<p>{result.explanation}</p>}{tab==='Analysis'&&<p>Bond type: {result.bondType}<br/>Geometry: {result.geometry}<br/>Molecular polarity: {result.polarity}<br/>Valence electrons: {lewis.supported ? lewis.structure.totalValenceElectrons : 'Unavailable'}</p>}</div></div>}</main>;
}
