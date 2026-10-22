// Run with: playwright-cli run-code --filename=tests/browser/drag-live.js
async (page) => {
  await page.goto(new URL('/', page.url()).href);
  await page.waitForFunction(() => document.querySelector('.engine-status.ready'));
  const results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  assert(await page.locator('.analysis-content').count() === 1, 'Bot games show analysis by default');
  await page.evaluate(() => {
    window.__dragProbe = { started: false };
    window.__liveDepths = [];
    const observer = new MutationObserver(() => {
      const status = document.querySelector('.game-status')?.textContent || '';
      const engine = document.querySelector('.analysis-engine')?.textContent || '';
      if (status.includes('is thinking') && engine.includes('Live')) {
        const depth = /Depth (\d+)/.exec(engine)?.[1];
        if (depth && !window.__liveDepths.includes(depth)) window.__liveDepths.push(depth);
      }
    });
    observer.observe(document.querySelector('.moves-panel'), { childList: true, subtree: true, characterData: true });
    window.__liveObserver = observer;
    document.addEventListener('dragstart', () => { window.__dragProbe.started = true; }, { capture: true, once: true });
  });
  const knight = page.getByRole('button', { name: 'g1 white knight', exact: true });
  await knight.scrollIntoViewIfNeeded();
  const from = await knight.boundingBox();
  const to = await page.getByRole('button', { name: 'f3', exact: true }).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 15, from.y + from.height / 2 - 15, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  const probe = await page.evaluate(() => window.__dragProbe);
  const preview = await page.locator('.drag-piece').count();
  await page.mouse.up();
  assert(!probe.started, 'Piece dragging never starts the native browser drag UI');
  assert(preview === 1, 'Drag preview contains only the floating chess piece');
  await page.getByRole('button', { name: /^f3 white knight/ }).waitFor();
  await page.waitForFunction(() => document.querySelector('.game-status')?.textContent?.includes('Your move'));
  assert((await page.locator('.breadcrumb').textContent()).includes('Computer'), 'Live analysis leaves the bot game active');
  const depths = await page.evaluate(() => { window.__liveObserver.disconnect(); return window.__liveDepths; });
  assert(depths.length >= 2, `Analysis streams during the bot turn (${depths.length} distinct depths)`);
  assert((await page.locator('.analysis-judgment').textContent()).includes('Your last move') && (await page.locator('.analysis-judgment strong').textContent()).includes('Nf3'), 'Player move feedback remains visible after the bot responds');
  assert((await page.locator('.best-line > div').textContent()).trim().length > 0, 'The current position has a best continuation');
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Latest position', exact: true }).isEnabled(), 'History exploration works with live analysis running');
  await page.getByRole('button', { name: 'Latest position', exact: true }).click();
  await page.getByRole('button', { name: 'Take back', exact: true }).click();
  assert(await page.getByRole('button', { name: 'g1 white knight', exact: true }).count() === 1, 'Takeback cancels the old position analysis');
  await page.getByRole('button', { name: 'e2 white pawn', exact: true }).click();
  await page.getByRole('button', { name: 'e4 legal destination', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.game-status')?.textContent?.includes('Your move'));
  assert((await page.locator('.analysis-judgment strong').textContent()).includes('e4'), 'Analysis follows a different continuation after takeback');
  assert(await page.locator('.engine-error, .live-analysis-error').count() === 0, 'Both engines remain healthy after position changes');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'output/playwright/live-bot-analysis.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.sidebar')).transform).m41 <= -213);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Live analysis fits the phone layout');
  assert(await page.locator('.analysis-content').isVisible(), 'Live analysis stays available on a phone');
  await page.screenshot({ path: 'output/playwright/mobile-live-bot-analysis.png', fullPage: true });
  return results;
}
