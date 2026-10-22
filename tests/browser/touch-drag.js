async (basePage) => {
  const context = await basePage.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), results = [];
  const assert = (value, message) => { if (!value) throw new Error(message); results.push(message); };
  try {
    await page.goto(new URL(basePage.url()).origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Analysis board', exact: true }).click();
    await page.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.sidebar')).transform).m41 <= -213);
    const source = page.getByRole('button', { name: 'g1 white knight', exact: true });
    await source.scrollIntoViewIfNeeded();
    const a = await source.boundingBox(), b = await page.getByRole('button', { name: 'f3', exact: true }).boundingBox();
    const session = await context.newCDPSession(page);
    const point = (x, y) => ({ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 });
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(a.x + a.width / 2, a.y + a.height / 2)] });
    for (let i = 1; i <= 8; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(a.x + a.width / 2 + (b.x - a.x) * i / 8, a.y + a.height / 2 + (b.y - a.y) * i / 8)] });
    assert(await page.locator('.drag-piece').count() === 1, 'Touch dragging shows only the floating chess piece');
    await page.screenshot({ path: 'output/playwright/touch-piece-drag.png' });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: /^f3 white knight/ }).waitFor();
    assert(await page.locator('.drag-piece').count() === 0, 'Releasing a touch drag completes the move and removes its preview');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Touch controls do not overflow a phone screen');
    return results;
  } finally { await context.close(); }
}
