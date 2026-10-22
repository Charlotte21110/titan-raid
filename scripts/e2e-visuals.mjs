// 逐个机制截图：验证四个机制的预警/播报/画面
import { launch, newPage, shutdown } from './cdp.mjs';

const BASE = process.env.URL || 'http://127.0.0.1:5173/';
const URL = `${BASE}?speed=2`;
const shots = '/tmp/titan-e2e';
const fs = await import('node:fs');
fs.mkdirSync(shots, { recursive: true });

const chrome = await launch(9340);

async function join(page, name, job) {
  await page.goto(URL, 1500);
  await page.eval(`(() => {
    const input = document.querySelector('#raid-name');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.job-btn.job-${job}').click();
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 350));
  await page.eval(`document.querySelector('.join-foot .btn').click()`);
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await page.eval(`!!document.querySelector('.lobby-title')`).catch(() => false)) return;
  }
  throw new Error('未进入大厅');
}

try {
  const host = await newPage(chrome.base, URL);
  const guest = await newPage(chrome.base, URL);
  await join(host, '截图坦克', 'warrior');
  await join(guest, '截图白魔', 'white');
  await new Promise((r) => setTimeout(r, 1000));
  await host.eval(`document.querySelector('.lobby-foot .btn.primary')?.click()`);

  let lastText = '';
  const seen = new Set();
  const started = Date.now();
  while (Date.now() - started < 42000) {
    const text = await host.eval(`document.querySelector('.banner-call')?.textContent || ''`).catch(() => '');
    if (text && text !== lastText) {
      lastText = text;
      const key = text.slice(0, 2);
      if (!seen.has(key)) {
        seen.add(key);
        await new Promise((r) => setTimeout(r, 250));
        const file = `${shots}/mech-${key}.png`;
        await host.screenshot(file);
        console.log('captured', key, '->', file, '|', text);
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log('log tail:', await host.eval(`Array.from(document.querySelectorAll('.log-text')).slice(0,12).map(e=>e.textContent).join(' || ')`));
  console.log('errors:', host.logs.filter((l) => l.startsWith('[error]') || l.startsWith('[exception]')).slice(0, 5));
  await host.close();
  await guest.close();
} catch (error) {
  console.error('VISUAL E2E FAILED:', error);
  process.exitCode = 1;
} finally {
  await shutdown(chrome);
}
