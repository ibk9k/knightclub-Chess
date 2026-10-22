async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [white, black] = await Promise.all(contexts.map(context => context.newPage()));
  const square = (actor, s) => actor.getByRole('button', { name: new RegExp(`^${s}( |$)`) });
  const play = async (actor, from, to) => { await square(actor, from).click(); await square(actor, to).click(); };
  let release;
  try {
    await white.goto(origin, { waitUntil: 'domcontentloaded' });
    await white.getByRole('button', { name: 'Play online', exact: true }).click();
    await white.getByRole('combobox', { name: 'Online color' }).selectOption('w');
    await white.getByRole('button', { name: 'Create private room', exact: true }).click();
    await white.locator('.online-room-status.waiting').waitFor();
    await black.goto(await white.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue(), { waitUntil: 'domcontentloaded' });
    await black.getByRole('button', { name: 'Join', exact: true }).click();
    await white.locator('.online-room-status.active').waitFor();
    const gate = new Promise(resolve => { release = resolve; });
    await white.route('**/api/online/rooms/*/move', async route => { await gate; await route.continue(); });
    await play(white, 'e2', 'e4');
    await white.getByRole('button', { name: /^e4 white pawn/ }).waitFor();
    await play(white, 'g1', 'f3');
    await white.locator('.premove-notice').waitFor();
    release();
    await black.getByRole('button', { name: /^e4 white pawn/ }).waitFor();
    await play(black, 'e7', 'e5');
    await black.getByRole('button', { name: /^f3 white knight/ }).waitFor();
    if (await white.locator('.premove-notice').count()) throw new Error('The premove must clear after execution');
    return { queuedDuringUnconfirmedMove: true, executedAfterOpponentReply: true };
  } finally {
    release?.(); await white.unroute('**/api/online/rooms/*/move');
    if (await white.locator('.online-room-status.active').count()) {
      await white.getByRole('button', { name: 'Resign game', exact: true }).click();
      await white.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click();
    }
    await Promise.all(contexts.map(context => context.close()));
  }
}
