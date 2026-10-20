// Exercises real online UI reconciliation with delayed, rejected, and lost replies.
async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
  const results = [], moveUrl = '**/api/online/rooms/*/move';
  const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const piece = (actor, square, name) => actor.getByRole('button', { name: `${square} ${name}`, exact: true });
  const play = async (actor, from, to) => {
    await actor.getByRole('button', { name: new RegExp(`^${from} (white|black) `) }).click();
    await actor.getByRole('button', { name: new RegExp(`^${to}( (white|black) \\w+)? legal destination$`) }).click();
  };
  const ready = actor => actor.waitForFunction(() => !document.querySelector('.online-leave')?.disabled);
  const resign = async actor => {
    await actor.getByRole('button', { name: 'Resign game', exact: true }).click();
    await actor.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click();
    await actor.locator('.game-result').waitFor();
  };
  let release;
  try {
    await host.goto(origin);
    await host.getByRole('button', { name: 'Play online', exact: true }).click();
    await host.getByRole('combobox', { name: 'Online color' }).selectOption('w');
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    await host.locator('.online-room-status.waiting').waitFor();
    const invite = await host.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue();
    await guest.goto(invite);
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    let sent = 0;
    const gate = new Promise(resolve => { release = resolve; });
    await host.route(moveUrl, async route => {
      sent++; await gate;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The game has changed. Please try again.' }) });
    });
    await play(host, 'e2', 'e4');
    await piece(host, 'e4', 'white pawn').waitFor();
    // Wait for an actual older heartbeat, rather than a timing-dependent sleep.
    await host.waitForResponse(response => /\/api\/online\/rooms\/[A-Z2-9]{8}$/.test(new URL(response.url()).pathname) && response.request().method() === 'GET');
    assert(await piece(host, 'e4', 'white pawn').count() === 1, 'An older heartbeat does not undo the pending piece');
    await piece(host, 'd2', 'white pawn').click();
    assert(await host.getByRole('button', { name: 'd4 legal destination', exact: true }).count() === 0 && sent === 1, 'Pending moves block duplicate or additional submissions');
    release();
    await piece(host, 'e2', 'white pawn').waitFor(); await ready(host);
    assert(await host.locator('.move-cell').count() === 0 && await piece(guest, 'e2', 'white pawn').count() === 1, 'A rejected move restores the confirmed board and move history');
    await host.unroute(moveUrl);

    await host.route(moveUrl, route => route.abort('failed'));
    await play(host, 'e2', 'e4');
    await piece(host, 'e2', 'white pawn').waitFor(); await ready(host);
    assert(await piece(guest, 'e2', 'white pawn').count() === 1, 'A failed send rolls back without altering the opponent’s board');
    await host.unroute(moveUrl);

    let committed = 0;
    await host.route(moveUrl, async route => { committed++; await route.fetch(); await route.abort('failed'); });
    await play(host, 'e2', 'e4');
    await piece(guest, 'e4', 'white pawn').waitFor(); await ready(host);
    assert(await piece(host, 'e4', 'white pawn').count() === 1 && committed === 1 && await host.locator('.move-cell').count() === 1, 'A committed move with a lost response is recovered exactly once');
    await host.unroute(moveUrl);
    await play(guest, 'e7', 'e5');
    await piece(host, 'e5', 'black pawn').waitFor();

    const conflictGate = new Promise(resolve => { release = resolve; });
    await host.route(moveUrl, async route => { await conflictGate; await route.continue(); });
    await play(host, 'g1', 'f3');
    await piece(host, 'f3', 'white knight').waitFor();
    await guest.getByRole('button', { name: 'Offer a draw', exact: true }).click();
    await host.getByText('Your opponent offers a draw.', { exact: true }).waitFor();
    await piece(host, 'g1', 'white knight').waitFor();
    release(); await ready(host);
    assert(await piece(guest, 'g1', 'white knight').count() === 1, 'A newer conflicting server version takes precedence over the prediction');
    await host.unroute(moveUrl);
    await host.locator('.draw-offer').getByRole('button', { name: 'Decline', exact: true }).click();
    await ready(host); await resign(host);
    await host.getByRole('button', { name: 'Play again', exact: true }).click();
    await guest.getByRole('button', { name: 'Accept rematch', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    await guest.locator('.online-room-status.active').waitFor();
    assert(await piece(host, 'e2', 'white pawn').count() === 1 && await host.locator('.move-cell').count() === 0, 'A rematch starts with no old prediction or move history');

    await play(guest, 'f2', 'f3'); await piece(host, 'f3', 'white pawn').waitFor();
    await play(host, 'e7', 'e5'); await piece(guest, 'e5', 'black pawn').waitFor();
    await play(guest, 'g2', 'g4'); await piece(host, 'g4', 'white pawn').waitFor();
    const savedBefore = await host.evaluate(() => JSON.parse(localStorage.getItem('knight-club-games') || '[]').length);
    const resultGate = new Promise(resolve => { release = resolve; });
    await host.route(moveUrl, async route => {
      await resultGate;
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The game has changed. Please try again.' }) });
    });
    await play(host, 'd8', 'h4'); await piece(host, 'h4', 'black queen').waitFor();
    assert(await host.locator('.game-result').count() === 0 && await host.evaluate(() => JSON.parse(localStorage.getItem('knight-club-games') || '[]').length) === savedBefore, 'An unconfirmed checkmate does not award or save a result');
    release(); await piece(host, 'd8', 'black queen').waitFor(); await ready(host);
    await host.unroute(moveUrl);
    await play(host, 'd8', 'h4');
    await host.locator('.game-result').waitFor(); await guest.locator('.game-result').waitFor();
    assert((await host.locator('.online-result').textContent()).includes('Black wins by checkmate'), 'Confirmed checkmate finishes the same game on both boards');
    return results;
  } finally {
    release?.();
    await host.unroute(moveUrl);
    if (await host.locator('.online-room-status.active').count()) await resign(host).catch(() => {});
    await Promise.all(contexts.map(context => context.close()));
  }
}
