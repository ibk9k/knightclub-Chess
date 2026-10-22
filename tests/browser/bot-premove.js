async (basePage) => {
  const context = await basePage.context().browser().newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await page.goto(new URL(basePage.url()).origin, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.engine-status.ready'));
    await page.getByRole('button', { name: 'Stockfish, 2800+, Master', exact: true }).click();
    await page.getByRole('button', { name: 'Play as black', exact: true }).click();
    await page.getByRole('button', { name: 'New game ↵', exact: true }).click();
    await page.getByRole('button', { name: 'e7 black pawn', exact: true }).click();
    await page.getByRole('button', { name: 'e5 premove destination', exact: true }).click();
    await page.locator('.premove-notice').waitFor();
    await page.getByRole('button', { name: /^e5 black pawn/ }).waitFor();
    if (await page.locator('.premove-notice').count()) throw new Error('A bot premove must clear after it is played');
    return { botPremoveExecuted: true };
  } finally { await context.close(); }
}
