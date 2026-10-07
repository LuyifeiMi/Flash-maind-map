import type { Edge } from '@xyflow/react';
import type { FlashNode, MapItem } from '../types';
import { parseGraph } from './graph';

export function graphContent(nodes: FlashNode[], edges: Edge[]) {
  return {
    nodes: JSON.stringify(nodes.map(({ selected, dragging, measured, className, ...node }) => node)),
    edges: JSON.stringify(edges.map(({ selected, ...edge }) => edge)),
  };
}
export function mapContent(map: MapItem) { return JSON.stringify([map.title, map.nodes, map.edges]); }
export function readMap(map: MapItem) {
  return parseGraph({ nodes: JSON.parse(map.nodes), edges: JSON.parse(map.edges) });
}
export function readStoredMaps(storage: Pick<Storage, 'getItem' | 'setItem'>, key: string): MapItem[] {
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error();
    return parsed.map(map => {
      if (!map || typeof map.id !== 'string' || !map.id || typeof map.title !== 'string' || typeof map.updatedAt !== 'string') throw new Error();
      readMap(map);
      return map;
    });
  } catch {
    // Keep the original recoverable before replacing invalid data with a fresh map.
    storage.setItem(`${key}-recovery-${Date.now()}`, raw);
    return [];
  }
}
