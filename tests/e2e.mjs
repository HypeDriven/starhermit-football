/**
 * StarHermit Football — end-to-end UI playthrough (dev only, not shipped).
 *
 * Drives the REAL visible UI in headless Chrome via playwright-core:
 *   menu (offline mode) → team size + voice settings → PRACTICE vs AI →
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
 * Run: npm run test:e2e
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
};
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
    for (const id of ['#btn-solo', '#btn-leaderboard', '#btn-replays', '#btn-controls']) {
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
  let cdp = null;
  const touch = async (page, type, points) => {
    cdp = cdp || await page.context().newCDPSession(page);
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
      const roll = Math.random();
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

// ── main ────────────────────────────────────────────────────────────────────
let browser;
try {
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
  const base = `http://127.0.0.1:${server.address().port}/`;

  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });

  await runPass(browser, 'desktop', {
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 0.5, // software-GL accommodation; CSS layout unchanged
  }, desktopDrive(base));

  await runPass(browser, 'mobile', {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 1,
  }, mobileDrive(base));

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
