import { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, X } from 'lucide-react';
import { configureAIKey, removeAIKey } from '../lib/ai';

export function AIKeyModal({ configured, canRemember, message, onClose }: {
  configured: boolean; canRemember: boolean; message?: string;
  onClose: (saved: boolean, removed?: boolean) => void;
}) {
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(canRemember);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => { previous?.focus(); };
  }, []);
  const close = () => { if (!busy) { setKey(''); onClose(false); } };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    const value = key.trim(); setKey(''); setError(''); setBusy(true);
    try { await configureAIKey(value, remember); onClose(true); }
    catch { setError('密钥保存失败。请检查输入；加密不可用时可取消勾选“加密保存”，仅本次使用。'); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    setKey(''); setBusy(true); setError('');
    try { await removeAIKey(); onClose(false, true); }
    catch { setError('密钥移除失败，请稍后重试。'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={close}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="ai-key-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
          const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><KeyRound size={24} /></span>
        <h2 id="ai-key-title" className="flex-1 text-lg font-semibold text-slate-800">{configured ? 'AI 密钥设置' : '请输入你的 Key'}</h2>
        <button onClick={close} disabled={busy} aria-label="关闭密钥窗口" className="p-2 text-slate-400"><X size={18} /></button>
      </div>
      <p className="mb-4 text-sm leading-6 text-slate-600">AI 需要你的 Gemini API Key。导图编辑和闪卡复习可以离线使用。</p>
      {configured && <p className="mb-3 text-xs text-emerald-700">已配置密钥，出于保密不会显示。输入新密钥可替换。</p>}
      {message && <p className="mb-3 text-xs text-amber-700">{message}</p>}
      <form onSubmit={save} autoComplete="off">
        <label htmlFor="ai-key-input" className="mb-2 block text-sm font-medium text-slate-700">Gemini API Key</label>
        <input ref={input} id="ai-key-input" type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={256} required disabled={busy}
          value={key} onChange={event => setKey(event.target.value)} placeholder="在这里输入你的 Key" className="w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-indigo-500" />
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={remember} disabled={!canRemember || busy} onChange={event => setRemember(event.target.checked)} className="mt-1" />
          <span>{canRemember ? '使用 Windows 当前账户加密保存，下次自动使用' : '此系统仅支持本次使用，不保存密钥'}</span>
        </label>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={16} className="mt-0.5 shrink-0" />密钥不会写入导图、导出文件或浏览器存储。仅在使用 AI 时由本机服务发送给 Gemini。</p>
        {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={close} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600">暂不使用</button>
          <button type="submit" disabled={busy || !key.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}保存并继续</button>
        </div>
      </form>
      {configured && <button onClick={() => void remove()} disabled={busy} className="mt-4 text-xs text-rose-600">移除本机保存的密钥</button>}
    </div>
  </div>;
}
