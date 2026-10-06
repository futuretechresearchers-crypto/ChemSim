export type BondType = 'ionic' | 'nonpolar covalent' | 'polar covalent' | 'metallic';
export interface ElementData {
  atomicNumber:number; symbol:string; name:string; category:string; period:number; group?:number;
  atomicMass:number; valenceElectrons:number; electronConfiguration:string; electronegativity?:number;
  oxidationStates:number[]; shells:number[];
}
export interface Atom { id:string; element:ElementData; x:number; y:number; state:'idle'|'reacting'|'product'; }
export interface ReactionResult {
  valid:boolean; reactants:string[]; products:string[]; formula?:string; compoundName?:string;
  bondType?:BondType; bondOrders?:number[]; atomIndices?:number[]; geometry?:string; polarity?:string;
  explanation?:string; animationType?:string; missingAtoms?:string[]; feedback?:string;
  graph?: MolecularGraph;
}

export interface AtomNode {
  id: string;
  element: ElementData;
  /** Covalent valence target. Ionic nodes use charge/transfer fields instead. */
  targetValence?: number;
  /** Sum of incident bondOrderContribution values; ionic transfer is not a bond order. */
  currentBondOrder: number;
  formalCharge: number;
  transferredElectronsIn: number;
  transferredElectronsOut: number;
}
export interface BondEdge {
  id: string;
  sourceAtomId: string;
  targetAtomId: string;
  bondType: 'ionic' | 'covalent';
  /** Covalent order; ionic edges use 1 as a single topological link. */
  bondOrder: 1 | 2 | 3;
  /** Covalent edges contribute their order; ionic edges contribute zero. */
  bondOrderContribution: number;
  electronBehavior: 'transfer' | 'sharing';
  transferredElectrons?: number;
  sharedElectrons?: number;
}
export interface MolecularGraph {
  nodes: AtomNode[];
  edges: BondEdge[];
  formula: string;
  valid: boolean;
  unsatisfiedAtoms: string[];
  explanation: string[];
}
