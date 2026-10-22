// Real pointer input must move pieces without invoking the browser's OS drag UI.
async (basePage) => {
  const context = await basePage.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(new URL(basePage.url()).origin, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Analysis board', exact: true }).click();
    await page.evaluate(() => { window.__nativeDrags = 0; document.addEventListener('dragstart', () => window.__nativeDrags++); });
    const source = page.getByRole('button', { name: 'g1 white knight', exact: true });
    await source.scrollIntoViewIfNeeded();
    const a = await source.boundingBox(), b = await page.getByRole('button', { name: 'f3', exact: true }).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 });
    const nativeDrags = await page.evaluate(() => window.__nativeDrags);
    const preview = await page.locator('.drag-piece').count();
    await page.mouse.up();
    if (nativeDrags || !preview) throw new Error(`Dragging invokes native browser UI: native drag events=${nativeDrags}, custom piece previews=${preview}. Expected a piece-only pointer preview without OS copy/forbidden badges.`);
    await page.getByRole('button', { name: /^f3 white knight/ }).waitFor();
    const ready = () => page.waitForFunction(() => !document.querySelector('.board-toolbar .toolbar-button:nth-child(2)')?.disabled);
    const beginDrag = async (from, to) => {
      await from.scrollIntoViewIfNeeded(); const start = await from.boundingBox();
      await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
    };
    await ready();
    const board = await page.locator('.board').boundingBox();
    await beginDrag(page.getByRole('button', { name: 'g8 black knight', exact: true }), { x: board.x + board.width + 30, y: board.y + board.height / 2 });
    await page.mouse.up();
    if (await page.locator('.drag-piece').count() || !await page.getByRole('button', { name: /^g8 black knight/ }).count()) throw new Error('An outside drop must cancel without moving the piece');
    await page.getByRole('button', { name: 'f6 legal destination', exact: true }).click();
    await page.getByRole('button', { name: /^f6 black knight/ }).waitFor(); await ready();
    const h6 = await page.getByRole('button', { name: 'h6', exact: true }).boundingBox();
    await beginDrag(page.getByRole('button', { name: 'c1 white bishop', exact: true }), { x: h6.x + h6.width / 2, y: h6.y + h6.height / 2 });
    await page.mouse.up();
    await page.locator('#move-rule-explanation').filter({ hasText: 'pawn on d2' }).waitFor();
    const a3 = await page.getByRole('button', { name: 'a3', exact: true }).boundingBox();
    await beginDrag(page.getByRole('button', { name: 'b1 white knight', exact: true }), { x: a3.x + a3.width / 2, y: a3.y + a3.height / 2 });
    await page.keyboard.press('Escape'); await page.mouse.up();
    if (await page.locator('.drag-piece').count() || !await page.getByRole('button', { name: /^b1 white knight/ }).count()) throw new Error('Escape must cancel a drag without playing its destination');
    if (await page.evaluate(() => window.__nativeDrags) !== 0) throw new Error('Drag recovery must never use native browser dragging');
    return { nativeDrags, pieceOnlyPreview: true, moveCompleted: true, outsideDropCanceled: true, illegalDropExplained: true, escapeCanceled: true };
  } finally { await context.close(); }
}
