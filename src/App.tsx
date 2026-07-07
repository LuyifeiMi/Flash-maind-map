/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  Node,
  Edge,
  MiniMap,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GoogleGenAI, Type } from '@google/genai';
import { Brain, Sparkles, Loader2, BookOpen, ChevronRight, Edit3, Book, Network, Trash2, PlusCircle, BrainCircuit, Download, Upload, LogIn, LogOut, Folder, FileText, Plus, PanelLeftClose, PanelLeftOpen, Check, X, RotateCw, Undo2, Redo2, Settings, Link, SquareDashed, Braces } from 'lucide-react';

import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDocFromServer, collection, query, deleteDoc } from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

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
}

const initialNodes: Node[] = [
  {
    id: 'intro',
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { 
      label: 'Welcome to FlashMap', 
      question: 'How do I use this tool?', 
      answer: 'FlashMap is an AI-powered mind mapping and flashcard tool. It helps you visualize knowledge and study effectively.',
      isRoot: true,
      depth: 0
    },
  },
  {
    id: 'guide-create',
    type: 'custom',
    position: { x: 300, y: -100 },
    data: {
      label: 'Create Nodes',
      question: 'How do I create new nodes manually?',
      answer: 'In Edit mode, press Tab to add a child, Enter to add a sibling, or Shift+Tab to add an independent node. You can also use the AI generation panel.',
      isRoot: false,
      depth: 1
    }
  },
  {
    id: 'guide-ai',
    type: 'custom',
    position: { x: 300, y: 100 },
    data: {
      label: 'AI Features',
      question: 'How do I use AI?',
      answer: 'Enter your Gemini API key in Settings. Then use the left sidebar to generate new trees or expand existing selected nodes with AI.',
      isRoot: false,
      depth: 1
    }
  }
];

const initialEdges: Edge[] = [
  { id: 'e-guide-1', source: 'intro', target: 'guide-create', type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } },
  { id: 'e-guide-2', source: 'intro', target: 'guide-ai', type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }
];

const loadInitialNodes = () => {
  const saved = localStorage.getItem('flashmap-nodes');
  return saved ? JSON.parse(saved) : initialNodes;
};

const loadInitialEdges = () => {
  const saved = localStorage.getItem('flashmap-edges');
  return saved ? JSON.parse(saved) : initialEdges;
};

const isDescendant = (potentialDescendantId: string, ancestorId: string, currentEdges: Edge[]): boolean => {
  if (potentialDescendantId === ancestorId) return true;
  const children = currentEdges.filter(e => e.source === ancestorId).map(e => e.target);
  for (const childId of children) {
    if (isDescendant(potentialDescendantId, childId, currentEdges)) {
      return true;
    }
  }
  return false;
};

const getDescendants = (nodeId: string, currentEdges: Edge[]): string[] => {
  const children = currentEdges.filter(e => e.source === nodeId).map(e => e.target);
  let descendants = [...children];
  for (const childId of children) {
    descendants = descendants.concat(getDescendants(childId, currentEdges));
  }
  return descendants;
};

interface MapItem {
  id: string;
  title: string;
  nodes: string;
  edges: string;
  updatedAt: string;
}

export default function App() {
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [maps, setMaps] = useState<MapItem[]>([]);
  const [currentMapId, setCurrentMapId] = useState<string>('');
  const [mapTitle, setMapTitle] = useState('Untitled Map');
  
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  
  const [newNodeTitle, setNewNodeTitle] = useState('');
  const [newNodeContent, setNewNodeContent] = useState('');
  const [isGeneratingNode, setIsGeneratingNode] = useState(false);
  
  const [mode, setMode] = useState<'study' | 'edit' | 'review' | 'select-topic'>('study');
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(() => {
    const saved = localStorage.getItem('flashmap-show-minimap');
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem('flashmap-show-minimap', JSON.stringify(showMiniMap));
  }, [showMiniMap]);


  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
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
  const isRemoteUpdateRef = useRef(false);

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
      return [...p, currentState];
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
    const data = { nodes, edges };
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

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const data = JSON.parse(content);
        if (data.nodes && data.edges) {
          takeSnapshot();
          setNodes(data.nodes);
          setEdges(data.edges);
        } else {
          alert('Invalid file format. Please upload a valid FlashMap export file.');
        }
      } catch (error) {
        console.error('Failed to parse file:', error);
        alert('Failed to parse file. Please ensure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const currentMapIdRef = useRef(currentMapId);
  useEffect(() => { currentMapIdRef.current = currentMapId; }, [currentMapId]);

  const switchMap = useCallback((mapId: string, mapObj?: MapItem) => {
    const map = mapObj || maps.find(m => m.id === mapId);
    if (map) {
      setCurrentMapId(mapId);
      setMapTitle(map.title);
      isRemoteUpdateRef.current = true;
      try {
        setPast([]);
        setFuture([]);
        setNodes(JSON.parse(map.nodes));
        setEdges(JSON.parse(map.edges));
      } catch (e) {
        console.error("Failed to parse map data", e);
      }
      setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
      if (!auth.currentUser) {
        localStorage.setItem('flashmap-current-id', mapId);
      }
    }
  }, [maps, setNodes, setEdges]);

  const hasLoadedLocalRef = useRef(false);

  // Initial Local Load
  useEffect(() => {
    if (!isAuthReady) return;
    if (user) {
      hasLoadedLocalRef.current = false;
      return;
    }
    if (hasLoadedLocalRef.current) return;

    const savedMaps = localStorage.getItem('flashmap-maps');
    let loadedMaps: MapItem[] = [];
    if (savedMaps) {
      loadedMaps = JSON.parse(savedMaps);
    } else {
      const oldNodes = localStorage.getItem('flashmap-nodes');
      const oldEdges = localStorage.getItem('flashmap-edges');
      loadedMaps = [{
        id: crypto.randomUUID(),
        title: oldNodes ? 'Migrated Map' : 'Beginner\'s Guide',
        nodes: oldNodes || JSON.stringify(initialNodes),
        edges: oldEdges || JSON.stringify(initialEdges),
        updatedAt: new Date().toISOString()
      }];
    }
    setMaps(loadedMaps);
    const savedId = localStorage.getItem('flashmap-current-id');
    const mapToLoad = loadedMaps.find(m => m.id === savedId) || loadedMaps[0];
    
    setCurrentMapId(mapToLoad.id);
    setMapTitle(mapToLoad.title);
    isRemoteUpdateRef.current = true;
    try {
      setPast([]);
      setFuture([]);
      setNodes(JSON.parse(mapToLoad.nodes));
      setEdges(JSON.parse(mapToLoad.edges));
    } catch (e) {
      console.error("Failed to parse map data", e);
    }
    setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
    localStorage.setItem('flashmap-current-id', mapToLoad.id);
    
    hasLoadedLocalRef.current = true;
  }, [user, isAuthReady, setNodes, setEdges]);

  // One-time migration to apply new layout spacing
  useEffect(() => {
    if (nodes.length > 0 && !localStorage.getItem('flashmap-layout-migrated-v6')) {
      if (nodes.length > 1 && edges.length > 0) {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, 'LR');
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
      }
      localStorage.setItem('flashmap-layout-migrated-v6', 'true');
    }
  }, [nodes, edges, setNodes, setEdges]);
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const q = query(collection(db, 'users', user.uid, 'maps'));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loadedMaps: MapItem[] = [];
      snapshot.forEach(document => {
        loadedMaps.push(document.data() as MapItem);
      });
      loadedMaps.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      if (loadedMaps.length === 0) {
        // Try to migrate from old mapData/current
        try {
          const oldDoc = await getDocFromServer(doc(db, 'users', user.uid, 'mapData', 'current'));
          const newId = crypto.randomUUID();
          const defaultMap = {
            id: newId,
            title: oldDoc.exists() ? 'Migrated Map' : 'Beginner\'s Guide',
            nodes: oldDoc.exists() ? oldDoc.data().nodes : JSON.stringify(initialNodes),
            edges: oldDoc.exists() ? oldDoc.data().edges : JSON.stringify(initialEdges),
            updatedAt: new Date().toISOString(),
            uid: user.uid
          };
          await setDoc(doc(db, 'users', user.uid, 'maps', newId), defaultMap);
        } catch (e) {
          console.error("Migration failed", e);
        }
        return;
      }

      setMaps(loadedMaps);

      const activeId = currentMapIdRef.current;
      const activeMap = loadedMaps.find(m => m.id === activeId);
      
      if (!activeId || !activeMap) {
        const mapToLoad = loadedMaps[0];
        setCurrentMapId(mapToLoad.id);
        setMapTitle(mapToLoad.title);
        isRemoteUpdateRef.current = true;
        try {
          setPast([]);
          setFuture([]);
          setNodes(JSON.parse(mapToLoad.nodes));
          setEdges(JSON.parse(mapToLoad.edges));
        } catch(e) {}
        setTimeout(() => { isRemoteUpdateRef.current = false; }, 100);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/maps`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady, setNodes, setEdges]);

  // Keep refs updated for keyboard shortcuts and save to Firestore
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    
    if (!isAuthReady || !currentMapId) return;
    if (isRemoteUpdateRef.current) return;

    const save = async () => {
      setIsSyncing(true);
      const updatedMap: MapItem = {
        id: currentMapId,
        title: mapTitle,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        updatedAt: new Date().toISOString()
      };

      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid, 'maps', currentMapId), {
            ...updatedMap,
            uid: user.uid
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/maps/${currentMapId}`);
        } finally {
          setIsSyncing(false);
        }
      } else {
        setMaps(prev => {
          const newMaps = prev.map(m => m.id === currentMapId ? updatedMap : m);
          if (!newMaps.find(m => m.id === currentMapId)) newMaps.push(updatedMap);
          localStorage.setItem('flashmap-maps', JSON.stringify(newMaps));
          localStorage.setItem('flashmap-current-id', currentMapId);
          return newMaps;
        });
        setIsSyncing(false);
      }
    };
    
    const timeoutId = setTimeout(save, 1000);
    return () => clearTimeout(timeoutId);
  }, [nodes, edges, mapTitle, currentMapId, user, isAuthReady]);

  const handleCreateMap = async () => {
    const newId = crypto.randomUUID();
    const newMap: MapItem = {
      id: newId,
      title: 'New Map',
      nodes: JSON.stringify(initialNodes),
      edges: JSON.stringify(initialEdges),
      updatedAt: new Date().toISOString()
    };
    
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'maps', newId), { ...newMap, uid: user.uid });
    } else {
      const newMaps = [newMap, ...maps];
      setMaps(newMaps);
      localStorage.setItem('flashmap-maps', JSON.stringify(newMaps));
    }
    switchMap(newId, newMap);
  };

  const handleRenameMap = async (mapId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingMapId(null);
      return;
    }
    if (mapId === currentMapId) {
      setMapTitle(newTitle);
    } else {
      const mapToUpdate = maps.find(m => m.id === mapId);
      if (mapToUpdate) {
        const updated = { ...mapToUpdate, title: newTitle, updatedAt: new Date().toISOString() };
        if (user) {
          await setDoc(doc(db, 'users', user.uid, 'maps', mapId), { ...updated, uid: user.uid });
        } else {
          setMaps(prev => {
            const newMaps = prev.map(m => m.id === mapId ? updated : m);
            localStorage.setItem('flashmap-maps', JSON.stringify(newMaps));
            return newMaps;
          });
        }
      }
    }
    setEditingMapId(null);
  };

  const handleDeleteMap = (mapId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMapToDelete(mapId);
  };

  const confirmDeleteMap = async () => {
    if (!mapToDelete) return;
    const mapId = mapToDelete;
    
    if (mapId === 'ALL') {
      if (user) {
        for (const map of maps) {
          await deleteDoc(doc(db, 'users', user.uid, 'maps', map.id));
        }
      } else {
        localStorage.removeItem('flashmap-maps');
        localStorage.removeItem('flashmap-current-id');
        const defaultMapId = crypto.randomUUID();
        const defaultMap = {
          id: defaultMapId,
          title: 'Beginner\'s Guide',
          nodes: JSON.stringify(initialNodes),
          edges: JSON.stringify(initialEdges),
          updatedAt: new Date().toISOString()
        };
        setMaps([defaultMap]);
        switchMap(defaultMapId, defaultMap);
      }
    } else {
      if (user) {
        await deleteDoc(doc(db, 'users', user.uid, 'maps', mapId));
      } else {
        const newMaps = maps.filter(m => m.id !== mapId);
        if (newMaps.length === 0) {
          const defaultMapId = crypto.randomUUID();
          const defaultMap = {
            id: defaultMapId,
            title: 'Beginner\'s Guide',
            nodes: JSON.stringify(initialNodes),
            edges: JSON.stringify(initialEdges),
            updatedAt: new Date().toISOString()
          };
          setMaps([defaultMap]);
          switchMap(defaultMapId, defaultMap);
          localStorage.setItem('flashmap-maps', JSON.stringify([defaultMap]));
        } else {
          setMaps(newMaps);
          localStorage.setItem('flashmap-maps', JSON.stringify(newMaps));
          if (currentMapId === mapId) {
            switchMap(newMaps[0].id, newMaps[0]);
          }
        }
      }
    }
    setMapToDelete(null);
  };

  const handleClearAllMaps = () => {
    setMapToDelete('ALL');
  };

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }, eds)),
    [setEdges],
  );

  const onToggleCollapse = useCallback((nodeId: string) => {
    let isCollapsed = false;
    let descendants: string[] = [];

    setNodes((nds) => {
      const nodeToToggle = nds.find((n) => n.id === nodeId);
      if (!nodeToToggle) return nds;

      isCollapsed = !nodeToToggle.data.isCollapsed;

      // Find all descendant nodes using edgesRef
      const getDescendants = (id: string, currentEdges: Edge[]): string[] => {
        const children = currentEdges.filter((e) => e.source === id).map((e) => e.target);
        return children.reduce((acc, childId) => {
          return [...acc, childId, ...getDescendants(childId, currentEdges)];
        }, children);
      };

      descendants = getDescendants(nodeId, edgesRef.current);

      return nds.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, isCollapsed } };
        }
        if (descendants.includes(n.id)) {
          return { ...n, hidden: isCollapsed };
        }
        return n;
      });
    });

    setEdges((eds) => {
      return eds.map((e) => {
        if (descendants.includes(e.target)) {
          return { ...e, hidden: isCollapsed };
        }
        return e;
      });
    });

    // We need to trigger layout after state updates
    setTimeout(() => {
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges, 'LR');
          setNodes(layoutedNodes);
          return layoutedEdges;
        });
        return currentNodes;
      });
    }, 50);
  }, [setNodes, setEdges]);

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
      if (mode === 'study') {
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
      
      let nextEdges = edgesRef.current;
      let nextNodes = nextNodesForLayout;

      if (currentDropType === 'floating') {
        nextEdges = nextEdges.filter(e => e.target !== node.id);
        nextNodes = nextNodes.map(n => n.id === node.id ? { ...n, data: { ...n.data, isRoot: true } } : n);
      } else if (currentTargetId) {
        nextEdges = nextEdges.filter(e => e.target !== node.id);
        
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
          const targetParentEdge = edgesRef.current.find(e => e.target === currentTargetId);
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
            const targetParentEdge = edgesRef.current.find(e => e.target === targetNodeId);
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
      nextEdges = nextEdges.filter((e) => e.target !== node.id);
      shouldLayout = true;
    } else if (targetNodeId && targetNodeId !== node.id) {
      const filtered = nextEdges.filter((e) => e.target !== node.id);
      
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
        const targetParentEdge = edgesRef.current.find(e => e.target === targetNodeId);
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
        const hasIncoming = nextEdges.some(e => e.target === node.id);
        if (hasIncoming) {
          // Disconnect if dragged far away horizontally
          nextEdges = nextEdges.filter(e => e.target !== node.id);
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

  const handleSaveNode = (nodeId: string, newData: any) => {
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

  const handleSaveProgress = (results: any[]) => {
    if (results.length === 0) return;
    takeSnapshot();
    setNodes(nds => nds.map(n => {
      const res = results.find(r => r.id === n.id);
      if (res) {
        const newData = { ...n.data };
        if (res.isSuspended !== undefined) {
          newData.isSuspended = res.isSuspended;
        }
        if (res.srsLevel !== undefined) {
          newData.srsLevel = res.srsLevel;
        }
        if (res.nextReviewDate !== undefined) {
          newData.nextReviewDate = res.nextReviewDate;
        }
        return { ...n, data: newData };
      }
      return n;
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
        question: 'Question?', 
        answer: 'Answer', 
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
        isRoot: false
      },
    };
    
    const newEdges = selectedNodes.map(n => ({
      id: `e-${n.id}-${newNodeId}`,
      source: n.id,
      target: newNodeId,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#818cf8', strokeWidth: 2 }
    }));
    
    setNodes(ns => [...ns.map(n => ({...n, selected: false})), { ...newNode, selected: true }]);
    setEdges(es => [...es, ...newEdges]);
    
    setTimeout(() => {
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges, 'LR');
          setNodes(layoutedNodes);
          return layoutedEdges;
        });
        return currentNodes;
      });
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
      setNodes((currentNodes) => {
        setEdges((currentEdges) => {
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges, 'LR');
          setNodes(layoutedNodes);
          return layoutedEdges;
        });
        return currentNodes;
      });
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
      id: `rel-${Date.now()}`,
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

    const parentEdge = currentEdges.find(e => e.target === selectedNode.id);
    
    const newNodeId = `node-${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 0, y: 0 },
      data: { 
        label: 'New Concept', 
        question: 'Question?', 
        answer: 'Answer', 
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
        question: 'Question?', 
        answer: 'Answer', 
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
    const subtreeNodeIds = new Set<string>([rootId]);
    let added = true;
    while (added) {
      added = false;
      edges.forEach(edge => {
        if (subtreeNodeIds.has(edge.source) && !subtreeNodeIds.has(edge.target)) {
          subtreeNodeIds.add(edge.target);
          added = true;
        }
      });
    }
    return nodes.filter(n => subtreeNodeIds.has(n.id));
  }, [edges, nodes]);

  const handleReviewSubtree = useCallback(() => {
    if (!contextMenu) return;
    setReviewSubtreeId(contextMenu.nodeId);
    setMode('review');
    setContextMenu(null);
  }, [contextMenu]);

  const handleLayout = useCallback(() => {
    takeSnapshot();
    setNodes((currentNodes) => {
      setEdges((currentEdges) => {
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges, 'LR');
        setNodes(layoutedNodes);
        return layoutedEdges;
      });
      return currentNodes;
    });
  }, [takeSnapshot, setNodes, setEdges]);

  const handleGenerateNode = async () => {
    if (!newNodeTitle.trim() && !newNodeContent.trim()) return;
    
    setIsGeneratingNode(true);
    try {
      const prompt = `Based on the following title and content, generate a single flashcard node.
      Keep the 'label' concise (1-4 words).
      
      Title: ${newNodeTitle}
      Content: ${newNodeContent}`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              question: { type: Type.STRING },
              answer: { type: Type.STRING }
            },
            required: ["label", "question", "answer"]
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();

      const parsedData = JSON.parse(response.text || '{}');
      
      if (parsedData.label && parsedData.question && parsedData.answer) {
        takeSnapshot();
        
        const selectedNodes = nodesRef.current.filter(n => n.selected);
        const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

        if (selectedNode) {
          const newNode: Node = {
            id: crypto.randomUUID(),
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
              label: parsedData.label,
              question: parsedData.question,
              answer: parsedData.answer,
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
            setNodes((currentNodes) => {
              setEdges((currentEdges) => {
                const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(currentNodes, currentEdges, 'LR');
                setNodes(layoutedNodes);
                return layoutedEdges;
              });
              return currentNodes;
            });
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
      console.error("Failed to generate node:", error);
      alert("Failed to generate node. Please try again.");
    } finally {
      setIsGeneratingNode(false);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    
    const selectedNodes = nodes.filter(n => n.selected);
    const targetNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

    setIsGenerating(true);
    try {
      const prompt = `Analyze the following text or topic and create a highly detailed, comprehensive mind map. 
      
      Instructions:
      1. Extract and summarize all key knowledge points, breaking them down into a deep hierarchical structure (main topics -> subtopics -> specific details).
      2. Do not be overly general; dive deep into the specifics and nuances.
      3. For EVERY single node (knowledge point), create a specific, detailed flashcard with a challenging question and a comprehensive answer to rigorously test the user's understanding.
      
      Return a flat JSON array of nodes. 
      - The root node should have a parentId of null.
      - Every other node must have a parentId corresponding to its parent concept.
      - Keep the 'label' concise (1-5 words) representing the topic.
      - The 'question' and 'answer' should contain the detailed flashcard content.
      
      ${targetNode ? `Context: This new mind map will be attached as a sub-topic to the concept "${targetNode.data.label}".\n      ` : ''}Input text/topic:
      ${inputText}`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                parentId: { type: Type.STRING, nullable: true },
                label: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING }
              },
              required: ["id", "label", "question", "answer"]
            }
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();

      const rawData: FlashcardData[] = JSON.parse(response.text || '[]');
      
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
          data: { label: item.label, question: item.question, answer: item.answer, isRoot: isRoot && !targetNode }
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
      console.error("Failed to generate mind map:", error);
      alert("Failed to generate mind map. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAIExpand = async () => {
    const selectedNodes = nodes.filter(n => n.selected);
    if (selectedNodes.length !== 1) return;
    const targetNode = selectedNodes[0];

    setIsExpanding(true);
    try {
      const prompt = `The user wants to deeply expand the concept "${targetNode.data.label}". 
      Context: Question: "${targetNode.data.question}", Answer: "${targetNode.data.answer}".
      
      Generate 4 to 8 highly detailed sub-concepts that dive deep into the specifics, nuances, or components of this topic.
      For each sub-concept, extract the core knowledge point and create a detailed flashcard with a challenging question and a comprehensive answer.
      
      Return a flat JSON array of nodes.
      - id: unique string identifier
      - label: short title (1-5 words)
      - question: detailed flashcard question
      - answer: comprehensive flashcard answer`;

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, schema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                label: { type: Type.STRING },
                question: { type: Type.STRING },
                answer: { type: Type.STRING }
              },
              required: ["id", "label", "question", "answer"]
            }
          } 
        })
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Generation failed");
      }
      const data = await response.json();

      const parsedData = JSON.parse(response.text || '[]');
      
      const newNodes: Node[] = parsedData.map((item: any) => ({
        id: `node-${Date.now()}-${item.id}`,
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
      console.error("Failed to expand node:", error);
      alert("Failed to expand node with AI.");
    } finally {
      setIsExpanding(false);
    }
  };

  const handleConfirmPreview = (selectedIds: string[]) => {
    takeSnapshot();
    const approvedNodes = pendingNodes.filter(n => selectedIds.includes(n.id));
    
    const approvedEdges = pendingEdges.filter(e => {
      if (!selectedIds.includes(e.target)) return false;
      const sourceExists = nodes.some(n => n.id === e.source) || selectedIds.includes(e.source);
      return sourceExists;
    });

    const finalNewNodes = approvedNodes.map(n => {
      const hasIncomingEdge = approvedEdges.some(e => e.target === n.id);
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

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.log('User closed the sign-in popup.');
      } else {
        console.error('Sign-in error:', error);
        alert('Failed to sign in: ' + error.message);
      }
    }
  };

  return (
    <GraphContext.Provider value={{ onToggleCollapse }}>
      <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
        {/* Sidebar */}
        <div className={cn("bg-white border-r border-slate-200 flex flex-col shadow-sm z-20 transition-all duration-300 overflow-hidden shrink-0", isSidebarOpen ? "w-80" : "w-0 border-none opacity-0")}>
          <div className="w-80 flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-200">
              <Brain size={24} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">FlashMap</h1>
              <p className="text-xs text-slate-500 font-medium">
                {user ? (isSyncing ? 'Syncing...' : 'Saved to Cloud') : 'Auto-saved locally'}
              </p>
            </div>
            <div>
              {user ? (
                <button onClick={() => signOut(auth)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors" title="Sign Out">
                  <LogOut size={18} />
                </button>
              ) : (
                <button onClick={handleSignIn} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Sign In to Sync">
                  <LogIn size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
            
            {/* Folders / Maps Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Folder size={16} className="text-indigo-500" />
                  My Maps
                </label>
                <button onClick={handleCreateMap} className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="New Map">
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
                            title="Rename Map"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button 
                            onClick={(e) => handleDeleteMap(map.id, e)}
                            className="p-1 text-slate-400 hover:text-red-500 rounded"
                            title="Delete Map"
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

          {/* AI Generate Node Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BrainCircuit size={16} className="text-fuchsia-500" />
              Generate New Node
            </label>
            <input
              type="text"
              value={newNodeTitle}
              onChange={(e) => setNewNodeTitle(e.target.value)}
              placeholder="Node Title (Optional)"
              className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <textarea
              value={newNodeContent}
              onChange={(e) => setNewNodeContent(e.target.value)}
              placeholder="Enter content to generate a node..."
              className="w-full h-20 p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 focus:border-transparent resize-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <button
              onClick={handleGenerateNode}
              disabled={isGeneratingNode || (!newNodeTitle.trim() && !newNodeContent.trim())}
              className="w-full py-2 px-4 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isGeneratingNode ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate Node
            </button>
          </div>

          <hr className="border-slate-100 my-2" />

          {/* AI Generation Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-500" />
              Generate New Tree
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Enter a topic or paste notes to generate a completely new tree in this map..."
              className="w-full h-32 p-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none transition-all text-sm text-slate-700 placeholder:text-slate-400"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !inputText.trim()}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Generate Tree
            </button>
          </div>

          <hr className="border-slate-100 my-2" />

          {/* AI Assistant Section (Contextual) */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Brain size={16} className="text-emerald-500" />
              AI Assistant
            </label>
            {selectedNodeCount === 1 ? (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs text-emerald-800 mb-3">
                  Selected: <span className="font-bold">{nodes.find(n => n.selected)?.data.label}</span>
                </p>
                <button
                  onClick={handleAIExpand}
                  disabled={isExpanding}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {isExpanding ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                  AI Expand Concept
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500">Select exactly one node on the canvas to let AI expand it with sub-concepts.</p>
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
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-1.5"
              >
                <Upload size={14} />
                Import
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
              Auto Layout
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
              Restore Beginner's Guide
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
                  Add Independent Node
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedNodeCount !== 1}
                  className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 disabled:bg-slate-50 disabled:border-slate-200 disabled:text-slate-400 text-red-600 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} />
                  Delete Node & Subtree
                </button>
              </>
            )}
          </div>

          <hr className="border-slate-100 my-2" />

          {/* Settings Section */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Settings size={16} className="text-slate-500" />
              Settings
            </label>
            <label className="flex items-center justify-between cursor-pointer p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
              <span className="text-sm text-slate-700">Show Minimap</span>
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
            <button
              onClick={handleClearAllMaps}
              className="w-full py-2 px-4 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-xs font-medium transition-all flex items-center justify-center gap-2 mt-2"
            >
              <Trash2 size={14} />
              Clear All Maps
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
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
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
            <Book size={16} /> Study Mode
          </button>
          <button
            onClick={() => setMode('edit')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
              mode === 'edit' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <Edit3 size={16} /> Edit Mode
          </button>
          <button
            onClick={() => setMode('review')}
            className={cn(
              "px-6 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2",
              mode === 'review' ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            )}
          >
            <BrainCircuit size={16} /> Review Mode
          </button>
        </div>

        <ReactFlow
          nodes={[...nodes.filter(n => !n.hidden), ...previewLayoutNodes]}
          edges={[...edges.filter(e => !e.hidden), ...previewLayoutEdges].map(e => ({ ...e, type: 'smoothstep' }))}
          defaultEdgeOptions={{ type: 'smoothstep', animated: true, style: { stroke: '#818cf8', strokeWidth: 2 } }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
              <Sparkles size={16} /> Click any node to flip the flashcard!
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
                Cancel
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
                  {mapToDelete === 'ALL' ? 'Clear All Maps' : 'Delete Map'}
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
                    Cancel
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

      <FlashcardModal 
        isOpen={isFlashcardOpen} 
        onClose={() => setIsFlashcardOpen(false)} 
        nodeData={selectedNodeData} 
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
        onSelectTopic={() => {
          setMode('select-topic');
        }}
      />
    </div>
    </GraphContext.Provider>
  );
}

