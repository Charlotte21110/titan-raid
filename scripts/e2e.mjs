// 端到端冒烟：两个浏览器页签同房 → 一个当房主开团 → 双方都能看到快照与 CDC
import { launch, newPage, shutdown } from './cdp.mjs';

const URL = process.env.URL || 'http://127.0.0.1:5173/';
const shots = '/tmp/titan-e2e';
const fs = await import('node:fs');
fs.mkdirSync(shots, { recursive: true });

const chrome = await launch(9333);
const consoleErrors = [];

async function join(page, name, job) {
  await page.goto(URL, 1800);
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
    await new Promise((r) => setTimeout(r, 500));
    const connected = await page.eval(`!!document.querySelector('.topbar') || !!document.querySelector('.lobby-title')`).catch(() => false);
    if (connected) return true;
    const status = await page.eval(`document.querySelector('.join-status')?.textContent || ''`).catch(() => '');
    if (status.includes('连接失败')) throw new Error(`${name} 连接失败: ${status}`);
  }
  return false;
}

try {
  const host = await newPage(chrome.base, URL);
  const guest = await newPage(chrome.base, URL);

  console.log('join host...');
  console.log('host joined:', await join(host, '测试坦克', 'warrior'));
  console.log('join guest...');
  console.log('guest joined:', await join(guest, '测试白魔', 'white'));
  await new Promise((r) => setTimeout(r, 2500));

  const hostLobby = await host.eval(`document.querySelector('.lobby-title')?.textContent || ''`);
  const guestLobby = await guest.eval(`document.querySelector('.lobby-title')?.textContent || ''`);
  console.log('lobby:', hostLobby, '/', guestLobby);
  console.log('slots host:', await host.eval(`Array.from(document.querySelectorAll('.slot-name')).map(e=>e.textContent).join(' | ')`));
  await host.screenshot(`${shots}/01-lobby.png`);

  console.log('host starts raid...');
  await host.eval(`document.querySelector('.lobby-foot .btn.primary')?.click()`);
  await new Promise((r) => setTimeout(r, 9000));

  console.log('host phase:', await host.eval(`document.querySelector('.top-meta')?.textContent || ''`));
  console.log('guest phase:', await guest.eval(`document.querySelector('.top-meta')?.textContent || ''`));
  console.log('host party:', await host.eval(`Array.from(document.querySelectorAll('.pcard .pname')).map(e=>e.textContent).join(' | ')`));
  console.log('guest party:', await guest.eval(`Array.from(document.querySelectorAll('.pcard .pname')).map(e=>e.textContent).join(' | ')`));
  console.log('host log:', await host.eval(`Array.from(document.querySelectorAll('.log-text')).slice(0,4).map(e=>e.textContent).join(' || ')`));
  console.log('guest log:', await guest.eval(`Array.from(document.querySelectorAll('.log-text')).slice(0,4).map(e=>e.textContent).join(' || ')`));
  console.log('host cdc pill:', await host.eval(`Array.from(document.querySelectorAll('.pill')).map(e=>e.textContent).join(' / ')`));
  console.log('boss hp:', await host.eval(`document.querySelector('.boss-hp-text')?.textContent || ''`));

  await host.screenshot(`${shots}/02-host.png`);
  await guest.screenshot(`${shots}/03-guest.png`);

  console.log('host console errors:', host.logs.filter((line) => line.startsWith('[error]') || line.startsWith('[exception]')).slice(0, 6));
  console.log('guest console errors:', guest.logs.filter((line) => line.startsWith('[error]') || line.startsWith('[exception]')).slice(0, 6));

  await new Promise((r) => setTimeout(r, 6000));
  await host.screenshot(`${shots}/04-later.png`);
  console.log('later log:', await host.eval(`Array.from(document.querySelectorAll('.log-text')).slice(0,6).map(e=>e.textContent).join(' || ')`));
  console.log('later hp:', await host.eval(`document.querySelector('.boss-hp-text')?.textContent || ''`));
  console.log('later banner:', await host.eval(`document.querySelector('.banner-call')?.textContent || '(none)'`));

  await host.close();
  await guest.close();
  void consoleErrors;
} catch (error) {
  console.error('E2E FAILED:', error);
  process.exitCode = 1;
} finally {
  await shutdown(chrome);
}
