async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const contexts = await Promise.all([browser.newContext({ viewport: { width: 1440, height: 1000 } }), browser.newContext({ viewport: { width: 1440, height: 1000 } })]);
  const [white, black] = await Promise.all(contexts.map(context => context.newPage()));
  const results = [], assert = (value, message) => { if (!value) throw new Error(message); results.push(message); };
  const square = (actor, s) => actor.getByRole('button', { name: new RegExp(`^${s}( |$)`) });
  const play = async (actor, from, to) => { if (await square(actor, from).getAttribute('aria-pressed') !== 'true') await square(actor, from).click(); await square(actor, to).click(); };
  const ready = actor => actor.waitForFunction(() => !document.querySelector('.online-leave')?.disabled);
  const resign = async actor => { await actor.getByRole('button', { name: 'Resign game', exact: true }).click(); await actor.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click(); await actor.locator('.game-result').waitFor(); };
  const join = async () => {
    await white.locator('.online-room-status.waiting').waitFor();
    const invite = await white.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue();
    await black.goto(invite, { waitUntil: 'domcontentloaded' });
    await black.getByRole('button', { name: /^Join( with cheats)?$/ }).click();
    await white.locator('.online-room-status.active').waitFor(); await black.locator('.online-room-status.active').waitFor();
  };
  const leave = async () => { await resign(white); await black.locator('.game-result').waitFor(); await white.getByRole('button', { name: 'Leave room', exact: true }).click(); await black.getByRole('button', { name: 'Leave room', exact: true }).click(); };
  try {
    await white.goto(origin, { waitUntil: 'domcontentloaded' });
    await white.getByRole('button', { name: 'Play online', exact: true }).click();
    await white.getByRole('combobox', { name: 'Online color' }).selectOption('w');
    assert(await white.getByRole('switch', { name: 'Allow direct takebacks', exact: true }).count() === 0, 'Direct-takeback options are hidden until cheat mode is enabled');
    await white.getByRole('button', { name: 'Create private room', exact: true }).click(); await join();
    let blackPosts = 0;
    black.on('request', req => { if (req.url().endsWith('/move') && req.method() === 'POST') blackPosts++; });
    await play(black, 'e7', 'e5');
    assert(await black.locator('.premove-notice').isVisible() && await black.locator('.premove-square').count() === 2 && await black.getByRole('button', { name: /^e7 black pawn/ }).count() === 1 && blackPosts === 0, 'A premove is highlighted and queued without moving or contacting the server');
    await black.screenshot({ path: 'output/playwright/premove-queued.png', fullPage: true });
    await play(white, 'e2', 'e4');
    await white.getByRole('button', { name: /^e5 black pawn/ }).waitFor(); await ready(black);
    assert(blackPosts === 1 && await black.locator('.premove-notice').count() === 0, 'A legal premove executes exactly once after the opponent moves');
    await play(black, 'g8', 'f6'); await black.keyboard.press('Escape');
    assert(await black.locator('.premove-notice').count() === 0, 'Escape cancels a premove');
    await play(black, 'g8', 'f6'); await black.locator('.board').click({ button: 'right' });
    assert(await black.locator('.premove-notice').count() === 0, 'Right-click cancels a premove without a context menu');
    await play(black, 'g8', 'f6'); await black.getByRole('button', { name: 'Cancel premove', exact: true }).click();
    assert(await black.locator('.premove-notice').count() === 0, 'The visible Cancel button cancels a premove');
    await play(black, 'd7', 'e6'); await play(white, 'g1', 'f3');
    await black.locator('#move-rule-explanation').filter({ hasText: 'Premove canceled' }).waitFor({ timeout: 5000 }).catch(async () => {
      throw new Error(`Missing cancellation feedback: ${JSON.stringify(await black.evaluate(() => ({ queued: document.querySelector('.premove-notice')?.textContent, explanation: document.querySelector('#move-rule-explanation')?.textContent, moves: [...document.querySelectorAll('.move-cell')].map(node => node.textContent), status: document.querySelector('.game-status')?.textContent })))}, black submissions=${blackPosts}`);
    });
    assert(blackPosts === 1 && await black.getByRole('button', { name: /^d7 black pawn/ }).count() === 1, 'A premove that becomes illegal is discarded without sending a move');
    await play(black, 'b8', 'c6'); await white.getByRole('button', { name: /^c6 black knight/ }).waitFor();
    await leave();

    await white.getByRole('switch', { name: 'Cheat mode', exact: true }).click();
    const direct = white.getByRole('switch', { name: 'Allow direct takebacks', exact: true });
    assert(await direct.getAttribute('aria-checked') === 'false', 'Direct takebacks start off when cheat mode is enabled');
    await white.screenshot({ path: 'output/playwright/cheat-takeback-settings.png', fullPage: true });
    await white.getByRole('button', { name: 'Create private room', exact: true }).click(); await join();
    for (const actor of [white, black]) assert(await actor.getByRole('button', { name: 'Hint', exact: true }).isDisabled() && await actor.locator('.evaluation-bar').isVisible(), 'Cheat mode retains shared analysis while direct hints stay disabled');
    await play(white, 'e2', 'e4'); await black.getByRole('button', { name: /^e4 white pawn/ }).waitFor();
    await play(black, 'e7', 'e5'); await white.getByRole('button', { name: /^e5 black pawn/ }).waitFor(); await ready(white);
    await white.getByRole('button', { name: 'Request takeback', exact: true }).click();
    await black.getByRole('button', { name: 'Decline takeback', exact: true }).waitFor();
    assert(await black.getByRole('button', { name: /^e4 white pawn/ }).count() === 1, 'A takeback request leaves both boards unchanged until approval');
    await black.getByRole('button', { name: 'Decline takeback', exact: true }).click();
    await white.locator('.takeback-request').waitFor({ state: 'hidden' });
    await white.getByRole('button', { name: 'Request takeback', exact: true }).click();
    await black.getByRole('button', { name: 'Accept takeback', exact: true }).click();
    await white.getByRole('button', { name: /^e2 white pawn/ }).waitFor(); await black.getByRole('button', { name: /^e7 black pawn/ }).waitFor();
    assert(await white.locator('.takeback-request').count() === 0, 'Opponent approval restores both boards and clears the request');
    await play(white, 'd2', 'd4'); await black.getByRole('button', { name: /^d4 white pawn/ }).waitFor();
    await play(black, 'd7', 'd5'); await white.getByRole('button', { name: /^d5 black pawn/ }).waitFor(); await ready(black);
    await black.getByRole('button', { name: 'Request takeback', exact: true }).click();
    await white.getByRole('button', { name: 'Accept takeback', exact: true }).click();
    await black.getByRole('button', { name: /^d7 black pawn/ }).waitFor();
    assert(await white.getByRole('button', { name: /^d4 white pawn/ }).count() === 1, 'Black has the same request and approval flow');
    await ready(white); await white.getByRole('button', { name: 'Request takeback', exact: true }).click();
    await black.getByRole('button', { name: 'Accept takeback', exact: true }).waitFor();
    await play(black, 'g8', 'f6'); await white.getByRole('button', { name: /^f6 black knight/ }).waitFor();
    assert(await white.locator('.takeback-request').count() === 0, 'Another move expires the outstanding approval request');
    await ready(white); await white.getByRole('button', { name: 'Request takeback', exact: true }).click();
    await white.getByRole('button', { name: 'Cancel takeback request', exact: true }).click();
    await black.locator('.takeback-request').waitFor({ state: 'hidden' });
    assert(true, 'A requester can withdraw a takeback request');
    await leave();

    await direct.click();
    await white.getByRole('button', { name: 'Create private room', exact: true }).click(); await join();
    await play(white, 'e2', 'e4'); await black.getByRole('button', { name: /^e4 white pawn/ }).waitFor();
    await play(black, 'e7', 'e5'); await white.getByRole('button', { name: /^e5 black pawn/ }).waitFor(); await ready(white);
    await white.getByRole('button', { name: 'Take back', exact: true }).click();
    await black.getByRole('button', { name: /^e2 white pawn/ }).waitFor();
    assert(await white.locator('.takeback-request').count() === 0, 'Explicitly enabling direct takebacks restores immediate undo for both players');
    await white.setViewportSize({ width: 390, height: 844 });
    await white.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.sidebar')).transform).m41 <= -213);
    assert(await white.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Takeback controls fit a phone without horizontal overflow');
    return results;
  } finally {
    if (await white.locator('.online-room-status.active').count()) await resign(white).catch(() => {});
    await Promise.all(contexts.map(context => context.close()));
  }
}
