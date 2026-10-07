import type { Edge } from '@xyflow/react';
import type { FlashNode } from '../types';

export function isTreeEdge(edge: Edge) {
  return edge.data?.kind ? edge.data.kind === 'tree' : !edge.id.startsWith('rel-') && edge.type !== 'bezier';
}

export function getDescendants(id: string, edges: Edge[]): string[] {
  const seen = new Set([id]);
  const adjacency = new Map<string, string[]>();
  edges.filter(isTreeEdge).forEach(e => adjacency.set(e.source, [...(adjacency.get(e.source) || []), e.target]));
  const stack = [...(adjacency.get(id) || [])];
  while (stack.length) {
    const child = stack.pop()!;
    if (seen.has(child)) continue;
    seen.add(child);
    stack.push(...(adjacency.get(child) || []));
  }
  seen.delete(id);
  return [...seen];
}

export function canConnect(source: string, target: string, edges: Edge[]) {
  return source !== target && !edges.some(e => isTreeEdge(e) && e.target === target)
    && !getDescendants(target, edges).includes(source);
}

// Preserve non-tree relationships; turn invalid legacy tree links into relationships.
export function normalizeEdges(nodes: FlashNode[], edges: Edge[]): Edge[] {
  const ids = new Set(nodes.map(n => n.id));
  const accepted: Edge[] = [];
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target) || edgeIds.has(edge.id) || edge.source === edge.target) continue;
    edgeIds.add(edge.id);
    const kind = isTreeEdge(edge) && canConnect(edge.source, edge.target, accepted) ? 'tree' : edge.data?.kind === 'summary' ? 'summary' : 'relationship';
    accepted.push({ ...edge, data: { ...edge.data, kind }, type: kind === 'tree' ? 'smoothstep' : 'bezier' });
  }
  return accepted;
}

export function applyVisibility(nodes: FlashNode[], edges: Edge[]) {
  const hidden = new Set<string>();
  nodes.filter(n => n.data.isCollapsed).forEach(n => getDescendants(n.id, edges).forEach(id => hidden.add(id)));
  return {
    nodes: nodes.map(n => ({ ...n, hidden: hidden.has(n.id) })),
    edges: edges.map(e => ({ ...e, hidden: hidden.has(e.source) || hidden.has(e.target) })),
  };
}

export function parseGraph(value: unknown): { nodes: FlashNode[]; edges: Edge[] } {
  if (!value || typeof value !== 'object') throw new Error('导图格式无效');
  const { nodes, edges } = value as { nodes: unknown; edges: unknown };
  if (!Array.isArray(nodes) || !Array.isArray(edges) || nodes.length > 2000 || edges.length > 5000) throw new Error('导图格式或大小无效');
  const ids = new Set<string>();
  const cleanNodes: FlashNode[] = nodes.map(n => {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || !n.position || !Number.isFinite(n.position.x) || !Number.isFinite(n.position.y) || !n.data || typeof n.data !== 'object') throw new Error('节点格式无效或 ID 重复');
    ids.add(n.id);
    for (const field of ['label', 'question', 'answer', 'sourceExcerpt']) {
      if (n.data[field] !== undefined && typeof n.data[field] !== 'string') throw new Error('节点内容必须为文字');
    }
    for (const field of ['depth', 'srsLevel', 'nextReviewDate']) {
      if (n.data[field] !== undefined && (!Number.isFinite(n.data[field]) || n.data[field] < 0)) throw new Error('学习状态格式无效');
    }
    for (const field of ['reviewEnabled', 'isSuspended', 'isCollapsed', 'isRoot']) {
      if (n.data[field] !== undefined && typeof n.data[field] !== 'boolean') throw new Error('节点状态格式无效');
    }
    if (n.data.targetIds !== undefined && (!Array.isArray(n.data.targetIds) || n.data.targetIds.some((id: unknown) => typeof id !== 'string'))) throw new Error('边界节点格式无效');
    if (n.data.reviewHistory !== undefined && (!Array.isArray(n.data.reviewHistory) || n.data.reviewHistory.some((r: any) => !r || !Number.isFinite(r.at) || !Number.isFinite(r.nextReviewDate) || !['forgot','hard','good','easy'].includes(r.rating)))) throw new Error('复习记录格式无效');
    return { ...n, measured: undefined, type: n.type === 'boundary' ? 'boundary' : 'custom', selected: false, dragging: false, data: { ...n.data } };
  });
  if (edges.some(e => !e || typeof e.id !== 'string' || typeof e.source !== 'string' || typeof e.target !== 'string')) throw new Error('连线格式无效');
  return applyVisibility(cleanNodes, normalizeEdges(cleanNodes, edges));
}
