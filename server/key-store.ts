import { spawn } from 'node:child_process';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface KeyStore {
  get(): Promise<string>;
  set(key: string, remember: boolean): Promise<void>;
  clear(): Promise<void>;
}

// Only static code goes into the command line. Sensitive bytes travel through pipes.
export function dpapi(value: string, operation: 'Protect' | 'Unprotect'): Promise<string> {
  if (process.platform !== 'win32') return Promise.reject(new Error('Windows encryption unavailable'));
  const command = `$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Security; ` +
    `$inputValue=[Console]::In.ReadToEnd(); ` +
    (operation === 'Protect' ? `$bytes=[Text.Encoding]::UTF8.GetBytes($inputValue); ` : `$bytes=[Convert]::FromBase64String($inputValue); `) +
    `$result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); ` +
    (operation === 'Protect' ? `[Console]::Out.Write([Convert]::ToBase64String($result))` : `[Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))`);
  return new Promise((resolve, reject) => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Encryption timeout')); }, 15_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; });
    child.on('error', () => { clearTimeout(timeout); reject(new Error('Encryption unavailable')); });
    child.stdin.on('error', () => { /* Exit handler reports a fixed error. */ });
    child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(output) : reject(new Error('Encryption failed')); });
    child.stdin.end(value);
  });
}

export function createKeyStore(directory = path.join(process.env.LOCALAPPDATA || process.cwd(), 'FlashMap')): KeyStore {
  const filename = path.join(directory, 'ai-key.dpapi');
  let key: string | undefined;
  // Serialize mutations so simultaneous windows cannot overwrite a newer key.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };
  return {
    get: () => serial(async () => {
      if (key !== undefined) return key;
      try { key = await dpapi(await readFile(filename, 'utf8'), 'Unprotect'); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Saved key unavailable');
        key = '';
      }
      return key;
    }),
    set: (value, remember) => serial(async () => {
      if (remember) {
        const encrypted = await dpapi(value, 'Protect');
        await mkdir(directory, { recursive: true });
        const temporary = `${filename}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, encrypted, { mode: 0o600, flag: 'wx' }); await rename(temporary, filename); }
        finally { await rm(temporary, { force: true }); }
      } else await rm(filename, { force: true });
      key = value;
    }),
    clear: () => serial(async () => { await rm(filename, { force: true }); key = ''; }),
  };
}
