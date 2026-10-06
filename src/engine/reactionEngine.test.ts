import { describe, expect, it } from 'vitest';
import { validateReaction } from './reactionEngine';
import { createShellSimulationPlan } from './shellSimulation';
describe('reaction engine',()=>{
  it('forms water from exact stoichiometry',()=>expect(validateReaction(['H','H','O']).formula).toBe('H2O'));
  it('keeps partial water incomplete',()=>expect(validateReaction(['H','O']).missingAtoms).toEqual(['H']));
  it('forms lithium oxide only from needed atoms',()=>expect(validateReaction(['Li','Li','O']).formula).toBe('Li2O'));
  it('does not invent carbon monoxide',()=>expect(validateReaction(['C','O']).valid).toBe(false));
  it('models carbon dioxide as nonpolar overall',()=>expect(validateReaction(['C','O','O']).polarity).toContain('nonpolar'));
  it('models nitrogen with a triple bond',()=>expect(validateReaction(['N','N']).animationType).toBe('triple-bond'));
  it('rejects empty selections',()=>expect(validateReaction([]).valid).toBe(false));
  it('derives the water formula from a valence-satisfied graph',()=>{const result=validateReaction(['H','H','O']);expect(result.graph?.formula).toBe('H2O');expect(result.graph?.nodes.every(n=>n.currentBondOrder===n.targetValence)).toBe(true);expect(result.graph?.edges).toHaveLength(2);});
  it('derives multiple covalent bond orders from constraints',()=>{const result=validateReaction(['C','O','O']);expect(result.graph?.formula).toBe('CO2');expect(result.graph?.edges.map(e=>e.bondOrder)).toEqual([2,2]);});
  it('records ionic charges and electron transfer on graph edges',()=>{const result=validateReaction(['Na','Cl']);expect(result.graph?.nodes.map(n=>n.formalCharge)).toEqual([1,-1]);expect(result.graph?.edges[0].electronBehavior).toBe('transfer');expect(result.graph?.edges[0].transferredElectrons).toBe(1);});
  it('does not double-count transfer across multiple ionic edges',()=>{const result=validateReaction(['Al','Al','O','O','O']);expect(result.graph?.edges.reduce((sum,e)=>sum+(e.transferredElectrons??0),0)).toBe(6);});
  it('supports hydrogen-only and hydrogen-containing covalent graphs',()=>{
    for(const [atoms,formula,bonds] of [[['H','H'],'H2',1],[['H','H','O'],'H2O',2],[['C','H','H','H','H'],'CH4',4],[['N','H','H','H'],'NH3',3],[['H','F'],'HF',1],[['H','Cl'],'HCl',1]] as const){
      const result=validateReaction([...atoms]);expect(result.valid).toBe(true);expect(result.formula).toBe(formula);expect(result.bondType).toMatch(/covalent/);expect(result.graph?.edges).toHaveLength(bonds);expect(result.graph?.edges.every(e=>e.electronBehavior==='sharing'&&e.bondOrder===1)).toBe(true);
    }
  });
  it('canonicalizes formulas independent of reactant ordering',()=>{
    for(const atoms of [['H','O','H'],['O','H','H'],['H','H','O']])expect(validateReaction(atoms).formula).toBe('H2O');
    for(const atoms of [['N','H','H','H'],['H','N','H','H'],['H','H','N','H'],['H','H','H','N']])expect(validateReaction(atoms).formula).toBe('NH3');
    for(const atoms of [['Al','Al','O','O','O'],['O','Al','O','Al','O'],['O','O','Al','Al','O']])expect(validateReaction(atoms).formula).toBe('Al2O3');
  });
  it('keeps ionic transfer and covalent bond-order contribution separate',()=>{
    const mg=validateReaction(['Mg','O']);expect(mg.valid).toBe(true);expect(mg.graph?.nodes.map(n=>n.formalCharge)).toEqual([2,-2]);expect(mg.graph?.edges.reduce((s,e)=>s+(e.transferredElectrons??0),0)).toBe(2);expect(mg.graph?.edges.reduce((s,e)=>s+e.bondOrderContribution,0)).toBe(0);expect(mg.graph?.nodes.every(n=>n.currentBondOrder===0)).toBe(true);
    const al=validateReaction(['Al','Al','O','O','O']);expect(al.formula).toBe('Al2O3');expect(al.graph?.nodes.reduce((s,n)=>s+n.formalCharge,0)).toBe(0);expect(al.graph?.edges.reduce((s,e)=>s+(e.transferredElectrons??0),0)).toBe(6);
  });
  it('builds shell transfer and sharing steps from graph edge counts',()=>{
    const mg=createShellSimulationPlan(validateReaction(['Mg','O']));expect(mg.supported&&mg.steps.filter(s=>s.kind==='transfer')).toHaveLength(2);
    const al=createShellSimulationPlan(validateReaction(['Al','Al','O','O','O']));expect(al.supported&&al.steps.filter(s=>s.kind==='transfer')).toHaveLength(6);
    const n2=createShellSimulationPlan(validateReaction(['N','N']));expect(n2.supported&&n2.steps.filter(s=>s.kind==='sharing')).toHaveLength(3);
  });
  it('rejects unsupported and incomplete selections',()=>{expect(validateReaction(['H','O']).valid).toBe(false);expect(validateReaction(['C','O']).valid).toBe(false);expect(validateReaction([]).valid).toBe(false);expect(validateReaction(['Fe','O']).valid).toBe(false);});
  it('independently checks connected graph structure, formulas, and covalent valence',()=>{
    const cases=[['H','H'],['H','H','O'],['C','O','O'],['C','H','H','H','H'],['N','H','H','H'],['N','N'],['O','O'],['H','F'],['H','Cl'],['Na','Cl'],['Mg','O'],['Al','Al','O','O','O']];
    for(const atoms of cases){const r=validateReaction(atoms);expect(r.valid,atoms.join('+')).toBe(true);const g=r.graph!;expect(g.nodes.reduce((m,n)=>(m[n.element.symbol]=(m[n.element.symbol]??0)+1,m),{} as Record<string,number>)).toEqual(atoms.reduce((m,s)=>(m[s]=(m[s]??0)+1,m),{} as Record<string,number>));expect(g.formula).toBe(r.formula);
      const seen=new Set([g.nodes[0].id]),queue=[g.nodes[0].id];while(queue.length){const id=queue.pop()!;for(const e of g.edges){const next=e.sourceAtomId===id?e.targetAtomId:e.targetAtomId===id?e.sourceAtomId:undefined;if(next&&!seen.has(next)){seen.add(next);queue.push(next);}}}expect(seen.size).toBe(g.nodes.length);
      if(r.bondType==='ionic'){expect(g.nodes.reduce((sum,n)=>sum+n.formalCharge,0)).toBe(0);expect(g.nodes.reduce((sum,n)=>sum+n.transferredElectronsOut,0)).toBe(g.edges.reduce((sum,e)=>sum+(e.transferredElectrons??0),0));expect(g.nodes.reduce((sum,n)=>sum+n.transferredElectronsIn,0)).toBe(g.edges.reduce((sum,e)=>sum+(e.transferredElectrons??0),0));expect(g.edges.every(e=>e.bondOrderContribution===0)).toBe(true);}
      else for(const node of g.nodes)expect(g.edges.filter(e=>e.sourceAtomId===node.id||e.targetAtomId===node.id).reduce((sum,e)=>sum+e.bondOrder,0)).toBe(node.targetValence);
    }
  });
  it('is deterministic across 20 runs and invariant to atom order',()=>{
    const signature=(atoms:string[])=>{const r=validateReaction(atoms),g=r.graph!;return JSON.stringify({formula:r.formula,bonds:g.edges.map(e=>{const a=g.nodes.find(n=>n.id===e.sourceAtomId)!.element.symbol,b=g.nodes.find(n=>n.id===e.targetAtomId)!.element.symbol;return[a,b].sort().join('-')+`:${e.bondOrder}:${e.bondType}:${e.electronBehavior}:${e.transferredElectrons??0}`;}).sort(),charges:g.nodes.map(n=>`${n.element.symbol}:${n.formalCharge}`).sort()});};
    for(const atoms of [['H','H','O'],['N','H','H','H'],['Al','Al','O','O','O'],['C','O','O']]){const first=signature(atoms);for(let i=0;i<20;i++)expect(signature([...atoms])).toBe(first);}
    const permutations=[['H','H','O'],['N','H','H','H'],['Al','Al','O','O','O'],['C','O','O']];for(const atoms of permutations){const expected=signature(atoms);const reversed=[...atoms].reverse();expect(signature(reversed)).toBe(expected);}
  });
});
