import { useEffect, useState } from 'react';
import { parseGraph } from '../lib/graph';
import type { Edge } from '@xyflow/react';
import type { FlashNode } from '../types';

type Import = { id: string; title: string; nodes: FlashNode[]; edges: Edge[] };
export function useDesktopImport(commit: (value: Import) => boolean) {
  const [message, setMessage] = useState('');
  const [ticket] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('desktop-import');
    return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
  });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    void (async () => {
      try {
        if (ticket) {
          // The one-use authorization is removed from the visible URL immediately.
          // This contains no AI key or study material and is sent only to localhost.
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          const open = await fetch('/desktop/open', { method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ticket }) });
          if (!open.ok) throw new Error();
        }
        const response = await fetch('/api/desktop-import/read', { method: 'POST', signal: controller.signal });
        if (!response.ok) return;
        const { transfer } = await response.json();
        if (!active || !transfer) return;
        if (typeof transfer.id !== 'string' || typeof transfer.title !== 'string') throw new Error();
        const graph = parseGraph(transfer);
        if (!commit({ id: transfer.id, title: transfer.title, ...graph })) throw new Error();
        setMessage('私人导图已加入桌面版，并保存到本机。');
        const confirmation = await fetch('/api/desktop-import/complete', { method: 'POST', signal: controller.signal });
        if (!confirmation.ok && active) setMessage('私人导图已保存。请重新打开桌面版，完成中转文件清理。');
      } catch (error) {
        if (active && !(error instanceof DOMException && error.name === 'AbortError')) setMessage('私人导入未完成，请通过桌面快捷方式重试；已有导图保留。');
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [commit, ticket]);
  return message;
}
