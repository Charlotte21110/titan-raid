// 完整一局：机制播报（CDC）、技能输入、结算
import { launch, newPage, shutdown } from './cdp.mjs';

const BASE = process.env.URL || 'http://127.0.0.1:5173/';
const URL = `${BASE}?speed=3`;
const shots = '/tmp/titan-e2e';
const fs = await import('node:fs');
fs.mkdirSync(shots, { recursive: true });

const chrome = await launch(9339);

async function join(page, name, job) {
  await page.goto(URL, 1600);
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
    if (await page.eval(`!!document.querySelector('.lobby-title')`).catch(() => false)) return;
  }
  throw new Error(`${name} 未进入大厅`);
}

try {
  const host = await newPage(chrome.base, URL);
  const guest = await newPage(chrome.base, URL);
  await join(host, '坦克甲', 'warrior');
  await join(guest, '白魔乙', 'white');
  await new Promise((r) => setTimeout(r, 1200));
  console.log('lobby slots:', await host.eval(`Array.from(document.querySelectorAll('.slot-name')).map(e=>e.textContent).join(' | ')`));
  await host.screenshot(`${shots}/10-lobby.png`);

  await host.eval(`document.querySelector('.lobby-foot .btn.primary')?.click()`);

  // 收集第一次机制播报
  let bannerHost = '';
  let bannerGuest = '';
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (!bannerHost) bannerHost = await host.eval(`document.querySelector('.banner-call')?.textContent || ''`).catch(() => '');
    if (!bannerGuest) bannerGuest = await guest.eval(`document.querySelector('.banner-call')?.textContent || ''`).catch(() => '');
    if (bannerHost && bannerGuest) break;
  }
  console.log('banner host:', bannerHost || '(none)');
  console.log('banner guest:', bannerGuest || '(none)');
  await host.screenshot(`${shots}/11-banner.png`);

  // 白魔狂按 J（真实输入 → broadcast → 房主结算）
  for (let i = 0; i < 18; i++) {
    await guest.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyJ', bubbles: true }))`);
    await new Promise((r) => setTimeout(r, 350));
  }
  console.log('after skills log:', await host.eval(`Array.from(document.querySelectorAll('.log-text')).slice(0,5).map(e=>e.textContent).join(' || ')`));
  console.log('after skills hp:', await host.eval(`document.querySelector('.boss-hp-text')?.textContent || ''`));
  await host.screenshot(`${shots}/12-skills.png`);

  // 等结算
  let title = '';
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 500));
    title = await host.eval(`document.querySelector('.modal-title')?.textContent || ''`).catch(() => '');
    if (title) break;
  }
  console.log('result title:', title || '(none)');
  if (title) {
    console.log('dps:', await host.eval(`Array.from(document.querySelectorAll('.dps-table tbody tr')).map(tr=>Array.from(tr.children).map(td=>td.textContent.trim()).join(' / ')).join(' || ')`));
    console.log('modal sub:', await host.eval(`document.querySelector('.modal-sub')?.textContent || ''`));
    await host.screenshot(`${shots}/13-result.png`);
    console.log('guest result:', await guest.eval(`document.querySelector('.modal-title')?.textContent || '(none)'`));
    await guest.screenshot(`${shots}/14-result-guest.png`);
  }

  console.log('host errors:', host.logs.filter((l) => l.startsWith('[error]') || l.startsWith('[exception]')).slice(0, 5));
  console.log('guest errors:', guest.logs.filter((l) => l.startsWith('[error]') || l.startsWith('[exception]')).slice(0, 5));

  await host.close();
  await guest.close();
} catch (error) {
  console.error('E2E FULL FAILED:', error);
  process.exitCode = 1;
} finally {
  await shutdown(chrome);
}
