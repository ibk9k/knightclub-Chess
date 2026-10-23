async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  const check = (value, message) => { if (!value) throw new Error(message); };
  try {
    await host.goto(origin, { waitUntil: 'domcontentloaded' });
    await host.waitForFunction(() => document.querySelector('.engine-status.ready'));
    await host.getByRole('button', { name: 'e2 white pawn', exact: true }).click();
    await host.getByRole('button', { name: 'e4 legal destination', exact: true }).click();
    await host.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Puzzles', exact: true }).click();
    await host.getByRole('group', { name: 'Puzzle chessboard', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Play chess', exact: true }).click();
    await host.getByRole('group', { name: 'Chessboard', exact: true }).waitFor();
    check(await host.getByRole('button', { name: 'e4 white pawn', exact: true }).count() === 1, 'Opening puzzles must preserve the bot game');
    await host.getByRole('button', { name: 'Play online', exact: true }).click();
    await host.getByRole('button', { name: 'Start new game', exact: true }).click();
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    await host.locator('.online-room-status.waiting').waitFor();
    const invite = await host.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue();
    await host.getByRole('button', { name: 'Puzzles', exact: true }).click();
    await host.getByRole('status').filter({ hasText: 'Cancel your waiting room before opening puzzles.' }).waitFor();
    check(await host.locator('.online-room-status.waiting').count() === 1, 'Opening puzzles cannot hide a waiting room');
    await guest.goto(invite, { waitUntil: 'domcontentloaded' });
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    await host.getByRole('button', { name: 'Puzzles', exact: true }).click();
    await host.getByRole('status').filter({ hasText: 'Finish your online game before opening puzzles.' }).waitFor();
    check(await host.getByRole('group', { name: 'Chessboard', exact: true }).count() === 1, 'Opening puzzles cannot interrupt an active online game');
    await host.getByRole('button', { name: 'Resign game', exact: true }).click();
    await host.getByRole('dialog').getByRole('button', { name: 'Resign game', exact: true }).click();
    await host.locator('.online-room-status.finished').waitFor();
    await host.getByRole('button', { name: 'Puzzles', exact: true }).click();
    await host.getByRole('group', { name: 'Puzzle chessboard', exact: true }).waitFor();
    return { botPositionPreserved: true, waitingRoomProtected: true, activeGameProtected: true, puzzlesAfterGame: true };
  } finally { await hostContext.close(); await guestContext.close(); }
}
