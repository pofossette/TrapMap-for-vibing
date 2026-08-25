export type G6Node = {
  id: string;
  label: string;
  kind: string; // 'trap' | 'cue' | 'tool' | 'environment' | 'prerequisite' | 'mitigation' | 'boundary' | 'artifact' | 'profile' | 'capsule' | 'script'
  pinned?: boolean;
  x?: number;
  y?: number;
  [key: string]: any;
};

export type G6Edge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind?: string;
  [key: string]: any;
};

export type GraphDataResponse = {
  nodes: G6Node[];
  edges: G6Edge[];
};

export type TrapNeighborhoodDepth = '1' | '2' | 'all';
