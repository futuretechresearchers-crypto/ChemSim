import type { BondType, ReactionResult, MolecularGraph, BondEdge, AtomNode } from '../types/chemistry';
import { elementBySymbol } from '../data/elementData';
import { getGeometry } from './geometryEngine';
import { getPolarity } from './polarityEngine';

type Definition = { id:string; formula:string; name:string; atoms:Record<string,number>; bondType:BondType; order:number; explanation:string };
const seed: Array<[string,string,Record<string,number>,BondType,number]> = [
  ['H2','Hydrogen', {H:2},'nonpolar covalent',1], ['O2','Oxygen', {O:2},'nonpolar covalent',2], ['N2','Nitrogen',{N:2},'nonpolar covalent',3], ['Cl2','Chlorine',{Cl:2},'nonpolar covalent',1], ['F2','Fluorine',{F:2},'nonpolar covalent',1], ['Br2','Bromine',{Br:2},'nonpolar covalent',1], ['I2','Iodine',{I:2},'nonpolar covalent',1],
  ['H2O','Water',{H:2,O:1},'polar covalent',1], ['CO2','Carbon dioxide',{C:1,O:2},'polar covalent',2], ['NH3','Ammonia',{N:1,H:3},'polar covalent',1], ['CH4','Methane',{C:1,H:4},'nonpolar covalent',1], ['HCl','Hydrogen chloride',{H:1,Cl:1},'polar covalent',1], ['HF','Hydrogen fluoride',{H:1,F:1},'polar covalent',1], ['HI','Hydrogen iodide',{H:1,I:1},'polar covalent',1], ['H2S','Hydrogen sulfide',{H:2,S:1},'polar covalent',1],
  ['NaCl','Sodium chloride',{Na:1,Cl:1},'ionic',1], ['LiCl','Lithium chloride',{Li:1,Cl:1},'ionic',1], ['KBr','Potassium bromide',{K:1,Br:1},'ionic',1], ['MgO','Magnesium oxide',{Mg:1,O:1},'ionic',1], ['MgCl2','Magnesium chloride',{Mg:1,Cl:2},'ionic',1], ['CaCl2','Calcium chloride',{Ca:1,Cl:2},'ionic',1], ['Li2O','Lithium oxide',{Li:2,O:1},'ionic',1], ['Na2O','Sodium oxide',{Na:2,O:1},'ionic',1], ['K2O','Potassium oxide',{K:2,O:1},'ionic',1],
  ['AlCl3','Aluminium chloride',{Al:1,Cl:3},'ionic',1], ['Al2O3','Aluminium oxide',{Al:2,O:3},'ionic',1], ['FeCl3','Iron(III) chloride',{Fe:1,Cl:3},'ionic',1], ['Fe2O3','Iron(III) oxide',{Fe:2,O:3},'ionic',1], ['ZnO','Zinc oxide',{Zn:1,O:1},'ionic',1], ['SiO2','Silicon dioxide',{Si:1,O:2},'polar covalent',2], ['SO2','Sulfur dioxide',{S:1,O:2},'polar covalent',2], ['SO3','Sulfur trioxide',{S:1,O:3},'polar covalent',2], ['NO2','Nitrogen dioxide',{N:1,O:2},'polar covalent',2], ['N2O','Dinitrogen monoxide',{N:2,O:1},'polar covalent',2],
];
const defs:Definition[] = seed.map(([formula,name,atoms,bondType,order]) => ({ id:formula, formula, name, atoms, bondType, order, explanation: bondType === 'ionic' ? 'An electron-transfer model: ions attract after electrons move to complete a stable outer shell.' : 'A shared-electron model: the bond forms as atoms share valence electrons.' }));
export const supportedReactions = () => defs.map(({ formula, name, atoms, bondType }) => ({ formula, name, atoms: { ...atoms }, bondType }));
export const generateReactionKey = (symbols:string[]) => [...symbols].sort().join('+');
const includes = (have:Record<string,number>, need:Record<string,number>) => Object.entries(need).every(([s,n]) => (have[s] ?? 0) >= n);
function counts(symbols:string[]) { return symbols.reduce<Record<string,number>>((all,s) => ({...all,[s]:(all[s] ?? 0)+1}), {}); }
export function validateReaction(symbols:string[]):ReactionResult {
  if (!symbols.length) return {valid:false,reactants:[],products:[],feedback:'Add elements to begin the laboratory simulation.'};
  const present=counts(symbols);
  if (symbols.some(s=>!elementBySymbol(s))) return {valid:false,reactants:symbols,products:[],feedback:'The selection contains an unknown element.'};
  const graph=solveBondGraph(symbols);
  if(!graph) {
    const candidate=defs.filter(d=>Object.entries(present).every(([s,n])=>(d.atoms[s]??0)>=n)).sort((a,b)=>Object.values(a.atoms).reduce((x,y)=>x+y,0)-Object.values(b.atoms).reduce((x,y)=>x+y,0))[0];
    if(candidate){const missing:string[]=[];for(const [s,n] of Object.entries(candidate.atoms))for(let i=present[s]??0;i<n;i++)missing.push(s);if(missing.length)return {valid:false,reactants:symbols,products:[],missingAtoms:missing,feedback:`Incomplete: add ${missing.join(' + ')} to form ${candidate.formula}.`};}
    return {valid:false,reactants:symbols,products:[],feedback:'No supported valence-satisfying bond graph was found for this exact selection. The model supports common main-group covalent compounds and simple ionic salts.'};
  }
  const match=defs.find(d=>d.formula===graph.formula);
  if(!match) return {valid:false,reactants:symbols,products:[],graph,feedback:`A valence-satisfying graph was found (${graph.formula}), but compound metadata is not yet available; this result is not presented as a validated product.`};
  return {valid:true,reactants:symbols,products:[graph.formula],formula:graph.formula,compoundName:match.name,bondType:match.bondType,bondOrders:graph.edges.map(e=>e.bondOrder),atomIndices:symbols.map((_,i)=>i),geometry:getGeometry(graph.formula),polarity:getPolarity(graph.formula,match.bondType),explanation:`${graph.explanation.join(' ')} ${match.explanation}`,animationType:match.bondType==='ionic'?'electron-transfer':graph.edges.some(e=>e.bondOrder===3)?'triple-bond':graph.edges.some(e=>e.bondOrder===2)?'double-bond':'electron-sharing',graph};
}

const isMetal=(e:NonNullable<ReturnType<typeof elementBySymbol>>)=>['alkali metal','alkaline earth metal','post-transition metal','transition metal','lanthanide','actinide'].includes(e.category);
const ionicCharge=(e:NonNullable<ReturnType<typeof elementBySymbol>>):number|undefined=>{
  if(e.category==='alkali metal' && e.symbol!=='H')return 1; if(e.category==='alkaline earth metal')return 2; if(e.group===13 && e.symbol==='Al')return 3;
  if(e.group===17)return -1; if(e.group===16 && ['O','S'].includes(e.symbol))return -2; if(e.group===15 && e.symbol==='N')return -3;
  return undefined;
};
const targetValence=(e:NonNullable<ReturnType<typeof elementBySymbol>>):number|undefined=>{
  if(e.symbol==='H')return 1;
  if(e.group===14 && ['C','Si'].includes(e.symbol))return 4;
  if(e.group===15 && ['N','P'].includes(e.symbol))return 3;
  if(e.group===16 && ['O','S'].includes(e.symbol))return 2;
  if(e.group===17 && ['F','Cl','Br','I'].includes(e.symbol))return 1;
  return undefined;
};
function formulaFor(symbols:string[]) {
  const c=counts(symbols); const syms=Object.keys(c);
  const order=syms.includes('C')?['C',...(syms.includes('H')?['H']:[]),...syms.filter(s=>s!=='C'&&s!=='H').sort()]:syms.some(s=>isMetal(elementBySymbol(s)!))?[...syms].sort((a,b)=>Number(!isMetal(elementBySymbol(a)!))-Number(!isMetal(elementBySymbol(b)!))||a.localeCompare(b)):syms.includes('N')&&syms.includes('H')?['N','H',...syms.filter(s=>s!=='N'&&s!=='H').sort()]:syms.includes('H')?['H',...syms.filter(s=>s!=='H').sort((a,b)=>(elementBySymbol(a)!.electronegativity??0)-(elementBySymbol(b)!.electronegativity??0))]:[...syms].sort((a,b)=>(elementBySymbol(a)!.electronegativity??0)-(elementBySymbol(b)!.electronegativity??0));
  return order.map(s=>s+(c[s]>1?c[s]:'' )).join('');
}
function isConnected(ids:string[],edges:BondEdge[]){if(!ids.length)return false;const seen=new Set([ids[0]]),queue=[ids[0]];while(queue.length){const id=queue.pop()!;for(const e of edges){const next=e.sourceAtomId===id?e.targetAtomId:e.targetAtomId===id?e.sourceAtomId:undefined;if(next&&!seen.has(next)){seen.add(next);queue.push(next);}}}return seen.size===ids.length;}
function solveBondGraph(symbols:string[]):MolecularGraph|undefined {
  const es=symbols.map(s=>elementBySymbol(s)!); const nodes:AtomNode[]=es.map((element,i)=>({id:`a${i+1}`,element,targetValence:targetValence(element)??0,currentBondOrder:0,formalCharge:0,transferredElectronsIn:0,transferredElectronsOut:0}));
  const metals=nodes.filter(n=>isMetal(n.element)); const nonmetals=nodes.filter(n=>!isMetal(n.element));
  if(metals.length && nonmetals.length && metals.length+nonmetals.length===nodes.length){
    const charges=nodes.map(n=>ionicCharge(n.element)); if(charges.some(c=>c===undefined))return;
    const total=charges.reduce((a,b)=>a!+b!,0); if(total!==0)return;
    const edges:BondEdge[]=[]; let transfers=0;
    const donorCapacity=new Map<string,number>(),acceptorCapacity=new Map<string,number>();
    for(const n of nodes){const q=ionicCharge(n.element)!; n.formalCharge=q; n.targetValence=undefined; if(q>0){donorCapacity.set(n.id,q);transfers+=q;}else acceptorCapacity.set(n.id,Math.abs(q));}
    metals.forEach(m=>nonmetals.forEach(a=>{
      const moved=Math.min(donorCapacity.get(m.id)??0,acceptorCapacity.get(a.id)??0);
      donorCapacity.set(m.id,(donorCapacity.get(m.id)??0)-moved);acceptorCapacity.set(a.id,(acceptorCapacity.get(a.id)??0)-moved);
      m.transferredElectronsOut+=moved; a.transferredElectronsIn+=moved;
      if(moved>0)edges.push({id:`${m.id}-${a.id}`,sourceAtomId:m.id,targetAtomId:a.id,bondType:'ionic',bondOrder:1,bondOrderContribution:0,electronBehavior:'transfer',transferredElectrons:moved});
    }));
    if(!isConnected(nodes.map(n=>n.id),edges))return;
    return {nodes,edges,formula:formulaFor(symbols),valid:true,unsatisfiedAtoms:[],explanation:[`${transfers} electron${transfers===1?'':'s'} transferred from metal atoms to nonmetal atoms; ionic links have zero covalent bond-order contribution and ion charges sum to zero.`]};
  }
  if(nodes.length>8||nodes.some(n=>!targetValence(n.element))||nodes.some(n=>isMetal(n.element)))return;
  const remaining=nodes.map(n=>targetValence(n.element)!); const pairs:[number,number][]=[]; for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)pairs.push([i,j]);
  const orders:number[]=[]; let solved=false;
  const search=(k:number):boolean=>{ if(k===pairs.length)return remaining.every(v=>v===0); const [i,j]=pairs[k]; for(let o=Math.min(3,remaining[i],remaining[j]);o>=0;o--){remaining[i]-=o;remaining[j]-=o;orders[k]=o;if(search(k+1))return true;remaining[i]+=o;remaining[j]+=o;} return false; };
  solved=search(0); if(!solved)return;
  const edges:BondEdge[]=[]; pairs.forEach(([i,j],k)=>{const o=orders[k];if(o){nodes[i].currentBondOrder+=o;nodes[j].currentBondOrder+=o;edges.push({id:`${nodes[i].id}-${nodes[j].id}`,sourceAtomId:nodes[i].id,targetAtomId:nodes[j].id,bondType:'covalent',bondOrder:o as 1|2|3,bondOrderContribution:o,electronBehavior:'sharing',sharedElectrons:o*2});}});
  if(!isConnected(nodes.map(n=>n.id),edges))return;
  const covalentValence=nodes.reduce((sum,n)=>sum+n.currentBondOrder,0);
  return {nodes,edges,formula:formulaFor(symbols),valid:true,unsatisfiedAtoms:[],explanation:[`A graph search connected ${nodes.length} atom nodes with ${edges.length} bond edges; all target valences are satisfied (${covalentValence} bond-order units).` ]};
}
export const checkReaction = validateReaction;
export function checkReactionMulti(symbols:string[]) { return validateReaction(symbols); }
export function getCompatibleElements(symbol:string) { return defs.filter(d => symbol in d.atoms).flatMap(d => Object.keys(d.atoms)).filter(s=>s!==symbol).filter((s,i,a)=>a.indexOf(s)===i); }
