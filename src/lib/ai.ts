export class KeyRequiredError extends Error {}
export class AICancelledError extends Error {}

export async function getAIStatus(): Promise<{ configured: boolean; canRemember: boolean; warning?: string }> {
  try {
    const response = await fetch('/api/ai/status', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new Error('无法连接本机 AI 服务，请通过桌面快捷方式重新打开 FlashMap'); }
}

export async function configureAIKey(key: string, remember: boolean) {
  const response = await fetch('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, remember }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error((await response.json()).error || '密钥保存失败');
}

export async function removeAIKey() {
  const response = await fetch('/api/ai/key', { method: 'DELETE', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('密钥移除失败，请重试');
}

export async function generateAI(kind: 'node' | 'tree' | 'expand', prompt: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('/api/generate', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, prompt }),
    });
    let data: { text?: unknown; error?: unknown; code?: string };
    try { data = await response.json(); } catch { throw new Error('AI 服务返回格式无效，请稍后重试'); }
    if (data.code === 'KEY_REQUIRED' || data.code === 'KEY_INVALID') throw new KeyRequiredError(typeof data.error === 'string' ? data.error : '请输入你的 Key');
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '生成失败，请稍后重试');
    if (typeof data.text !== 'string') throw new Error('AI 返回格式无效');
    try { return JSON.parse(data.text); } catch { throw new Error('AI 内容格式无效，请重试'); }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('生成超时，请缩短内容后重试');
    if (error instanceof TypeError) throw new Error('无法连接本机 AI 服务，请重新打开 FlashMap');
    throw error;
  } finally { clearTimeout(timeout); }
}

export { validateCards } from './generated';
