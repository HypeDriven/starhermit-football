/**
 * StarHermit Football — end-to-end UI playthrough (dev only, not shipped).
 *
 * Drives the REAL visible UI in headless Chrome via playwright-core:
 *   menu (offline mode) → team size + voice settings → Settings › Graphics
 *   (Low → High, bloom override, reload persistence, Ultra, back to Low) →
 *   PRACTICE vs AI → in-match menu › Settings →
 *   walkout → coin flip → a full 1v1 match played with real keyboard input
 *   (desktop) / real touch input on the on-screen joystick + buttons (mobile)
 *   → FULL TIME result screen → back to menu.
 *
 * Offline limitations (by design, no launch token): QUICK PLAY / CREATE LOBBY
 * are disabled and RANKED vs AI / LEADERBOARD / REPLAYS / CONTROLS are hidden,
 * so the platform-only screens cannot be exercised. There is no pause screen
 * in practice matches (Esc leave-confirm only exists for online rooms), so
 * pause/resume is not applicable offline; the menu voice-chat toggle is
 * exercised as the available setting.
 *
 * Notes:
 * - server.js in this repo is the StarHermit authoritative game script (also
 *   loaded by the page as the shared sim core) — NOT a dev server. This test
 *   embeds its own minimal static file server on an ephemeral port.
 * - The box has no GPU; WebGL runs on SwiftShader. The sim clock advances at
 *   most 0.1 s per rendered frame, so all synchronization below keys off the
 *   visible #match-clock text, never wall time, and timeouts are generous.
 *   deviceScaleFactor 0.5 on desktop only shrinks the WebGL drawing buffer
 *   (CSS layout is untouched) to keep software rendering affordable.
 *
 * Run: npm run test:e2e   (PORT=<n> pins the embedded static server's port)
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const SHOT = (stage, pass) => `/tmp/football-e2e-${stage}-${pass}.png`;

// benign GPU/swiftshader noise (mirrors tools/production_game_audit.mjs)
const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

// ── minimal static server (repo's server.js is a game script, not a server) ──
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/opus',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ts': 'video/mp2t',
  '.webp': 'image/webp',
};
// StarHermit platform mocks for the signed-in pass; offline passes must make no /api call.
const apiLog = [];
function platformMock(req, res, p) {
  apiLog.push(`${req.method} ${p}`);
  const json = (b, st = 200) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
  if (p.endsWith('/profile')) return json({ username: 'raw_user', nickname: 'Golazo' });
  if (p.endsWith('/settings') && req.method === 'GET') return json({ settings: { voice: false } });
  if (p.endsWith('/settings')) return json({ settings: {} });
  if (p.endsWith('/controls')) return json({ actions: [] });
  if (p.endsWith('/achievements')) return json([{ key: 'first-goal', name: 'First goal', description: 'Score in a match', unlocked: true }, { key: 'hat-trick', name: 'Hat-trick', description: 'Three goals in one match' }]);
  if (p.endsWith('/realtime/rooms/mine')) return json(null);
  if (p.endsWith('/realtime/rooms/invites')) return json([]);
  return json({ error: 'not found' }, 404);
}
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.startsWith('/api/')) return platformMock(req, res, p);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(normalize(ROOT))) throw new Error('path escape');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

function parseClock(text) {
  const m = text.match(/^(\d)(?:st|nd)\s+(\d{2}):(\d{2})$/);
  return m ? { half: +m[1], sec: +m[2] * 60 + +m[3] } : null;
}

async function runPass(browser, label, contextOpts, drive) {
  const errors = [];
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || browserNoise.test(m.text())) return;
    // backToMenu() unconditionally polls /api/v1/room-invites and treats any
    // failure as "offline, no invites" (js/main.js refreshIncomingInvites);
    // without the platform the static server 404s it — benign offline probe.
    if (/Failed to load resource.*404/.test(m.text()) && (m.location()?.url || '').includes('/api/')) return;
    errors.push(`console: ${m.text()}`);
  });
  const step = async (name, fn) => {
    await fn();
    console.log(`ok - [${label}] ${name}`);
  };

  await step('load + menu visible (offline mode)', async () => {
    await page.goto(drive.base, { waitUntil: 'load' });
    await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 30000 });
    await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 30000 });
    await page.waitForSelector('#team-size option', { state: 'attached', timeout: 30000 });
    const status = await page.textContent('#menu-user');
    if (!/Offline mode/.test(status)) throw new Error(`expected offline status, got: ${status}`);
    await page.screenshot({ path: SHOT('menu', label) });
  });

  await step('platform-only features gated offline', async () => {
    if (!(await page.locator('#btn-quick').isDisabled())) throw new Error('QUICK PLAY enabled offline');
    if (!(await page.locator('#btn-lobby').isDisabled())) throw new Error('CREATE LOBBY enabled offline');
    for (const id of ['#btn-solo', '#btn-leaderboard', '#btn-replays', '#btn-controls', '#btn-achievements', '#btn-invite-link', '#btn-signin']) {
      if (await page.locator(id).isVisible()) throw new Error(`${id} visible offline`);
    }
  });

  await step('settings: voice toggle persists', async () => {
    const before = await page.locator('#opt-voice').isChecked();
    await page.locator('#opt-voice').click();
    const stored = await page.evaluate(() => localStorage.getItem('starhermit-football-voice'));
    if (stored !== (before ? '0' : '1')) throw new Error(`voice pref not persisted (was ${before}, stored ${stored})`);
    await page.locator('#opt-voice').click(); // restore
  });

  // Graphics settings through the real panel: preset switch, one override,
  // persistence across a reload, Ultra renders without console noise, then
  // Low for the (software-rendered) match that follows.
  const gfxAttr = (k) => page.evaluate((key) => document.body.dataset[key], k);
  const pick = async (sel, value) => {
    await page.selectOption(sel, value);
    await page.waitForTimeout(300);
  };
  await step('settings: graphics preset + override apply live', async () => {
    await page.locator('#btn-settings').click();
    await page.waitForSelector('#screen-settings:not(.hidden)', { timeout: 10000 });
    for (const id of ['#gfx-preset', '#gfx-scale', '#gfx-shadows', '#gfx-bloom', '#gfx-adaptive', '#gfx-fps', '#btn-settings-back']) {
      const box = await page.locator(id).boundingBox();
      const vp = page.viewportSize();
      if (!box || box.x < 0 || box.x + box.width > vp.width + 1) throw new Error(`${id} cut off: ${JSON.stringify(box)}`);
    }
    const auto = await page.locator('#gfx-preset option[value="auto"]').textContent();
    if (!/Low/.test(auto)) throw new Error(`software GPU should auto-detect Low, got: ${auto}`);
    await pick('#gfx-preset', 'low');
    if (await gfxAttr('gfxPreset') !== 'low') throw new Error('Low preset not applied');
    await pick('#gfx-preset', 'high');
    if (await gfxAttr('gfxPreset') !== 'high') throw new Error('High preset not applied');
    if (await gfxAttr('gfxBloom') !== 'on') throw new Error('High preset should enable bloom');
    await page.waitForFunction(() => /SMAA/.test(document.getElementById('gfx-summary').textContent), null, { timeout: 15000 });
    await pick('#gfx-bloom', 'off');
    if (await gfxAttr('gfxBloom') !== 'off') throw new Error('bloom override not applied');
    await page.screenshot({ path: SHOT('settings', label) });
  });

  await step('settings: graphics choice survives reload', async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 30000 });
    if (await gfxAttr('gfxPreset') !== 'high' || await gfxAttr('gfxBloom') !== 'off') throw new Error('graphics settings lost on reload');
    await page.locator('#btn-settings').click();
    await page.waitForSelector('#screen-settings:not(.hidden)', { timeout: 10000 });
    if (await page.inputValue('#gfx-preset') !== 'high') throw new Error('panel does not show saved preset');
    if (await page.inputValue('#gfx-bloom') !== 'off') throw new Error('panel does not show saved override');
    // choosing a preset clears overrides; Ultra must render cleanly too
    await pick('#gfx-preset', 'ultra');
    if (await page.inputValue('#gfx-bloom') !== 'preset' || await gfxAttr('gfxBloom') !== 'on') throw new Error('preset did not clear override');
    await page.waitForTimeout(4000);
    await pick('#gfx-preset', 'low');
    if (drive.touch) await page.locator('#btn-settings-back').tap();
    else await page.keyboard.press('Escape');
    await page.waitForSelector('#screen-settings.hidden', { state: 'attached', timeout: 10000 });
  });

  await step('start practice (team size 1)', async () => {
    await page.selectOption('#team-size', '1');
    await page.click('#btn-practice');
    await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
    await page.waitForSelector('#screen-menu.hidden', { state: 'attached', timeout: 10000 });
    if (drive.touch) {
      await page.waitForSelector('#touch-ui:not(.hidden)', { timeout: 10000 });
    }
    await page.screenshot({ path: SHOT('walkout', label) });
  });

  await step('walkout + coin flip → play begins', async () => {
    // sim clock only ticks once the opening ceremonies finish
    await page.waitForFunction(
      () => /^1st \d{2}:(?!00$)/.test(document.getElementById('match-clock').textContent),
      null, { timeout: 10 * 60 * 1000 },
    );
    await page.screenshot({ path: SHOT('kickoff', label) });
  });

  await step('in-match menu opens Settings', async () => {
    const tap = async (sel) => (drive.touch ? page.locator(sel).tap() : page.locator(sel).click());
    await tap('#btn-match-menu');
    await page.waitForSelector('#leave-confirm:not(.hidden)', { timeout: 10000 });
    await tap('#btn-match-settings');
    await page.waitForSelector('#screen-settings:not(.hidden)', { timeout: 10000 });
    if (await page.inputValue('#gfx-preset') !== 'low') throw new Error('in-match settings lost the preset');
    await tap('#btn-settings-back');
    await page.waitForSelector('#screen-settings.hidden', { state: 'attached', timeout: 10000 });
    await tap('#btn-leave-no');
    await page.waitForSelector('#leave-confirm.hidden', { state: 'attached', timeout: 10000 });
  });

  await step('play full match to FULL TIME', async () => {
    const deadline = Date.now() + 45 * 60 * 1000;
    let lastSec = -1;
    let shotPlay = false;
    let shotSecondHalf = false;
    while (true) {
      const clockNow = (await page.textContent('#match-clock')).trim();
      // the clock clamps to '2nd 03:00' at full time, ~4.5 s before the
      // result screen renders and the match (and touch UI) is disposed
      if (clockNow === '2nd 03:00' || await page.locator('#screen-result:not(.hidden)').count()) break;
      if (Date.now() > deadline) throw new Error('match did not reach full time within 45 minutes');
      const c = parseClock(clockNow);
      if (c) {
        const abs = (c.half - 1) * 180 + c.sec;
        if (!shotPlay && abs > 2) {
          await page.screenshot({ path: SHOT('play', label) });
          shotPlay = true;
        }
        if (!shotSecondHalf && c.half === 2) {
          await page.screenshot({ path: SHOT('second-half', label) });
          shotSecondHalf = true;
          console.log(`  [${label}] reached second half`);
        }
        if (abs >= lastSec + 30) {
          lastSec = abs;
          console.log(`  [${label}] match clock: ${clockNow}`);
        }
      }
      try {
        await drive.playBurst(page);
      } catch (e) {
        // full time can land mid-burst and yank the touch controls away
        const over = (await page.textContent('#match-clock')).trim() === '2nd 03:00'
          || await page.locator('#screen-result:not(.hidden)').count();
        if (over) break;
        throw e;
      }
    }
  });

  await step('result screen shows outcome + stats', async () => {
    await page.waitForSelector('#screen-result:not(.hidden)', { timeout: 30000 });
    const title = (await page.textContent('#result-title')).trim();
    if (!/^(VICTORY|DEFEAT|DRAW)$/.test(title)) throw new Error(`unexpected result title: ${title}`);
    const score = (await page.textContent('#result-score')).trim();
    if (!/^\d+ – \d+$/.test(score)) throw new Error(`unexpected score line: ${score}`);
    const stats = await page.textContent('#result-stats');
    if (!/Possession/.test(stats)) throw new Error('result stats missing');
    console.log(`  [${label}] ${title} ${score}`);
    await page.screenshot({ path: SHOT('result', label) });
  });

  await step('back to main menu', async () => {
    await page.click('#btn-result-menu');
    await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 15000 });
    await page.screenshot({ path: SHOT('menu-again', label) });
  });

  await context.close();
  if (errors.length) {
    throw new Error(`[${label}] page errors:\n${errors.join('\n')}`);
  }
}

// ── input drivers (real UI input only) ──────────────────────────────────────
const desktopDrive = (base) => ({
  base,
  touch: false,
  async playBurst(page) {
    const roll = Math.random();
    if (roll < 0.45) {
      // run forward, sometimes steering left/right (tank controls: W + A/D)
      await page.keyboard.down('w');
      if (Math.random() < 0.5) await page.keyboard.down(Math.random() < 0.5 ? 'a' : 'd');
      await page.waitForTimeout(700);
      await page.keyboard.up('a');
      await page.keyboard.up('d');
      await page.waitForTimeout(300);
      await page.keyboard.up('w');
    } else if (roll < 0.65) {
      await page.keyboard.press('Space', { delay: 80 }); // tap = pass
      await page.waitForTimeout(400);
    } else if (roll < 0.85) {
      await page.keyboard.down('Space'); // hold = charged shot
      await page.waitForTimeout(700);
      await page.keyboard.up('Space');
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press(Math.random() < 0.5 ? 'k' : 'l'); // tackle / pass
      await page.waitForTimeout(500);
    }
  },
});

const mobileDrive = (base) => {
  // Raw multi-phase touches (joystick drag, held shot) go through CDP
  // Input.dispatchTouchEvent, which only Chromium has. Elsewhere (Firefox)
  // those bursts are skipped with a note and the drive falls back to taps.
  let cdp = null, cdpMissing = false;
  const hasCdp = async (page) => {
    if (cdp) return true;
    if (cdpMissing) return false;
    try {
      if (typeof page.context().newCDPSession !== 'function') throw new Error('no newCDPSession');
      cdp = await page.context().newCDPSession(page);
      return true;
    } catch (e) {
      cdpMissing = true;
      console.log(`  [mobile] note: CDP unavailable in this browser (${String(e.message || e).split('\n')[0]}); skipping joystick drag + held-shot touch bursts, using taps only`);
      return false;
    }
  };
  const touch = async (page, type, points) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  };
  const hold = async (page, sel, ms) => {
    const box = await page.locator(sel).boundingBox();
    if (!box) throw new Error(`${sel} not on screen`);
    const p = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 1 };
    await touch(page, 'touchStart', [p]);
    await page.waitForTimeout(ms);
    await touch(page, 'touchEnd', []);
  };
  return {
    base,
    touch: true,
    async playBurst(page) {
      let roll = Math.random();
      if (roll < 0.5 || (roll >= 0.7 && roll < 0.9)) {
        if (!(await hasCdp(page))) roll = roll < 0.5 ? 0.6 : 0.95; // tap pass / tackle instead
      }
      if (roll < 0.5) {
        // drag the on-screen joystick up (run toward play), hold, release
        const box = await page.locator('#joystick').boundingBox();
        if (!box) throw new Error('joystick not on screen');
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        await touch(page, 'touchStart', [{ x: cx, y: cy, id: 1 }]);
        await touch(page, 'touchMove', [{ x: cx + (Math.random() * 60 - 30), y: cy - 42, id: 1 }]);
        await page.waitForTimeout(800);
        await touch(page, 'touchEnd', []);
        await page.waitForTimeout(200);
      } else if (roll < 0.7) {
        await page.locator('#btn-pass').tap();
        await page.waitForTimeout(400);
      } else if (roll < 0.9) {
        await hold(page, '#btn-shoot', 650); // hold = charged shot
        await page.waitForTimeout(300);
      } else {
        await page.locator('#btn-tackle').tap();
        await page.waitForTimeout(500);
      }
    },
  };
};

// Signed-in launch (#game_token) against the platform mocks: nickname, synced
// voice preference, invite link through the visible menu button, achievements.
async function signedInPass(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.addInitScript(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied.push(t); } } });
  });
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = 'h.' + b64u({ sub: 'u-striker-1', game_scope: 'football-test', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.s';
  try {
    await page.goto(`${base}#game_token=${token}`, { waitUntil: 'load' });
    await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 30000 });
    if (new URL(page.url()).hash) throw new Error('launch token left in the URL');
    const user = await page.textContent('#menu-user');
    if (!/Signed in as Golazo/.test(user)) throw new Error(`expected nickname, got: ${user}`);
    if (await page.locator('#btn-signin').isVisible()) throw new Error('sign-in shown while signed in');
    await page.waitForFunction(() => !document.getElementById('opt-voice').checked);
    await page.locator('#btn-invite-link').click();
    await page.waitForFunction(() => window.__copied.length === 1);
    const link = await page.evaluate(() => window.__copied[0]);
    if (!/\/game-invite\/u-striker-1\/football-test$/.test(link)) throw new Error(`bad invite link ${link}`);
    if (!/Invite link copied/.test(await page.textContent('#menu-status'))) throw new Error('no invite confirmation');
    await page.screenshot({ path: SHOT('menu', 'signed-in') });
    await page.locator('#btn-achievements').click();
    await page.waitForSelector('.ach-row');
    const rows = await page.locator('.ach-row').count();
    if (rows !== 2 || await page.locator('.ach-row.locked').count() !== 1) throw new Error(`achievement rows ${rows}`);
    await page.screenshot({ path: SHOT('achievements', 'signed-in') });
    await page.locator('#btn-ach-back').click();
    await page.waitForSelector('#screen-menu:not(.hidden)');
    await page.locator('#opt-voice').click();
    await page.waitForFunction(() => true);
    for (let i = 0; i < 30 && !apiLog.some((l) => l.startsWith('PATCH ') && l.endsWith('/settings')); i++) await page.waitForTimeout(100);
    if (!apiLog.some((l) => l.startsWith('PATCH ') && l.endsWith('/settings'))) throw new Error('voice toggle not synced');
    console.log('ok - [signed-in] nickname, synced voice pref, invite link, achievements screen, settings patch');
  } finally {
    await context.close();
  }
  if (errors.length) throw new Error('[signed-in] page errors:\n' + errors.join('\n'));
}

// ── main ────────────────────────────────────────────────────────────────────
let browser;
try {
  await new Promise((resolve, reject) => {
    // PORT pins the static server (CI port ranges); default is ephemeral
    server.listen(Number(process.env.PORT) || 0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/`;

  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });

  await signedInPass(browser, base);
  apiLog.length = 0; // the offline passes below must not add any

  await runPass(browser, 'desktop', {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 0.5, // software-GL accommodation; CSS layout unchanged
  }, desktopDrive(base));

  await runPass(browser, 'mobile', {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 1,
  }, mobileDrive(base));

  if (apiLog.length) throw new Error(`offline passes made platform calls: ${apiLog.join(', ')}`);

  console.log('\nE2E PASS — both viewport passes completed with no page errors');
} finally {
  await browser?.close().catch(() => {});
  console.log('Browser closed; stopping test server');
  await new Promise((r) => {
    server.close(r);
    server.closeAllConnections();
  });
  console.log('Test server closed');
}
// All assertions and owned-resource cleanup completed. The CLI must exit even
// if the browser transport retains a background handle after browser.close().
process.exit(0);
