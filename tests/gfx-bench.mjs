// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics,
// starts Practice with the largest team size offered and plays with the real keyboard controls, so the
// floodlit stadium, crowd, flashes, haze and every player animate (walkout, then open play).
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForSelector('#loading.hidden', { state: 'attached', timeout: 60000 });
  await page.waitForSelector('#screen-menu:not(.hidden)', { timeout: 30000 });
  await page.locator('#btn-settings').click();
  await page.waitForSelector('#screen-settings:not(.hidden)', { timeout: 10000 });
  await page.selectOption('#gfx-preset', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.locator('#btn-settings-back').click();
  await page.waitForSelector('#screen-settings.hidden', { state: 'attached', timeout: 10000 });
}

export async function start(page) {
  await page.waitForSelector('#team-size option', { state: 'attached', timeout: 30000 });
  const sizes = await page.$$eval('#team-size option', (o) => o.map((x) => x.value));
  await page.selectOption('#team-size', sizes[sizes.length - 1]);
  await page.click('#btn-practice');
  await page.waitForSelector('#hud:not(.hidden)', { timeout: 30000 });
  let stopped = false;
  page.once('close', () => { stopped = true; });
  (async () => {
    const keys = ['w', 'a', 'd'];
    let i = 0;
    while (!stopped) {
      try {
        await page.keyboard.down('w');
        if (i % 3) await page.keyboard.down(keys[i % 3]);
        await page.waitForTimeout(600);
        await page.keyboard.up(keys[i % 3]);
        await page.keyboard.up('w');
        await page.keyboard.press(i % 2 ? 'Space' : 'k');
        i++;
      } catch { /* page closing */ }
      await new Promise((r) => setTimeout(r, 200));
    }
  })();
  await page.waitForTimeout(3000);
}
