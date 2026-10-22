// 轻量 CDP 驱动：无 Playwright 依赖，直接用 Chrome headless 做端到端验证
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launch(port = 9333) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-chrome-'));
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    'about:blank',
  ];
  // 模拟真实 Chrome 的后台节流（默认关掉，方便自动化测试）
  if (process.env.DPR) args.push(`--force-device-scale-factor=${process.env.DPR}`);
  if (process.env.ALLOW_THROTTLE !== '1') {
    args.splice(4, 0, '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding');
  }
  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: false });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${base}/json/version`);
      if (res.ok) return { proc, base, userDataDir };
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Chrome CDP 启动超时');
}

export async function newPage(base, url) {
  const res = await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
        .join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push(`[exception] ${msg.params.exceptionDetails.text} ${msg.params.exceptionDetails.exception?.description || ''}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');

  return {
    ws,
    logs,
    send,
    async goto(targetUrl, waitMs = 1500) {
      await send('Page.navigate', { url: targetUrl });
      await new Promise((r) => setTimeout(r, waitMs));
    },
    async eval(expression, awaitPromise = true) {
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return file;
    },
    async close() {
      try {
        await fetch(`${base}/json/close/${target.id}`);
      } catch {}
      ws.close();
    },
  };
}

export async function shutdown({ proc, userDataDir }) {
  try {
    proc.kill('SIGKILL');
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}
