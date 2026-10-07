import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Edge } from '@xyflow/react';
import type { FlashNode, MapItem } from '../types';
import { graphContent, readMap, readStoredMaps } from '../lib/storage';

type Options = {
  nodes: FlashNode[]; edges: Edge[];
  setNodes: Dispatch<SetStateAction<FlashNode[]>>; setEdges: Dispatch<SetStateAction<Edge[]>>;
  initialNodes: FlashNode[]; initialEdges: Edge[]; resetHistory: () => void;
};
export function useMapStorage(options: Options) {
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [currentMapId, setCurrentMapId] = useState('');
  const [mapTitle, setMapTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState('正在加载…');
  const [storageError, setStorageError] = useState('');
  const refs = useRef({ maps: [] as MapItem[], active: '', title: '', ready: false, applied: '' });
  const latest = useRef(options); latest.current = options;
  const backup = useCallback(() => {
    try {
      localStorage.setItem('flashmap-maps', JSON.stringify(refs.current.maps));
      localStorage.setItem('flashmap-maps-current', refs.current.active);
      setStorageError(''); setSaveStatus('已保存到本机'); return true;
    } catch {
      setStorageError('本机保存失败，可能是存储空间已满。请导出备份后再继续。'); setSaveStatus('保存失败'); return false;
    }
  }, []);
  const newMap = useCallback((): MapItem => ({ id: crypto.randomUUID(), title: '学习指南',
    ...graphContent(latest.current.initialNodes, latest.current.initialEdges), updatedAt: new Date().toISOString() }), []);
  const apply = useCallback((map: MapItem) => {
    try {
      const graph = readMap(map);
      refs.current.applied = JSON.stringify([map.title, ...Object.values(graphContent(graph.nodes, graph.edges))]);
      refs.current.active = map.id; refs.current.title = map.title;
      setCurrentMapId(map.id); setMapTitle(map.title);
      latest.current.setNodes(graph.nodes); latest.current.setEdges(graph.edges); latest.current.resetHistory();
      return true;
    } catch { setStorageError('导图数据无法读取，请先导出备份。'); return false; }
  }, []);
  const capture = useCallback(() => {
    if (!refs.current.ready || !refs.current.active) return;
    const content = graphContent(latest.current.nodes, latest.current.edges);
    const fingerprint = JSON.stringify([refs.current.title, content.nodes, content.edges]);
    if (fingerprint === refs.current.applied) return;
    refs.current.applied = fingerprint;
    const previous = refs.current.maps.find(m => m.id === refs.current.active);
    const time = Math.max(Date.now(), Date.parse(previous?.updatedAt || '') + 1 || 0);
    const map: MapItem = { id: refs.current.active, title: refs.current.title.slice(0, 100), ...content, updatedAt: new Date(time).toISOString() };
    const next = [...refs.current.maps]; const index = next.findIndex(m => m.id === map.id);
    if (index < 0) next.push(map); else next[index] = map;
    refs.current.maps = next; setMaps(next); backup();
  }, [backup]);
  useLayoutEffect(() => {
    if (currentMapId !== refs.current.active) return;
    refs.current.title = mapTitle; capture();
  }, [options.nodes, options.edges, mapTitle, currentMapId, capture]);
  useEffect(() => {
    // Preserve existing local maps and migrate the original single-map format.
    let local: MapItem[] = [];
    try { local = readStoredMaps(localStorage, 'flashmap-maps'); }
    catch { setStorageError('无法读取本机存储。'); return; }
    if (!local.length) {
      try {
        const oldNodes = localStorage.getItem('flashmap-nodes'), oldEdges = localStorage.getItem('flashmap-edges');
        if (oldNodes && oldEdges) {
          const migrated = { ...newMap(), title: '迁移的导图', nodes: oldNodes, edges: oldEdges };
          readMap(migrated); local = [migrated];
        }
      } catch { setStorageError('旧版导图读取失败，原始数据已保留。'); }
    }
    if (!local.length) local = [newMap()];
    refs.current.maps = local; setMaps(local);
    let savedId: string | null = null;
    try { savedId = localStorage.getItem('flashmap-maps-current') || localStorage.getItem('flashmap-current-id'); }
    catch { setStorageError('无法读取本机存储。'); }
    apply(local.find(m => m.id === savedId) || local[0]); refs.current.ready = true; backup();
  }, [apply, backup, newMap]);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === 'hidden') capture(); };
    window.addEventListener('pagehide', capture); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('pagehide', capture); document.removeEventListener('visibilitychange', visibility); };
  }, [capture]);
  useEffect(() => {
    // Multiple desktop windows share a profile. Keep an older window from
    // overwriting a map newly imported by the launcher in another window.
    const update = (event: StorageEvent) => {
      if (event.key !== 'flashmap-maps' || !refs.current.ready) return;
      try {
        const incoming = readStoredMaps(localStorage, 'flashmap-maps');
        if (!incoming.length) return;
        refs.current.maps = incoming; setMaps(incoming);
        const current = incoming.find(map => map.id === refs.current.active);
        if (!current) apply(incoming[0]);
        else if (JSON.stringify([current.title, current.nodes, current.edges]) !== refs.current.applied) apply(current);
      } catch { setStorageError('另一个桌面窗口的数据更新无法读取，请导出备份。'); }
    };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, [apply]);
  const switchMap = useCallback((id: string, provided?: MapItem) => {
    capture(); const map = provided || refs.current.maps.find(m => m.id === id);
    if (map && apply(map)) backup();
  }, [apply, backup, capture]);
  const createMap = useCallback(() => {
    capture(); const map = { ...newMap(), title: '新导图', nodes: '[]', edges: '[]' };
    refs.current.maps = [map, ...refs.current.maps]; setMaps(refs.current.maps); apply(map); backup();
  }, [apply, backup, capture, newMap]);
  const importPrivateMap = useCallback((value: { id: string; title: string; nodes: FlashNode[]; edges: Edge[] }) => {
    capture();
    // Retrying a transfer selects the existing map and preserves any edits to it.
    let map = refs.current.maps.find(item => item.id === value.id);
    if (!map) {
      map = { id: value.id, title: value.title.slice(0, 100), ...graphContent(value.nodes, value.edges), updatedAt: new Date().toISOString() };
      refs.current.maps = [map, ...refs.current.maps]; setMaps(refs.current.maps);
    }
    if (!apply(map) || !backup()) return false;
    try {
      const committed = readStoredMaps(localStorage, 'flashmap-maps').find(item => item.id === map!.id);
      return !!committed && committed.title === map.title && committed.nodes === map.nodes && committed.edges === map.edges;
    } catch { return false; }
  }, [apply, backup, capture]);
  const renameMap = useCallback((id: string, title: string) => {
    title = title.trim().slice(0, 100); if (!title) return;
    if (id === refs.current.active) { refs.current.title = title; setMapTitle(title); capture(); }
    else {
      refs.current.maps = refs.current.maps.map(m => m.id === id ? { ...m, title, updatedAt: new Date().toISOString() } : m);
      setMaps(refs.current.maps); backup();
    }
  }, [backup, capture]);
  const deleteMaps = useCallback(async (id: string) => {
    capture(); const ids = new Set((id === 'ALL' ? refs.current.maps : refs.current.maps.filter(m => m.id === id)).map(m => m.id));
    refs.current.maps = refs.current.maps.filter(m => !ids.has(m.id));
    if (!refs.current.maps.length) refs.current.maps = [newMap()];
    setMaps([...refs.current.maps]); if (ids.has(refs.current.active)) apply(refs.current.maps[0]);
    return backup();
  }, [apply, backup, capture, newMap]);
  return { maps, currentMapId, mapTitle, setMapTitle, saveStatus, storageError,
    switchMap, createMap, importPrivateMap, renameMap, deleteMaps, retrySave: backup };
}
