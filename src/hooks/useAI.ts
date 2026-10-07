import { useCallback, useEffect, useRef, useState } from 'react';
import { AICancelledError, generateAI, getAIStatus, KeyRequiredError } from '../lib/ai';

export function useAI() {
  const [keyDialog, setKeyDialog] = useState<{ configured: boolean; canRemember: boolean; message?: string } | null>(null);
  const [configured, setConfigured] = useState(false);
  const waiting = useRef<((saved: boolean) => void) | null>(null);
  useEffect(() => {
    let active = true;
    void getAIStatus().then(status => { if (active) setConfigured(status.configured); }).catch(() => undefined);
    return () => { active = false; waiting.current?.(false); waiting.current = null; };
  }, []);
  const closeKeyDialog = useCallback((saved: boolean, removed = false) => {
    if (saved || removed) setConfigured(saved);
    waiting.current?.(saved); waiting.current = null; setKeyDialog(null);
  }, []);
  const requestKey = useCallback(async (message?: string, force = false) => {
    const status = await getAIStatus();
    setConfigured(status.configured);
    if (status.configured && !force) return;
    if (waiting.current) throw new AICancelledError();
    const saved = await new Promise<boolean>(resolve => {
      waiting.current = resolve;
      setKeyDialog({ ...status, message: message || status.warning });
    });
    if (!saved) throw new AICancelledError();
  }, []);
  const openKeySettings = useCallback(async () => {
    try { const status = await getAIStatus(); setConfigured(status.configured); setKeyDialog({ ...status, message: status.warning }); }
    catch (error) { alert((error as Error).message); }
  }, []);
  const generate = useCallback(async (kind: 'node' | 'tree' | 'expand', prompt: string) => {
    await requestKey();
    try { return await generateAI(kind, prompt); }
    catch (error) {
      if (!(error instanceof KeyRequiredError)) throw error;
      await requestKey(error.message, true);
      return generateAI(kind, prompt);
    }
  }, [requestKey]);
  return { generate, configured, keyDialog, closeKeyDialog, openKeySettings };
}
