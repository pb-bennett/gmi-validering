import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(existsSync);

export async function openTestChrome() {
  if (!chromePath) throw new Error('Set CHROME_PATH to an installed Chrome/Chromium executable');
  const temporaryRoot = path.resolve(tmpdir());
  const profile = await mkdtemp(path.join(temporaryRoot, 'gmi-photo-chrome-'));
  const processHandle = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, '--window-size=1366,768', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, nextId = 0;
  const pending = new Map();
  const events = [];
  const close = async () => {
    socket?.close();
    processHandle.kill();
    await new Promise((resolve) => processHandle.exitCode !== null ? resolve() : processHandle.once('exit', resolve));
    // Checked absolute task profile, contained in the intended temporary root.
    if (path.dirname(path.resolve(profile)) !== temporaryRoot || !path.basename(profile).startsWith('gmi-photo-chrome-')) throw new Error('Unsafe temporary profile');
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
  };
  try {
    let port;
    for (let attempt = 0; attempt < 200; attempt++) {
      try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 50)); }
    }
    if (!port) throw new Error('Chrome did not open a debugging port');
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = pending.get(message.id);
        if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
      } else events.push(message);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Chrome command timed out: ${method}`)); }, 60000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression, timeoutMs = 30000) => {
      const until = Date.now() + timeoutMs;
      while (Date.now() < until) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Browser condition did not become true: ${expression}`);
    };
    await send('Runtime.enable'); await send('Page.enable');
    return { send, evaluate, waitFor, events, close };
  } catch (error) { await close(); throw error; }
}
