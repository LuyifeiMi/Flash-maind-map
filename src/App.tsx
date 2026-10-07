/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  ConnectionLineType,
  Panel,
  Edge,
  MiniMap,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { FlashNode as Node, FlashNodeData, ReviewResult, MapItem } from './types';
import { AICancelledError, validateCards } from './lib/ai';
import { useAI } from './hooks/useAI';
import { AIKeyModal } from './components/AIKeyModal';
import { getDescendants, isTreeEdge, canConnect, applyVisibility, parseGraph } from './lib/graph';
import { isDue, isReviewable } from './lib/review';
import { useMapStorage } from './hooks/useMapStorage';
import { useDesktopImport } from './hooks/useDesktopImport';
import { Brain, Sparkles, Loader2, BookOpen, ChevronRight, Edit3, Book, Network, Trash2, PlusCircle, BrainCircuit, Download, Upload, KeyRound, Folder, FileText, Plus, PanelLeftClose, PanelLeftOpen, Check, X, RotateCw, Undo2, Redo2, Settings, Link, SquareDashed, Braces } from 'lucide-react';



import { CustomNode } from './components/CustomNode';
import { FlashcardModal } from './components/FlashcardModal';
import { EditNodeModal } from './components/EditNodeModal';
import { PreviewModal } from './components/PreviewModal';
import { ReviewOverlay } from './components/ReviewOverlay';
import { getLayoutedElements } from './lib/layout';
import { cn } from './lib/utils';
import { GraphContext } from './contexts/GraphContext';

const nodeTypes = {
  custom: CustomNode,
};

interface FlashcardData {
  id: string;
  parentId: string | null;
  label: string;
  question: string;
  answer: string;
  sourceExcerpt?: string;
}

const initialNodes: Node[] = [
  {
    id: 'intro',
    type: 'custom',
    position: { x: 0, y: 0 },
    data: {
      label: '欢迎使用 FlashMap',
      question: 'FlashMap 可以怎样帮助学习？',
      answer: '先用导图整理知识，再用闪卡主动回忆。复习状态会显示回导图，帮助你找到薄弱知识点。',
      isRoot: true,
      reviewEnabled: false,
      depth: 0
    },
  },
  {
    id: 'guide-create',
    type: 'custom',
    position: { x: 300, y: -100 },
    data: {
      label: '创建节点',
      question: '如何手动创建知识节点？',
      answer: '进入编辑模式后，Tab 添加子节点，Enter 添加同级节点，Shift+Tab 添加独立节点。双击节点可以编辑题目、答案和复习开关。',
      isRoot: false,
      depth: 1
    }
  },
  {
    id: 'guide-ai',
    type: 'custom',
    position: { x: 300, y: 100 },
    data: {
      label: 'AI 学习助手',
      question: '如何利用 AI 整理学习资料？',
      answer: '首次使用 AI 会提示输入 Gemini Key，密钥只交给本机服务。使用左侧面板生成导图，或选择节点扩展知识。不要在学习内容中填写密钥。',
      isRoot: false,
      depth: 1
    }
  }
];

const initialEdges: Edge[] = [
  { id: 'e-guide-1', source: 'intro', target: 'guide-create', type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } },
  { id: 'e-guide-2', source: 'intro', target: 'guide-ai', type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }
];
const beginnerGraph = getLayoutedElements(initialNodes, initialEdges);

const isDescendant = (descendantId: string, ancestorId: string, edges: Edge[]) => descendantId === ancestorId || getDescendants(ancestorId, edges).includes(descendantId);

export default function App() {
  const { screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(beginnerGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(beginnerGraph.edges);


  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeContent, setNewNodeContent] = useState('');
  const [isGeneratingNode, setIsGeneratingNode] = useState(false);

  const [mode, setMode] = useState<'study' | 'edit' | 'review' | 'select-topic'>('study');

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [showMiniMap, setShowMiniMap] = useState(() => {
    try { return localStorage.getItem('flashmap-show-minimap') !== 'false'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('flashmap-show-minimap', JSON.stringify(showMiniMap)); } catch { /* Maps report storage failures separately. */ }
  }, [showMiniMap]);


  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const [selectedNodeData, setSelectedNodeData] = useState<FlashNodeData | null>(null);
  const [isFlashcardOpen, setIsFlashcardOpen] = useState(false);

  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [mapToDelete, setMapToDelete] = useState<string | null>(null);

  // Preview State
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [pendingNodes, setPendingNodes] = useState<Node[]>([]);
  const [pendingEdges, setPendingEdges] = useState<Edge[]>([]);
  const [previewMode, setPreviewMode] = useState<'new' | 'expand'>('new');

  const [previewLayoutNodes, setPreviewLayoutNodes] = useState<Node[]>([]);
  const [previewLayoutEdges, setPreviewLayoutEdges] = useState<Edge[]>([]);
  const lastTargetIdRef = useRef<string | null>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarPos, setToolbarPos] = useState({ x: -1000, y: -1000 }); // Start off-screen
  const [isToolbarInitialized, setIsToolbarInitialized] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string } | null>(null);
  const [reviewSubtreeId, setReviewSubtreeId] = useState<string | null>(null);

  // Initialize toolbar position when it mounts
  useEffect(() => {
    if (mode !== 'edit') {
      setIsToolbarInitialized(false);
      setToolbarPos({ x: -1000, y: -1000 });
      return;
    }

    const checkAndInit = () => {
      if (toolbarRef.current && toolbarRef.current.parentElement) {
        const container = toolbarRef.current.parentElement;
        const containerRect = container.getBoundingClientRect();
        const toolbarRect = toolbarRef.current.getBoundingClientRect();

        if (toolbarRect.width > 0) {
          setToolbarPos({
            x: (containerRect.width - toolbarRect.width) / 2,
            y: containerRect.height - toolbarRect.height - 24
          });
          setIsToolbarInitialized(true);
          return true;
        }
      }
      return false;
    };

    // Try immediately
    if (checkAndInit()) return;

    // If not ready (e.g., waiting for AnimatePresence exit), poll until it is
    const interval = setInterval(() => {
      if (checkAndInit()) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [mode]);

  // Keep toolbar in bounds on resize
  useEffect(() => {
    if (!isToolbarInitialized || mode !== 'edit' || !toolbarRef.current || !toolbarRef.current.parentElement) return;

    const handleResize = () => {
      const container = toolbarRef.current?.parentElement;
      const toolbar = toolbarRef.current;
      if (!container || !toolbar) return;

      const containerRect = container.getBoundingClientRect();
      const toolbarRect = toolbar.getBoundingClientRect();

      setToolbarPos(prev => {
        const paddingX = 24;
        const paddingBottom = 24;
        const paddingTop = 80; // Extra padding at top to avoid sidebar toggle and mode switcher

        const maxX = containerRect.width - toolbarRect.width - paddingX;
        const maxY = containerRect.height - toolbarRect.height - paddingBottom;

        return {
          x: Math.max(paddingX, Math.min(prev.x, maxX)),
          y: Math.max(paddingTop, Math.min(prev.y, maxY))
        };
      });
    };

    window.addEventListener('resize', handleResize);
    // Also observe the container for size changes (e.g. sidebar toggle)
    const resizeObserver = new ResizeObserver(handleResize);
    if (toolbarRef.current.parentElement) {
      resizeObserver.observe(toolbarRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [isToolbarInitialized, mode]);

  const handleDragEnd = (e: any, info: any) => {
    const toolbarEl = toolbarRef.current;
    const containerEl = toolbarEl?.parentElement;
    if (!toolbarEl || !containerEl) return;

    const containerRect = containerEl.getBoundingClientRect();
    const toolbarRect = toolbarEl.getBoundingClientRect();

    // Current position relative to container
    const currentX = toolbarRect.left - containerRect.left;
    const currentY = toolbarRect.top - containerRect.top;

    const paddingX = 24;
    const paddingBottom = 24;
    const paddingTop = 80; // Extra padding at top to avoid sidebar toggle and mode switcher

    const w = containerRect.width;
    const h = containerRect.height;

    const cx = currentX + toolbarRect.width / 2;
    const cy = currentY + toolbarRect.height / 2;

    const distTop = cy - paddingTop;
    const distBottom = (h - paddingBottom) - cy;
    const distLeft = cx - paddingX;
    const distRight = (w - paddingX) - cx;

    const minDist = Math.min(distTop, distBottom, distLeft, distRight);

    let newX = currentX;
    let newY = currentY;

    if (minDist === distTop) {
      newY = paddingTop;
    } else if (minDist === distBottom) {
      newY = h - toolbarRect.height - paddingBottom;
    } else if (minDist === distLeft) {
      newX = paddingX;
    } else {
      newX = w - toolbarRect.width - paddingX;
    }

    newX = Math.max(paddingX, Math.min(newX, w - toolbarRect.width - paddingX));
    newY = Math.max(paddingTop, Math.min(newY, h - toolbarRect.height - paddingBottom));

    setToolbarPos({ x: newX, y: newY });
  };

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  const dragStateRef = useRef<{
    draggedNodeId: string;
    initialPositions: Map<string, { x: number, y: number }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [past, setPast] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const [future, setFuture] = useState<{nodes: Node[], edges: Edge[]}[]>([]);

  const takeSnapshot = useCallback(() => {
    setPast(p => {
      const currentState = { nodes: nodesRef.current, edges: edgesRef.current };
      if (p.length > 0) {
        const last = p[p.length - 1];
        if (JSON.stringify(last) === JSON.stringify(currentState)) {
          return p;
        }
      }
      return [...p.slice(-49), currentState];
    });
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(p => p.slice(0, -1));
    setFuture(f => [{ nodes: nodesRef.current, edges: edgesRef.current }, ...f]);
    setNodes(previous.nodes);
    setEdges(previous.edges);
  }, [past, setNodes, setEdges]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(f => f.slice(1));
    setPast(p => [...p, { nodes: nodesRef.current, edges: edgesRef.current }]);
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [future, setNodes, setEdges]);

  const handleExport = () => {
    const data = { schemaVersion: 2, title: mapTitle, nodes, edges };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashmap-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('导图文件不能超过 10 MB'); return; }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        if (data.nodes && data.edges) {
          const graph = parseGraph(data);
          takeSnapshot();
          setNodes(graph.nodes);
          setEdges(graph.edges);
        } else {
          alert('Invalid file format. Please upload a valid FlashMap export file.');
        }
      } catch (error) {
        console.error('操作失败，请重试。');
        alert('Failed to parse file. Please ensure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetHistory = useCallback(() => { setPast([]); setFuture([]); }, []);
  const { maps, currentMapId, mapTitle, saveStatus, storageError,
    switchMap, createMap: handleCreateMap, importPrivateMap, renameMap, deleteMaps, retrySave } = useMapStorage({
      nodes, edges, setNodes, setEdges, initialNodes: beginnerGraph.nodes, initialEdges: beginnerGraph.edges, resetHistory,
    });
  const desktopImportMessage = useDesktopImport(importPrivateMap);
  useLayoutEffect(() => { nodesRef.current = nodes; edgesRef.current = edges; }, [nodes, edges]);
  const generationEpoch = useRef(0);
  useLayoutEffect(() => {
    generationEpoch.current++;
    setIsPreviewModalOpen(false); setPendingNodes([]); setPendingEdges([]);
    setIsEditModalOpen(false); setIsFlashcardOpen(false); setContextMenu(null); setReviewSubtreeId(null); setMode('study');
    setPreviewLayoutNodes([]); setPreviewLayoutEdges([]);
    const timer = setTimeout(() => { void fitView({ duration: 300, padding: 0.2, maxZoom: 1 }); }, 80);
    return () => clearTimeout(timer);
  }, [currentMapId, fitView]);


  const handleRenameMap = (id: string, title: string) => { renameMap(id, title); setEditingMapId(null); };
  const handleDeleteMap = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setMapToDelete(id); };
  const confirmDeleteMap = async () => { if (mapToDelete && await deleteMaps(mapToDelete)) setMapToDelete(null); };
  const handleClearAllMaps = () => setMapToDelete('ALL');

  const onConnect = useCallback((params: { source: string; target: string }) => {
    if (mode !== 'edit' || !canConnect(params.source, params.target, edgesRef.current)) return;
    takeSnapshot();
    setEdges(eds => addEdge({ ...params, id: `e-${crypto.randomUUID()}`, data: { kind: 'tree' }, type: 'smoothstep', style: { stroke: '#818cf8', strokeWidth: 2 } }, eds));
  }, [mode, takeSnapshot, setEdges]);
  const onToggleCollapse = useCallback((nodeId: string) => {
    takeSnapshot();
    const next = nodesRef.current.map(n => n.id === nodeId ? { ...n, data: { ...n.data, isCollapsed: !n.data.isCollapsed } } : n);
    const visible = applyVisibility(next, edgesRef.current);
    const result = getLayoutedElements(visible.nodes, visible.edges);
    setNodes(result.nodes); setEdges(result.edges);
  }, [takeSnapshot, setNodes, setEdges]);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const onNodeClick = useCallback((_: any, node: Node) => {
    if (mode === 'select-topic') {
      setReviewSubtreeId(node.id);
      setMode('review');
      return;
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      return; // It's a double click, let onNodeDoubleClick handle it
    }

    clickTimeoutRef.current = setTimeout(() => {
      if (mode === 'study' && node.type === 'custom') {
        setSelectedNodeData(node.data);
        setIsFlashcardOpen(true);
      }
      clickTimeoutRef.current = null;
    }, 250);
  }, [mode]);

  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    if (mode === 'edit') {
      setEditingNode(node);
      setIsEditModalOpen(true);
    }
  }, [mode]);

  const onNodeDragStart = useCallback((_: any, node: Node) => {
    if (mode !== 'edit') return;

    takeSnapshot();

    const descendants = getDescendants(node.id, edgesRef.current);
    const initialPositions = new Map<string, { x: number, y: number }>();
    initialPositions.set(node.id, { ...node.position });

    descendants.forEach(id => {
      const descNode = nodesRef.current.find(n => n.id === id);
      if (descNode) {
        initialPositions.set(id, { ...descNode.position });
      }
    });

    dragStateRef.current = {
      draggedNodeId: node.id,
      initialPositions
    };
  }, [mode]);

  const onNodeDrag = useCallback((event: any, node: Node) => {
    if (mode !== 'edit') return;

    const centerX = node.position.x + (node.measured?.width || 220) / 2;
    const centerY = node.position.y + (node.measured?.height || 100) / 2;

    let dx = 0;
    let dy = 0;
    if (dragStateRef.current && dragStateRef.current.draggedNodeId === node.id) {
      const initPos = dragStateRef.current.initialPositions.get(node.id);
      if (initPos) {
        dx = node.position.x - initPos.x;
        dy = node.position.y - initPos.y;
      }
    }

    let currentTargetId: string | null = null;
    let currentDropType: 'child' | 'sibling-top' | 'sibling-bottom' | 'floating' | null = null;

    if (event.shiftKey) {
      currentDropType = 'floating';
    }

    setNodes((nds) => {
      let bestNodeId: string | null = null;
      let bestNodeCreatesCycle = false;
      let minScore = Infinity;
      let dropType: 'child' | 'sibling-top' | 'sibling-bottom' | null = null;

      if (!event.shiftKey) {
        nds.forEach((n) => {
          if (n.id === node.id) return;
          if (dragStateRef.current?.initialPositions.has(n.id)) return;

          const nx = n.position.x;
          const ny = n.position.y;
          const nw = n.measured?.width || 250;
          const nh = n.measured?.height || 100;

          const isStrictlyInside = centerX >= nx && centerX <= nx + nw && centerY >= ny && centerY <= ny + nh;

          // Child zone: to the right
          const isChildZone = centerX >= nx + nw * 0.5 && centerX <= nx + nw + 300 && centerY >= ny - 80 && centerY <= ny + nh + 80;

          // Sibling zones: vertically aligned
          const isSiblingTopZone = centerX >= nx - 50 && centerX <= nx + nw + 50 && centerY >= ny - 150 && centerY < ny + nh * 0.25;
          const isSiblingBottomZone = centerX >= nx - 50 && centerX <= nx + nw + 50 && centerY > ny + nh * 0.75 && centerY <= ny + nh + 150;

          if (isStrictlyInside || isChildZone || isSiblingTopZone || isSiblingBottomZone) {
            const createsCycle = isDescendant(n.id, node.id, edgesRef.current);
            if (createsCycle && !isStrictlyInside) return;

            let score = 0;
            let currentDropType: 'child' | 'sibling-top' | 'sibling-bottom' = 'child';

            if (isStrictlyInside) {
              score = -1000 + Math.abs(centerX - (nx + nw/2)) + Math.abs(centerY - (ny + nh/2));
              if (centerY < ny + nh * 0.25) currentDropType = 'sibling-top';
              else if (centerY > ny + nh * 0.75) currentDropType = 'sibling-bottom';
              else currentDropType = 'child';
            } else if (isSiblingTopZone || isSiblingBottomZone) {
              score = Math.abs(centerX - (nx + nw/2)) + Math.abs(centerY - (ny + nh/2));
              currentDropType = isSiblingTopZone ? 'sibling-top' : 'sibling-bottom';
            } else if (isChildZone) {
              let distX = centerX - (nx + nw/2);
              distX = distX > 0 ? distX * 0.3 : Math.abs(distX);
              const distY = Math.abs(centerY - (ny + nh/2));
              score = distX + distY * 2;
              currentDropType = 'child';
            }

            if (score < minScore) {
              minScore = score;
              bestNodeId = n.id;
              bestNodeCreatesCycle = createsCycle;
              dropType = currentDropType;
            }
          }
        });
      }

      let changed = false;
      const newNodes = nds.map((n) => {
        if (n.id === node.id) return n;

        let newPos = n.position;
        let newClassName = n.className || '';

        const isDesc = dragStateRef.current?.initialPositions.has(n.id);

        if (isDesc) {
          const initP = dragStateRef.current!.initialPositions.get(n.id)!;
          newPos = { x: initP.x + dx, y: initP.y + dy };
          newClassName = '';
        } else {
          if (n.id === bestNodeId) {
            if (bestNodeCreatesCycle) {
              newClassName = 'ring-4 ring-red-500 shadow-xl transition-all rounded-xl';
            } else {
              if (dropType === 'child') {
                newClassName = 'ring-4 ring-emerald-500 shadow-xl transition-all rounded-xl';
              } else if (dropType === 'sibling-top') {
                newClassName = 'border-t-4 border-emerald-500 shadow-xl transition-all rounded-xl';
              } else if (dropType === 'sibling-bottom') {
                newClassName = 'border-b-4 border-emerald-500 shadow-xl transition-all rounded-xl';
              }
              currentTargetId = n.id;
              currentDropType = dropType;
            }
          } else {
            newClassName = '';
          }
        }

        if (n.position.x !== newPos.x || n.position.y !== newPos.y || n.className !== newClassName) {
          changed = true;
          return { ...n, position: newPos, className: newClassName };
        }
        return n;
      });
      return changed ? newNodes : nds;
    });

    const nextNodesForLayout = nodesRef.current.map(n => {
      if (n.id === node.id) {
        return { ...n, position: node.position };
      }
      const initP = dragStateRef.current?.initialPositions.get(n.id);
      if (initP) {
        return { ...n, position: { x: initP.x + dx, y: initP.y + dy } };
      }
      return n;
    });

    const sortedIds = [...nextNodesForLayout].sort((a, b) => a.position.y - b.position.y).map(n => n.id).join(',');
    const orderKey = currentTargetId ? `target-${currentTargetId}-${currentDropType}` : `order-${sortedIds}-${currentDropType}`;

    if (orderKey !== lastTargetIdRef.current) {
      lastTargetIdRef.current = orderKey;

      let nextEdges = [...edgesRef.current];
      let nextNodes = nextNodesForLayout;

      if (currentDropType === 'floating') {
        nextEdges = nextEdges.filter(e => !isTreeEdge(e) || e.target !== node.id);
        nextNodes = nextNodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isRoot: true } } : n);
      } else if (currentTargetId) {
        nextEdges = nextEdges.filter(e => !isTreeEdge(e) || e.target !== node.id);

        if (currentDropType === 'child') {
          nextEdges.push({
            id: `e-${currentTargetId}-${node.id}`,
            source: currentTargetId,
            target: node.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#818cf8', strokeWidth: 2 }
          });
          nextNodes = nextNodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isRoot: false } } : n);
        } else if (currentDropType === 'sibling-top' || currentDropType === 'sibling-bottom') {
          const targetParentEdge = edgesRef.current.find(e => isTreeEdge(e) && e.target === currentTargetId);
          if (targetParentEdge) {
            nextEdges.push({
              id: `e-${targetParentEdge.source}-${node.id}`,
              source: targetParentEdge.source,
              target: node.id,
              type: 'smoothstep',
              animated: true,
              style: { stroke: '#818cf8', strokeWidth: 2 }
            });
            nextNodes = nextNodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isRoot: false } } : n);
          } else {
            nextNodes = nextNodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isRoot: true } } : n);
          }
        }
      } else {
        if (Math.abs(dx) > 150) {
          setPreviewLayoutNodes([]);
          setPreviewLayoutEdges([]);
          return;
        }
      }

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nextNodes, nextEdges, 'LR');

      const ghostNodes = layoutedNodes.map(n => ({
        ...n,
        id: `ghost-${n.id}`,
        data: { ...n.data, isGhost: true },
        selected: false,
        draggable: false,
        selectable: false,
        className: 'opacity-40 border-dashed pointer-events-none z-0'
      }));

      const ghostEdges = layoutedEdges.map(e => ({
        ...e,
        id: `ghost-${e.id}`,
        source: `ghost-${e.source}`,
        target: `ghost-${e.target}`,
        style: { ...e.style, strokeDasharray: '5,5', opacity: 0.4 },
        interactionWidth: 0
      }));

      setPreviewLayoutNodes(ghostNodes);
      setPreviewLayoutEdges(ghostEdges);
    }
  }, [mode, setNodes]);

  const onNodeDragStop = useCallback((event: any, node: Node) => {
    if (mode !== 'edit') return;

    const initPos = dragStateRef.current?.initialPositions.get(node.id);
    const dx = initPos ? node.position.x - initPos.x : 0;
    const dy = initPos ? node.position.y - initPos.y : 0;
    const isDrag = Math.abs(dx) > 5 || Math.abs(dy) > 5;

    const targetNode = nodesRef.current.find(n => n.className?.includes('emerald-500'));
    const targetNodeId = targetNode?.id;
    const isSiblingTop = targetNode?.className?.includes('border-t-4');
    const isSiblingBottom = targetNode?.className?.includes('border-b-4');
    const isChild = targetNode?.className?.includes('ring-4');
    const isFloating = event.shiftKey;

    let nextNodes = nodesRef.current.map((n) => {
      let updatedNode = { ...n };

      if (n.id === node.id) {
        updatedNode = { ...updatedNode, position: node.position, className: '' };
        if (isFloating) {
          updatedNode.data = { ...updatedNode.data, isRoot: true };
        } else if (targetNodeId && targetNodeId !== node.id) {
          if (isChild) {
            updatedNode.data = { ...updatedNode.data, isRoot: false };
          } else if (isSiblingTop || isSiblingBottom) {
            const targetParentEdge = edgesRef.current.find(e => isTreeEdge(e) && e.target === targetNodeId);
            updatedNode.data = { ...updatedNode.data, isRoot: !targetParentEdge };
          }
        }
      } else {
        const initP = dragStateRef.current?.initialPositions.get(n.id);
        if (initP) {
          updatedNode = { ...updatedNode, position: { x: initP.x + dx, y: initP.y + dy } };
        }
        if (n.className) {
          updatedNode = { ...updatedNode, className: '' };
        }
      }
      return updatedNode;
    });

    let nextEdges = edgesRef.current;
    let shouldLayout = false;

    if (isFloating) {
      nextEdges = nextEdges.filter((e) => !isTreeEdge(e) || e.target !== node.id);
      shouldLayout = true;
    } else if (targetNodeId && targetNodeId !== node.id) {
      const filtered = nextEdges.filter((e) => !isTreeEdge(e) || e.target !== node.id);

      if (isChild) {
        const newEdge: Edge = {
          id: `e-${targetNodeId}-${node.id}`,
          source: targetNodeId,
          target: node.id,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#818cf8', strokeWidth: 2 }
        };
        nextEdges = [...filtered, newEdge];
      } else if (isSiblingTop || isSiblingBottom) {
        const targetParentEdge = edgesRef.current.find(e => isTreeEdge(e) && e.target === targetNodeId);
        if (targetParentEdge) {
          const newEdge: Edge = {
            id: `e-${targetParentEdge.source}-${node.id}`,
            source: targetParentEdge.source,
            target: node.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#818cf8', strokeWidth: 2 }
          };
          nextEdges = [...filtered, newEdge];
        } else {
          nextEdges = filtered;
        }

        // Reorder nodes array so layout algorithm respects the sibling order
        const targetIndex = nextNodes.findIndex(n => n.id === targetNodeId);
        const nodeIndex = nextNodes.findIndex(n => n.id === node.id);
        if (targetIndex !== -1 && nodeIndex !== -1) {
          const [movedNode] = nextNodes.splice(nodeIndex, 1);
          const newTargetIndex = nextNodes.findIndex(n => n.id === targetNodeId);
          if (isSiblingTop) {
            nextNodes.splice(newTargetIndex, 0, movedNode);
          } else {
            nextNodes.splice(newTargetIndex + 1, 0, movedNode);
          }
        }
      }
      shouldLayout = true;
    } else if (isDrag && !targetNodeId) {
      if (Math.abs(dx) > 150) {
        const hasIncoming = nextEdges.some(e => isTreeEdge(e) && e.target === node.id);
        if (hasIncoming) {
          // Disconnect if dragged far away horizontally
          nextEdges = nextEdges.filter(e => !isTreeEdge(e) || e.target !== node.id);
          nextNodes = nextNodes.map(n =>
            n.id === node.id ? { ...n, data: { ...n.data, isRoot: true } } : n
          );
        }
        shouldLayout = false;
      } else {
        // Reorder siblings or roots if dragged vertically
        shouldLayout = true;
      }
    }

    if (shouldLayout) {
      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nextNodes, nextEdges, 'LR');
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      setNodes(nextNodes);
      setEdges(nextEdges);
    }

    dragStateRef.current = null;
    lastTargetIdRef.current = null;
    setPreviewLayoutNodes([]);
    setPreviewLayoutEdges([]);
  }, [mode, setEdges, setNodes]);

  const handleSaveNode = (nodeId: string, newData: FlashNodeData) => {
    takeSnapshot();
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: newData };
        }
        return node;
      })
    );
  };

  const handleSaveProgress = (results: ReviewResult[]) => {
    if (!results.length) return;
    setNodes(nds => nds.map(n => {
      const result = results.find(r => r.id === n.id);
      if (!result) return n;
      const { id, ...progress } = result;
      return { ...n, data: { ...n.data, ...progress } };
    }));
  };

  // Keyboard shortcuts for Xmind-like editing
  const handleDeleteSelected = useCallback(() => {
    if (mode !== 'edit') return;
    const selectedNodes = nodesRef.current.filter(n => n.selected);
    if (selectedNodes.length !== 1) return;

    takeSnapshot();
    const selectedNode = selectedNodes[0];
    const descendants = getDescendants(selectedNode.id, edgesRef.current);
    const nodesToDelete = new Set([selectedNode.id, ...descendants]);

    setNodes(nds => nds.filter(n => !nodesToDelete.has(n.id)));
    setEdges(eds => eds.filter(e => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)));
  }, [mode, setNodes, setEdges]);

  const handleAddChild = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);
    if (selectedNodes.length !== 1) return;
    const selectedNode = selectedNodes[0];

    takeSnapshot();

    const newNodeId = `node-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'New Concept',
        question: '',
        answer: '',
        isRoot: false,
        depth: (selectedNode.data.depth || 0) + 1
      }
    };
    const newEdge: Edge = {
      id: `e-${selectedNode.id}-${newNodeId}`,
      source: selectedNode.id,
      target: newNodeId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#818cf8', strokeWidth: 2 }
    };

    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
    setEdges(es => [...es, newEdge]);
  }, [mode, setNodes, setEdges]);

  const handleAddSummary = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected && n.type !== 'boundary');
    if (selectedNodes.length === 0) {
      alert('Please select at least one node to create a summary.');
      return;
    }

    takeSnapshot();

    const newNodeId = `node-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'Summary',
        question: '',
        answer: '',
        reviewEnabled: false,
        isRoot: false
      },
    };

    const newEdges = selectedNodes.map(n => ({
      id: `e-${n.id}-${newNodeId}`,
      source: n.id,
      target: newNodeId,
      data: { kind: 'summary' },
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#818cf8', strokeWidth: 2 }
    }));

    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
    setEdges(es => [...es, ...newEdges]);

    setTimeout(() => {
      const layout = getLayoutedElements(nodesRef.current, edgesRef.current, 'LR');
      setNodes(layout.nodes);
      setEdges(layout.edges);
    }, 50);
  }, [mode, setNodes, setEdges, takeSnapshot]);

  const handleAddBoundary = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected && n.type !== 'boundary');
    if (selectedNodes.length === 0) {
      alert('Please select at least one node to create a boundary.');
      return;
    }

    takeSnapshot();

    const targetIds = selectedNodes.map(n => n.id);
    const newNodeId = `boundary-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'boundary',
      position: { x: 0, y: 0 },
      data: { targetIds },
      style: {
        backgroundColor: 'rgba(241, 245, 249, 0.5)',
        border: '2px dashed #94a3b8',
        borderRadius: '16px',
        zIndex: -1,
      },
      selectable: true,
      draggable: false,
    };

    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);

    // Trigger layout to update boundary size
    setTimeout(() => {
      const layout = getLayoutedElements(nodesRef.current, edgesRef.current, 'LR');
      setNodes(layout.nodes);
      setEdges(layout.edges);
    }, 50);
  }, [mode, setNodes, setEdges, takeSnapshot]);

  const handleAddRelationship = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);
    if (selectedNodes.length !== 2) {
      alert('Please select exactly two nodes to create a relationship.');
      return;
    }

    takeSnapshot();

    const [sourceNode, targetNode] = selectedNodes;
    const newEdge: Edge = {
      id: `rel-${crypto.randomUUID()}`,
      data: { kind: 'relationship' },
      source: sourceNode.id,
      target: targetNode.id,
      type: 'bezier',
      animated: true,
      style: { stroke: '#f43f5e', strokeWidth: 2, strokeDasharray: '5,5' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#f43f5e' }
    };

    setEdges(es => [...es, newEdge]);
  }, [mode, setEdges, takeSnapshot]);

  const handleAddSibling = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);
    if (selectedNodes.length !== 1) return;
    const selectedNode = selectedNodes[0];

    takeSnapshot();

    const parentEdge = currentEdges.find(e => isTreeEdge(e) && e.target === selectedNode.id);

    const newNodeId = `node-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'New Concept',
        question: '',
        answer: '',
        isRoot: !parentEdge,
        depth: selectedNode.data.depth || 0
      }
    };

    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);

    if (parentEdge) {
      const newEdge: Edge = {
        id: `e-${parentEdge.source}-${newNodeId}`,
        source: parentEdge.source,
        target: newNodeId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#818cf8', strokeWidth: 2 }
      };
      setEdges(es => [...es, newEdge]);
    }
  }, [mode, setNodes, setEdges]);

  const handleEditSelected = useCallback(() => {
    if (mode !== 'edit') return;
    const currentNodes = nodesRef.current;
    const selectedNodes = currentNodes.filter(n => n.selected);
    if (selectedNodes.length === 1) {
      setEditingNode(selectedNodes[0]);
      setIsEditModalOpen(true);
    }
  }, [mode]);

  const handleAddIndependentNode = useCallback(() => {
    if (mode !== 'edit') return;
    takeSnapshot();
    const newNodeId = `node-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: {
        label: 'New Concept',
        question: '',
        answer: '',
        isRoot: true,
        depth: 0
      }
    };
    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
  }, [mode, setNodes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      if (mode !== 'edit') return;

      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        handleAddIndependentNode();
        return;
      }

      if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Insert') {
        e.preventDefault();
        handleAddChild();
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSibling();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleAddIndependentNode, handleAddChild, handleAddSibling, handleDeleteSelected, undo, redo]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handlePaneClick = useCallback((event: React.MouseEvent) => {
    setContextMenu(null);
    if (mode !== 'edit') return;
    if (event.detail === 2) {
      takeSnapshot();
      const bounds = document.querySelector('.react-flow')?.getBoundingClientRect();
      const x = bounds ? event.clientX - bounds.left : Math.random() * 100;
      const y = bounds ? event.clientY - bounds.top : Math.random() * 100;

      const newNodeId = `node-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: { x, y },
        data: {
          label: 'New Idea',
          question: '',
          answer: '',
          isRoot: true,
        },
      };

      setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
    }
  }, [mode, takeSnapshot, setNodes]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (mode === 'study') {
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          nodeId: node.id,
        });
      }
    },
    [mode]
  );

  const getSubtreeNodes = useCallback((rootId: string) => {
    const ids = new Set([rootId, ...getDescendants(rootId, edges)]);
    return nodes.filter(n => ids.has(n.id));
  }, [nodes, edges]);

  const handleReviewSubtree = useCallback(() => {
    if (!contextMenu) return;
    setReviewSubtreeId(contextMenu.nodeId);
    setMode('review');
    setContextMenu(null);
  }, [contextMenu]);

  const handleLayout = useCallback(() => {
    takeSnapshot();
    const layout = getLayoutedElements(nodesRef.current, edgesRef.current, 'LR');
      setNodes(layout.nodes);
      setEdges(layout.edges);
    setTimeout(() => { void fitView({ duration: 300, padding: 0.2, maxZoom: 1 }); }, 80);
  }, [takeSnapshot, setNodes, setEdges, fitView]);

  const handleGenerateNode = async () => {
    if (!newNodeTitle.trim() && !newNodeContent.trim()) return;

    const selectedBefore = nodesRef.current.filter(n => n.selected && n.type === 'custom');
    const targetBefore = selectedBefore.length === 1 ? selectedBefore[0].id : null;
    setIsGeneratingNode(true);
    const epoch = generationEpoch.current;
    try {
      const prompt = `Based on the following title and content, generate a single flashcard node.
      Keep the 'label' concise (1-4 words).

      Title: ${newNodeTitle}
      Content: ${newNodeContent}`;

      const generated = validateCards(await generateAI('node', prompt), 1);
      if (epoch !== generationEpoch.current) throw new Error('导图已切换，请在当前导图重新生成');
      const parsedData = generated[0];

      if (parsedData.label && parsedData.question && parsedData.answer) {
        takeSnapshot();

        const selectedNode = targetBefore ? nodesRef.current.find(n => n.id === targetBefore) : null;
        if (targetBefore && !selectedNode) throw new Error('目标节点已删除，请重新生成');

        if (selectedNode) {
          const newNode: Node = {
            id: crypto.randomUUID(),
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              label: parsedData.label,
              question: parsedData.question,
              answer: parsedData.answer,
              sourceExcerpt: parsedData.sourceExcerpt && newNodeContent.includes(parsedData.sourceExcerpt) ? parsedData.sourceExcerpt : '',
              isRoot: false,
              depth: (selectedNode.data.depth || 0) + 1
            }
          };

          const newEdge: Edge = {
            id: `e-${selectedNode.id}-${newNode.id}`,
            source: selectedNode.id,
            target: newNode.id,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#94a3b8', strokeWidth: 2 }
          };

          setNodes(nds => [...nds.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
          setEdges(eds => [...eds, newEdge]);

          setTimeout(() => {
            const layout = getLayoutedElements(nodesRef.current, edgesRef.current, 'LR');
      setNodes(layout.nodes);
      setEdges(layout.edges);
          }, 50);

        } else {
          const center = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
          let targetX = center.x;
          let targetY = center.y;
          let offset = 0;
          let found = false;

          while (!found && offset < 1000) {
            const isOccupied = nodesRef.current.some(n => {
              const nx = n.position.x;
              const ny = n.position.y;
              const nw = n.measured?.width || 250;
              const nh = n.measured?.height || 100;
              return targetX >= nx - 50 && targetX <= nx + nw + 50 &&
                     targetY >= ny - 50 && targetY <= ny + nh + 50;
            });

            if (!isOccupied) {
              found = true;
            } else {
              targetX += 50;
              targetY += 50;
              offset += 50;
            }
          }

          const newNode: Node = {
            id: crypto.randomUUID(),
            type: 'custom',
            position: { x: targetX, y: targetY },
            data: {
              label: parsedData.label,
              question: parsedData.question,
              answer: parsedData.answer,
              isRoot: true,
              depth: 0
            }
          };

          setNodes(nds => [...nds.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
        }

        setNewNodeTitle('');
        setNewNodeContent('');
      }
    } catch (error) {
      console.error('操作失败，请重试。');
      if (error instanceof AICancelledError) return;
      alert(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      setIsGeneratingNode(false);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    const selectedNodes = nodes.filter(n => n.selected && n.type === 'custom');
    const targetNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

    setIsGenerating(true);
    const epoch = generationEpoch.current;
    try {
      const prompt = `Analyze the following text or topic and create a highly detailed, comprehensive mind map.

      Instructions:
      1. Create 8 to 20 core knowledge nodes with at most 4 hierarchy levels. Match the input language.
      2. Keep each question focused on a single knowledge point and each answer concise.
      3. Include sourceExcerpt only when quoting a short exact passage from the supplied notes; otherwise leave it empty.

      Return a flat JSON array of nodes.
      - The root node should have a parentId of null.
      - Every other node must have a parentId corresponding to its parent concept.
      - Keep the 'label' concise (1-5 words) representing the topic.
      - The 'question' and 'answer' should contain the detailed flashcard content.

      ${targetNode ? `Context: This new mind map will be attached as a sub-topic to the concept "${targetNode.data.label}".\n      ` : ''}Input text/topic:
      ${inputText}`;

      const generated = validateCards(await generateAI('tree', prompt), 30);
      if (epoch !== generationEpoch.current) throw new Error('导图已切换，请在当前导图重新生成');
      const rawData: FlashcardData[] = generated;

      const parsedData: FlashcardData[] = [];
      const seenIds = new Set<string>();
      rawData.forEach(item => {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          parsedData.push(item);
        }
      });

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Create a mapping from AI generated IDs to new unique IDs
      const idMap = new Map<string, string>();
      parsedData.forEach(item => {
        idMap.set(item.id, crypto.randomUUID());
      });

      parsedData.forEach((item) => {
        const isRoot = item.parentId === null || item.parentId === 'null' || item.parentId === '';
        const newId = idMap.get(item.id) || crypto.randomUUID();

        newNodes.push({
          id: newId,
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: item.label, question: item.question, answer: item.answer, sourceExcerpt: item.sourceExcerpt && inputText.includes(item.sourceExcerpt) ? item.sourceExcerpt : '', isRoot: isRoot && !targetNode }
        });

        if (!isRoot && item.parentId) {
          const mappedParentId = idMap.get(item.parentId as string) || item.parentId as string;
          newEdges.push({
            id: `e-${mappedParentId}-${newId}`,
            source: mappedParentId,
            target: newId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#818cf8', strokeWidth: 2 }
          });
        } else if (isRoot && targetNode) {
          newEdges.push({
            id: `e-${targetNode.id}-${newId}`,
            source: targetNode.id,
            target: newId,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#818cf8', strokeWidth: 2 }
          });
        }
      });

      setPendingNodes(newNodes);
      setPendingEdges(newEdges);
      setPreviewMode(targetNode ? 'expand' : 'new');
      setIsPreviewModalOpen(true);
      setInputText('');
    } catch (error) {
      console.error('操作失败，请重试。');
      if (error instanceof AICancelledError) return;
      alert(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIExpand = async () => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length !== 1) return;
    const targetNode = selectedNodes[0];

    setIsExpanding(true);
    const epoch = generationEpoch.current;
    try {
      const prompt = `The user wants to deeply expand the concept "${targetNode.data.label}".
      Context: 问题: "${targetNode.data.question}", 答案: "${targetNode.data.answer}".

      Generate 3 to 6 focused sub-concepts in the input language. Each flashcard must test one knowledge point with a concise core answer.
      For each sub-concept, create one focused question and a concise answer, using the language of the selected concept.

      Return a flat JSON array of nodes.
      - id: unique string identifier
      - label: short title (1-5 words)
      - question: detailed flashcard question
      - answer: comprehensive flashcard answer`;

      const generated = validateCards(await generateAI('expand', prompt), 6);
      if (epoch !== generationEpoch.current) throw new Error('导图已切换，请在当前导图重新生成');
      const parsedData = generated;

      const newNodes: Node[] = parsedData.map((item: any) => ({
        id: crypto.randomUUID(),
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { label: item.label, question: item.question, answer: item.answer, isRoot: false }
      }));

      const newEdges: Edge[] = newNodes.map(n => ({
        id: `e-${targetNode.id}-${n.id}`,
        source: targetNode.id,
        target: n.id,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#818cf8', strokeWidth: 2 }
      }));

      setPendingNodes(newNodes);
      setPendingEdges(newEdges);
      setPreviewMode('expand');
      setIsPreviewModalOpen(true);
    } catch (error) {
      console.error('操作失败，请重试。');
      if (error instanceof AICancelledError) return;
      alert(error instanceof Error ? error.message : '生成失败，请重试');
    } finally {
      setIsExpanding(false);
    }
  };

  const handleConfirmPreview = (selectedIds: string[]) => {
    takeSnapshot();
    const approvedNodes = pendingNodes.filter(n => selectedIds.includes(n.id));

    const parentByChild = new Map(pendingEdges.map(e => [e.target, e.source]));
    const approvedEdges: Edge[] = [];
    for (const child of approvedNodes) {
      const seen = new Set([child.id]);
      let parent = parentByChild.get(child.id);
      while (parent && !selectedIds.includes(parent) && !nodes.some(n => n.id === parent)) {
        if (seen.has(parent)) { parent = undefined; break; }
        seen.add(parent); parent = parentByChild.get(parent);
      }
      if (parent) approvedEdges.push({ id: 'e-' + parent + '-' + child.id, source: parent, target: child.id, data: { kind: 'tree' }, type: 'smoothstep' });
    }

    const finalNewNodes = approvedNodes.map(n => {
      const hasIncomingEdge = approvedEdges.some(e => isTreeEdge(e) && e.target === n.id);
      return {
        ...n,
        data: { ...n.data, isRoot: !hasIncomingEdge }
      };
    });

    if (previewMode === 'new') {
      // Expand mode: layout everything together so it fits nicely
      const combinedNodes = [...nodes, ...finalNewNodes];
      const combinedEdges = [...edges, ...approvedEdges];

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(combinedNodes, combinedEdges, 'LR');
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } else {
      // Expand mode: layout everything together so it fits nicely
      const combinedNodes = [...nodes, ...finalNewNodes];
      const combinedEdges = [...edges, ...approvedEdges];

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(combinedNodes, combinedEdges, 'LR');
      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    }

    setIsPreviewModalOpen(false);
    setPendingNodes([]);
    setPendingEdges([]);
  };

  const selectedNodeCount = nodes.filter(n => n.selected).length;

  const { generate: generateAI, configured: aiConfigured, keyDialog, closeKeyDialog, openKeySettings } = useAI();

  return (
    <GraphContext.Provider value={{ onToggleCollapse, hasChildren: id => edges.some(e => isTreeEdge(e) && e.source === id) }}>
      <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
        {/* Sidebar */}
        <div className={cn("absolute inset-y-0 left-0 md:relative bg-white border-r border-slate-200 flex flex-col shadow-sm z-20 transition-all duration-300 overflow-hidden shrink-0", isSidebarOpen ? "w-80" : "w-0 border-none opacity-0")}>
          <div className="w-80 flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-200">
              <Brain size={24} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">FlashMap</h1>
              <p className="text-xs text-slate-500 font-medium">
                {saveStatus}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">桌面版</span>
          </div>

          <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

            {storageError && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{storageError}</div>}
            {desktopImportMessage && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">{desktopImportMessage}</div>}
            {saveStatus.includes('失败') && <button onClick={() => void retrySave()} className="text-xs text-indigo-600">重试本机保存</button>}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="text-sm font-semibold text-indigo-900">今日学习</div>
              <p className="mt-1 text-xs text-indigo-700">{nodes.filter(n => isDue(n, now)).length} 张待复习 · {nodes.filter(isReviewable).length} 张有效卡片</p>
              <button onClick={() => { setReviewSubtreeId(null); setMode('review'); }} className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white">开始复习</button>
            </div>
            {/* Folders / Maps Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Folder size={16} className="text-indigo-500" />
                  我的导图
                </label>
                <button onClick={handleCreateMap} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="新建导图">
                  <Plus size={16} />
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar pr-1">
                {maps.map(map => (
                  <div
                    key={map.id}
                    onClick={() => {
                      if (editingMapId !== map.id) switchMap(map.id);
                    }}
                    className={cn(
                      "group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-sm",
                      currentMapId === map.id ? "bg-indigo-50 text-indigo-700 font-medium" : "hover:bg-slate-100 text-slate-600"
                    )}
                  >
                    {editingMapId === map.id ? (
                      <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameMap(map.id, editingTitle);
                            if (e.key === 'Escape') setEditingMapId(null);
                          }}
                          className="flex-1 min-w-0 bg-white border border-indigo-300 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button onClick={() => handleRenameMap(map.id, editingTitle)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                          <Check size={14} />
                        </button>
                        <button onClick={() => setEditingMapId(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText size={14} className={currentMapId === map.id ? "text-indigo-500" : "text-slate-400"} />
                          <span className="truncate">{map.id === currentMapId ? mapTitle : map.title}</span>
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 flex items-center transition-all">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingMapId(map.id);
                              setEditingTitle(map.id === currentMapId ? mapTitle : map.title);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                            title="重命名导图"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={(e) => handleDeleteMap(map.id, e)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded"
                            title="删除导图"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

          <hr className="border-slate-100 my-2" />

          {/* AI 生成卡片 Section */}
          <div className="space-y-2">
            <p className="text-[11px] text-slate-500">AI 生成会发送输入的学习内容，请勿填写密钥或私人资料。</p>
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BrainCircuit size={16} className="text-fuchsia-500" />
              生成知识卡片
            </label>
            <input
              type="text"
              value={newNodeTitle}
              onChange={(e) => setNewNodeTitle(e.target.value)}
              placeholder="知识点标题 (Optional)"
              className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <textarea
              value={newNodeContent}
              onChange={(e) => setNewNodeContent(e.target.value)}
              placeholder="粘贴学习内容，用于生成一道问答…"
              className="w-full h-20 p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent resize-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <button
              onClick={handleGenerateNode}
              disabled={isGeneratingNode || (!newNodeTitle.trim() && !newNodeContent.trim())}
              className="w-full py-2 px-4 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isGeneratingNode ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              生成卡片
            </button>
          </div>

          <hr className="border-slate-100 my-2" />

          {/* AI Generation Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-500" />
              生成知识导图
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="输入主题或粘贴笔记，生成简洁的知识结构…"
              className="w-full h-32 p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !inputText.trim()}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              生成导图
            </button>
          </div>

          <hr className="border-slate-100 my-2" />

          {/* AI 学习助手 Section (Contextual) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Brain size={16} className="text-emerald-500" />
              AI 学习助手
            </label>
            {selectedNodeCount === 1 ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs text-emerald-800 mb-3">
                  已选择： <span className="font-bold">{nodes.find(n => n.selected)?.data.label}</span>
                </p>
                <button
                  onClick={handleAIExpand}
                  disabled={isExpanding}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {isExpanding ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                  展开知识点
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500">选择一个知识节点，让 AI 补充相关知识点。</p>
              </div>
            )}
          </div>

          <hr className="border-slate-100 my-2" />

          {/* Tools Section */}
          <div className="space-y-2 mt-auto">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExport}
                className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
              >
                <Download size={14} />
                导出备份
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
              >
                <Upload size={14} />
                导入导图
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImport}
                accept=".json"
                className="hidden"
              />
            </div>
            <button
              onClick={handleLayout}
              className="w-full py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <Network size={16} />
              自动布局
            </button>
            <button
              onClick={() => {
                const hasIntro = nodes.some(n => n.id === 'intro');
                if (!hasIntro) {
                  takeSnapshot();
                  setNodes([...nodes, ...initialNodes]);
                  setEdges([...edges, ...initialEdges]);
                }
              }}
              className="w-full py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <RotateCw size={16} />
              恢复学习指南
            </button>
            {mode === 'edit' && (
              <>
                <div className="flex gap-2">
                  <button
                    onClick={undo}
                    disabled={past.length === 0}
                    className="flex-1 py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 size={16} />
                  </button>
                  <button
                    onClick={redo}
                    disabled={future.length === 0}
                    className="flex-1 py-2 px-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 size={16} />
                  </button>
                </div>
                <button
                  onClick={handleAddIndependentNode}
                  className="w-full py-2 px-4 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-600 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} />
                  添加独立节点
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedNodeCount !== 1}
                  className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 disabled:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 text-red-600 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  删除节点及子树
                </button>
              </>
            )}
          </div>

          <hr className="border-slate-100 my-2" />

          {/* 设置 Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Settings size={16} className="text-slate-500" />
              设置
            </label>
            <label className="flex items-center justify-between cursor-pointer p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
              <span className="text-sm text-slate-700">显示缩略图</span>
              <div className={cn("w-8 h-4 rounded-full transition-colors relative", showMiniMap ? "bg-indigo-500" : "bg-slate-300")}>
                <div className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform", showMiniMap ? "translate-x-4" : "translate-x-0")} />
              </div>
              <input
                type="checkbox"
                className="hidden"
                checked={showMiniMap}
                onChange={(e) => setShowMiniMap(e.target.checked)}
              />
            </label>
            <button onClick={() => void openKeySettings()} className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-sm text-slate-700 hover:bg-slate-50">
              <span className="flex items-center gap-2"><KeyRound size={16} />AI 密钥设置</span>
              <span className={cn("text-xs", aiConfigured ? "text-emerald-600" : "text-slate-400")}>{aiConfigured ? '已配置' : '未配置'}</span>
            </button>
            <p className="px-2 text-[11px] leading-5 text-slate-400">导图与复习仅保存在本机；AI 生成需要联网。</p>
            <button
              onClick={handleClearAllMaps}
              className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 mt-2"
            >
              <Trash2 size={14} />
              清空所有导图
            </button>
          </div>

        </div>
        </div>
      </div>

      {/* Main Flow Area */}
      <div className="flex-1 relative h-full">
        {/* Sidebar Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-4 left-4 z-10 bg-white/80 backdrop-blur-sm p-2 rounded-xl shadow-sm border border-slate-200 hover:bg-white text-slate-600 transition-all"
          title={isSidebarOpen ? "收起侧栏" : "展开侧栏"}
        >
          {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>

        {/* Top Bar: Mode Switcher */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-white p-1 rounded-full shadow-md border border-slate-200 flex gap-1">
          <button
            onClick={() => setMode('study')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
              mode === 'study' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <Book size={16} /> 学习模式
          </button>
          <button
            onClick={() => setMode('edit')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
              mode === 'edit' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <Edit3 size={16} /> 编辑模式
          </button>
          <button
            onClick={() => setMode('review')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
              mode === 'review' ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <BrainCircuit size={16} /> 复习模式
          </button>
        </div>

        <ReactFlow
          nodes={[...nodes.filter(n => !n.hidden), ...previewLayoutNodes]}
          edges={[...edges.filter(e => !e.hidden), ...previewLayoutEdges]}
          defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={connection => mode === 'edit' && canConnect(connection.source, connection.target, edges)}
          nodesDraggable={mode === 'edit'}
          nodesConnectable={mode === 'edit'}
          deleteKeyCode={null}
          onNodeClick={(e, node) => {
            setContextMenu(null);
            onNodeClick(e, node);
          }}
          onNodeContextMenu={onNodeContextMenu}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={handlePaneClick}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          className="bg-slate-50"
        >
          <Background color="#cbd5e1" gap={16} size={1} />
          <Controls className="bg-white shadow-md border-slate-200 rounded-lg overflow-hidden mb-16" />
          {showMiniMap && (
            <MiniMap
              position="top-right"
              pannable
              zoomable
              nodeStrokeColor={(n) => {
                if (n.type === 'custom') return '#6366f1';
                return '#eee';
              }}
              nodeColor={(n) => {
                if (n.type === 'custom') return '#e0e7ff';
                return '#fff';
              }}
              nodeBorderRadius={8}
              maskColor="rgba(248, 250, 252, 0.7)"
              maskStrokeColor="#64748b"
              maskStrokeWidth={3}
              className="rounded-xl shadow-lg border-2 border-slate-400 overflow-hidden bg-white/90 backdrop-blur-sm"
            />
          )}
        </ReactFlow>

        <AnimatePresence mode="wait">
          {mode === 'edit' ? (
            <motion.div
              key="edit-hint"
              ref={toolbarRef}
              drag
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              animate={{ x: toolbarPos.x, y: toolbarPos.y, opacity: isToolbarInitialized ? 1 : 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              initial={{ opacity: 0, scale: 0.9 }}
              exit={{ opacity: 0, scale: 0.9 }}
              style={{ position: 'absolute', top: 0, left: 0, zIndex: 50, pointerEvents: isToolbarInitialized ? 'auto' : 'none' }}
              className="bg-slate-800/90 backdrop-blur text-white p-1.5 rounded-2xl shadow-2xl flex items-center gap-0.5 cursor-grab active:cursor-grabbing border border-slate-700"
            >
              <button onClick={handleEditSelected} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Edit3 size={15} /> Edit
                </div>
                <span className="text-[9px] text-slate-400">Double Click</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddIndependentNode} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Plus size={15} /> Add Node
                </div>
                <span className="text-[9px] text-slate-400">Shift+Tab</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddChild} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Network size={15} /> Add Child
                </div>
                <span className="text-[9px] text-slate-400">Tab</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddSibling} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <PlusCircle size={15} /> Add Sibling
                </div>
                <span className="text-[9px] text-slate-400">Enter</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddRelationship} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Link size={15} /> Relationship
                </div>
                <span className="text-[9px] text-slate-400">Select 2</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddBoundary} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <SquareDashed size={15} /> Boundary
                </div>
                <span className="text-[9px] text-slate-400">Select 1+</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleAddSummary} className="hover:bg-slate-700 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Braces size={15} /> Summary
                </div>
                <span className="text-[9px] text-slate-400">Select 1+</span>
              </button>

              <div className="w-px h-8 bg-slate-600/50" />

              <button onClick={handleDeleteSelected} className="hover:bg-red-500/20 text-red-300 hover:text-red-200 px-2 py-1.5 rounded-xl transition-colors flex flex-col items-center justify-center gap-0.5 min-w-[60px]">
                <div className="flex items-center gap-1 font-medium text-sm">
                  <Trash2 size={15} /> Delete
                </div>
                <span className="text-[9px] text-red-400/70">Del</span>
              </button>
            </motion.div>
          ) : mode === 'study' ? (
            <motion.div
              key="study-hint"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-indigo-600/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-lg text-sm flex items-center gap-2"
            >
              <Sparkles size={16} /> 点击知识节点查看闪卡，进入复习模式检验记忆。
            </motion.div>
          ) : mode === 'select-topic' ? (
            <motion.div
              key="select-topic-hint"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-emerald-600/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-lg text-sm flex items-center gap-2"
            >
              <BrainCircuit size={16} /> Click a node to review its subtree
              <button
                onClick={() => setMode('review')}
                className="ml-4 px-2 py-1 bg-white/20 hover:bg-white/30 rounded text-xs transition-colors"
              >
                取消
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {contextMenu && mode === 'study' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[160px] overflow-hidden"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleReviewSubtree}
                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 transition-colors"
              >
                <BrainCircuit size={16} />
                Review Tree/Subtree
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {mapToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setMapToDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">
                  {mapToDelete === 'ALL' ? '清空所有导图' : '删除导图'}
                </h2>
                <p className="text-sm text-slate-600">
                  {mapToDelete === 'ALL'
                    ? 'Are you sure you want to delete ALL your maps? This action cannot be undone.'
                    : 'Are you sure you want to delete this map? This action cannot be undone.'}
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setMapToDelete(null)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={confirmDeleteMap}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {keyDialog && <AIKeyModal {...keyDialog} onClose={closeKeyDialog} />}

      <FlashcardModal
        isOpen={isFlashcardOpen}
        onClose={() => setIsFlashcardOpen(false)}
        nodeData={selectedNodeData ? { label: selectedNodeData.label || '', question: selectedNodeData.question || '', answer: selectedNodeData.answer || '', sourceExcerpt: selectedNodeData.sourceExcerpt } : null}
      />

      <EditNodeModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        node={editingNode}
        onSave={handleSaveNode}
      />

      <PreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        pendingNodes={pendingNodes}
        onConfirm={handleConfirmPreview}
        onUpdateNode={(id, field, value) => setPendingNodes(current => current.map(n => n.id === id ? { ...n, data: { ...n.data, [field]: value } } : n))}
        mode={previewMode}
      />

      <ReviewOverlay
        isOpen={mode === 'review'}
        onClose={() => {
          setMode('study');
          setReviewSubtreeId(null);
        }}
        nodes={reviewSubtreeId ? getSubtreeNodes(reviewSubtreeId) : nodes}
        forceReviewAll={!!reviewSubtreeId}
        onSaveProgress={handleSaveProgress}
        topicTitle={reviewSubtreeId ? nodes.find(n => n.id === reviewSubtreeId)?.data.label : mapTitle}
        onLocateNode={id => {
          const ancestors = new Set<string>();
          let parent = edges.find(e => isTreeEdge(e) && e.target === id)?.source;
          while (parent && !ancestors.has(parent)) { ancestors.add(parent); parent = edges.find(e => isTreeEdge(e) && e.target === parent)?.source; }
          const graph = applyVisibility(nodes.map(n => ({ ...n, selected: n.id === id, data: { ...n.data, isCollapsed: ancestors.has(n.id) ? false : n.data.isCollapsed } })), edges);
          setNodes(graph.nodes); setEdges(graph.edges); setMode('study'); setReviewSubtreeId(null);
          setTimeout(() => { void fitView({ nodes: [{ id }], duration: 400, maxZoom: 1.2 }); }, 50);
        }}
        onSelectTopic={() => {
          setMode('select-topic');
        }}
      />
    </div>
    </GraphContext.Provider>
  );
}
