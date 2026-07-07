import { Edge, Node } from '@xyflow/react';
import { flextree } from 'd3-flextree';

export const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const visibleNodes = nodes.filter(n => !n.hidden);
  const hiddenNodes = nodes.filter(n => n.hidden);
  
  const treeNodes = visibleNodes.filter(n => n.type !== 'boundary');
  const boundaryNodes = visibleNodes.filter(n => n.type === 'boundary');

  const visibleEdges = edges.filter(e => !e.hidden);
  const hiddenEdges = edges.filter(e => e.hidden);

  // 1. Build adjacency list and find roots
  const adjacency: Record<string, string[]> = {};
  const incomingCount: Record<string, number> = {};
  
  treeNodes.forEach(n => {
    adjacency[n.id] = [];
    incomingCount[n.id] = 0;
  });

  visibleEdges.forEach(e => {
    if (adjacency[e.source]) {
      adjacency[e.source].push(e.target);
    }
    if (incomingCount[e.target] !== undefined) {
      incomingCount[e.target]++;
    }
  });

  // Sort children by their current visual order to maintain stability
  // Except for new nodes (which might not have a position yet), we want them at the bottom
  Object.keys(adjacency).forEach(parentId => {
    adjacency[parentId].sort((a, b) => {
      const nodeA = treeNodes.find(n => n.id === a);
      const nodeB = treeNodes.find(n => n.id === b);
      if (!nodeA || !nodeB) return 0;
      
      // If one of the nodes is at (0,0) or (0,150) which are our default new node positions,
      // it should be placed at the bottom
      const isNewA = nodeA.position.x === 0 && nodeA.position.y === 0;
      const isNewB = nodeB.position.x === 0 && nodeB.position.y === 0;
      
      if (isNewA && !isNewB) return 1;
      if (!isNewA && isNewB) return -1;

      if (direction === 'LR') {
        return nodeA.position.y - nodeB.position.y;
      }
      return nodeA.position.x - nodeB.position.x;
    });
  });

  const roots = treeNodes.filter(n => incomingCount[n.id] === 0);

  // If there are cycles or disconnected components without roots, we need to handle them.
  // For simplicity, we'll just pick unvisited nodes as roots if needed.
  const visited = new Set<string>();
  const allRoots = [...roots];
  
  const markVisited = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    adjacency[id]?.forEach(markVisited);
  };
  
  allRoots.forEach(r => markVisited(r.id));
  
  treeNodes.forEach(n => {
    if (!visited.has(n.id)) {
      allRoots.push(n);
      markVisited(n.id);
    }
  });

  // Sort roots by visual order
  allRoots.sort((a, b) => {
    if (direction === 'LR') {
      return a.position.y - b.position.y;
    }
    return a.position.x - b.position.x;
  });

  const getSize = (depth: number) => {
    if (depth === 0) return { width: 320, height: 140 };
    if (depth === 1) return { width: 260, height: 110 };
    if (depth === 2) return { width: 200, height: 80 };
    return { width: 160, height: 60 };
  };

  // Build hierarchy for d3-flextree
  const buildHierarchy = (nodeId: string, depth: number, currentVisited: Set<string>): any => {
    const node = treeNodes.find(n => n.id === nodeId)!;
    const { width, height } = getSize(depth);
    
    const childrenIds = adjacency[nodeId] || [];
    const children = [];
    
    currentVisited.add(nodeId);
    
    for (const childId of childrenIds) {
      if (!currentVisited.has(childId)) {
        children.push(buildHierarchy(childId, depth + 1, new Set(currentVisited)));
      }
    }

    return {
      id: nodeId,
      size: direction === 'LR' ? [height, width + 100] : [width + 100, height],
      children: children.length > 0 ? children : null,
      node,
      depth
    };
  };

  const layout = flextree({
    spacing: 40, // spacing between nodes
  });

  let currentOffset = 0;
  const COMPONENT_GAP = 100;
  const allLayoutedTreeNodes: Node[] = [];

  allRoots.forEach(rootNode => {
    const hierarchy = buildHierarchy(rootNode.id, 0, new Set());
    const tree = layout.hierarchy(hierarchy);
    layout(tree);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const positionedNodes: Node[] = [];

    tree.each((tNode: any) => {
      const { id, node, depth } = tNode.data;
      const { width, height } = getSize(depth);
      
      // flextree uses x for the cross-axis and y for the main-axis
      // For LR: main-axis is horizontal (y in flextree), cross-axis is vertical (x in flextree)
      let x, y;
      if (direction === 'LR') {
        x = tNode.y;
        y = tNode.x - height / 2;
      } else {
        x = tNode.x - width / 2;
        y = tNode.y;
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + height);

      positionedNodes.push({
        ...node,
        targetPosition: direction === 'LR' ? 'left' : 'top',
        sourcePosition: direction === 'LR' ? 'right' : 'bottom',
        position: { x, y },
        data: {
          ...node.data,
          depth,
        }
      });
    });

    // Shift component to avoid overlap
    const shiftX = direction === 'TB' ? currentOffset - minX : 0;
    const shiftY = direction === 'LR' ? currentOffset - minY : 0;

    positionedNodes.forEach(node => {
      node.position.x += shiftX;
      node.position.y += shiftY;
    });

    if (direction === 'LR') {
      currentOffset += (maxY - minY) + COMPONENT_GAP;
    } else {
      currentOffset += (maxX - minX) + COMPONENT_GAP;
    }

    allLayoutedTreeNodes.push(...positionedNodes);
  });

  const layoutedBoundaryNodes = boundaryNodes.map((node) => {
    const targetIds = (node.data.targetIds as string[]) || [];
    const targets = allLayoutedTreeNodes.filter(n => targetIds.includes(n.id));
    
    if (targets.length === 0) return node;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    targets.forEach(t => {
      const { width, height } = getSize(t.data.depth as number || 0);
      minX = Math.min(minX, t.position.x);
      minY = Math.min(minY, t.position.y);
      maxX = Math.max(maxX, t.position.x + width);
      maxY = Math.max(maxY, t.position.y + height);
    });

    const padding = 20;
    return {
      ...node,
      position: { x: minX - padding, y: minY - padding },
      style: {
        ...node.style,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      }
    };
  });

  // Enforce smoothstep edges
  const newEdges = visibleEdges.map(e => ({
    ...e,
    type: e.type === 'bezier' ? 'bezier' : 'smoothstep',
  }));

  return { 
    nodes: [...layoutedBoundaryNodes, ...allLayoutedTreeNodes, ...hiddenNodes], 
    edges: [...newEdges, ...hiddenEdges] 
  };
};
