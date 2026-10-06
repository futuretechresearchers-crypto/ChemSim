export { buildLewisStructure } from './lewisStructureDerivation';
export type { LewisAtom, LewisBond, LewisStructure, LewisStructureResult } from './lewisStructureDerivation';
/* Archived graph-less Lewis output; active calls now derive from ReactionResult in lewisStructureDerivation.ts.
import type { AtomNode, MolecularGraph, ReactionResult } from '../types/chemistry';
export interface LewisData { formula:string; totalValenceElectrons:number; bonds:string; note:string; }
export function buildLewisStructure(symbols:string[], formula:string, bondOrder=1, graph?:MolecularGraph):LewisData {
  const total = symbols.reduce((sum, symbol) => sum + (elementBySymbol(symbol)?.valenceElectrons ?? 0), 0);
  if(graph?.valid){
    const bonds=graph.edges.map(edge=>{
      const source=graph.nodes.find(node=>node.id===edge.sourceAtomId)!;
      const target=graph.nodes.find(node=>node.id===edge.targetAtomId)!;
      if(edge.bondType==='ionic') return `${source.element.symbol}${source.formalCharge>0?'+':'−'}  ⋯  ${target.element.symbol}${target.formalCharge<0?'−':'+'} (${edge.transferredElectrons} e⁻ transferred)`;
      return `${source.element.symbol}${edge.bondOrder===3?'≡':edge.bondOrder===2?'=':'—'}${target.element.symbol}`;
    }).join('\n');
    return {formula,totalValenceElectrons:total,bonds,note:'Bond lines come from the solved graph; lone pairs are omitted in this simplified model.'};
  }
  const bonds = ({ H2:'H—H', O2:'O=O', N2:'N≡N', Cl2:'Cl—Cl', H2O:'H—O—H', CO2:'O=C=O', NH3:'  H\n  |\nH—N—H', CH4:'  H\n  |\nH—C—H\n  |\n  H' } as Record<string,string>)[formula] ?? 'Lewis model available after selecting a supported compound.';
  return { formula, totalValenceElectrons:total, bonds, note:'Dots and bonds are a simplified octet-rule learning model.' };
}
*/
