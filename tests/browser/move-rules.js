// Run with playwright-cli run-code --filename=tests/browser/move-rules.js.
async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage(), guest = await guestContext.newPage(), results = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const square = (actor, value) => actor.getByRole('button', { name: new RegExp(`^${value}( |$)`) });
  const attempt = async (actor, from, to) => {
    if (await square(actor, from).getAttribute('aria-pressed') !== 'true') await square(actor, from).click();
    await square(actor, to).click();
  };
  const load = async fen => {
    await host.getByRole('button', { name: 'Import PGN or FEN', exact: true }).click();
    await host.getByRole('textbox', { name: 'PGN or FEN', exact: true }).fill(fen);
    await host.getByRole('button', { name: 'Analyze game', exact: true }).click();
    await host.locator('.app-dialog').waitFor({ state: 'hidden' });
  };
  const explanation = actor => actor.locator('#move-rule-explanation');
  try {
    await host.goto(origin, { waitUntil: 'domcontentloaded' });
    await host.getByRole('button', { name: 'Analysis board', exact: true }).click();
    await attempt(host, 'e2', 'e5');
    assert((await explanation(host).textContent()).includes('Pawns move one square forward'), 'An illegal pawn click explains its movement rule');
    assert(await square(host, 'e2').getAttribute('aria-pressed') === 'true' && await host.locator('.invalid-square').count() === 1, 'The piece stays selected and the rejected destination is marked');
    assert(await square(host, 'e2').getAttribute('aria-describedby') === 'move-rule-explanation', 'The explanation is connected to the attempted squares for assistive tools');
    await square(host, 'g1').click();
    assert(await host.locator('.move-rule-notice').count() === 0, 'Choosing a different piece clears the explanation');
    await square(host, 'g3').click();
    assert((await explanation(host).textContent()).includes('Knights move in an L shape'), 'An invalid knight move gets its own explanation');
    await host.keyboard.press('Escape');
    assert(await host.locator('.move-rule-notice').count() === 0, 'Escape dismisses feedback and selection');
    await attempt(host, 'e1', 'g1');
    assert((await explanation(host).textContent()).includes('bishop on f1 is in the way'), 'A blocked castle explains the blocker even when the destination has a friendly piece');
    await square(host, 'c1').dragTo(square(host, 'h6'));
    assert((await explanation(host).textContent()).includes('pawn on d2 is blocking your bishop'), 'Dragging an illegal move uses the same rule explanation');
    await attempt(host, 'e2', 'e4');
    await host.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    assert(await host.locator('.move-rule-notice').count() === 0, 'A successful move clears the feedback');

    await load('k3r3/8/8/8/8/8/8/4K2R w K - 0 1');
    await square(host, 'e1').focus(); await host.keyboard.press('Enter');
    await square(host, 'g1').focus(); await host.keyboard.press('Enter');
    assert(await explanation(host).textContent() === 'You can’t castle while your king is in check.', 'Keyboard moves explain castling out of check');
    await host.screenshot({ path: 'output/playwright/move-rule-desktop.png', fullPage: true });
    await host.setViewportSize({ width: 390, height: 844 });
    await host.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.sidebar')).transform).m41 <= -213);
    assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Rule explanations fit a phone without horizontal overflow');
    await host.locator('.board-column').screenshot({ path: 'output/playwright/move-rule-mobile.png' });
    await host.getByRole('button', { name: 'Dismiss move explanation', exact: true }).click();
    assert(await host.locator('.invalid-square').count() === 0, 'Dismiss removes both the explanation and destination mark');
    await host.setViewportSize({ width: 1440, height: 1000 });

    await load('k3r3/8/8/8/8/8/4R3/4K3 w - - 0 1');
    await attempt(host, 'e2', 'd2');
    assert((await explanation(host).textContent()).includes('would leave your king in check'), 'A pinned piece explains the king-safety rule');
    await load('k4r2/8/8/8/8/8/8/4K2R w K - 0 1');
    await attempt(host, 'e1', 'g1');
    assert((await explanation(host).textContent()).includes('can’t castle through check'), 'Castling through check has a distinct explanation');
    await load('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    await host.getByRole('button', { name: 'Play online', exact: true }).click();
    await host.getByRole('combobox', { name: 'Online color' }).selectOption('w');
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    await host.locator('.online-room-status.waiting').waitFor();
    const invite = await host.getByRole('textbox', { name: 'Invite link', exact: true }).inputValue();
    await guest.goto(invite, { waitUntil: 'domcontentloaded' });
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    let sent = 0;
    for (const actor of [host, guest]) actor.on('request', request => { if (request.url().endsWith('/move') && request.method() === 'POST') sent++; });
    await attempt(host, 'e2', 'e5');
    assert((await explanation(host).textContent()).includes('Pawns move one square forward') && sent === 0, 'Standard online rooms explain rejected moves locally without sending them');
    assert(await host.getByRole('button', { name: 'Hint', exact: true }).isDisabled() && await host.getByRole('tab', { name: 'Analysis FREE' }).isDisabled(), 'Rules help preserves standard online assistance restrictions');
    await square(guest, 'e7').click();
    assert((await explanation(guest).textContent()).includes('opponent’s turn'), 'An online player gets a clear turn explanation');
    await attempt(host, 'e2', 'e4');
    await guest.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    assert(await guest.locator('.move-rule-notice').count() === 0, 'An opponent’s move clears an outdated explanation');
    await attempt(guest, 'e7', 'd6');
    assert((await explanation(guest).textContent()).includes('Pawns capture diagonally only'), 'Black receives the same rules help');
    await attempt(guest, 'e7', 'e5');
    await host.getByRole('button', { name: 'e5 black pawn', exact: true }).waitFor();
    assert(sent === 2 && await host.locator('.move-rule-notice').count() === 0, 'Legal moves still synchronize normally after invalid attempts');
    return results;
  } finally {
    if (await host.locator('.online-room-status.active').count()) {
      await host.getByRole('button', { name: 'Resign game', exact: true }).click();
      await host.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click();
    }
    await hostContext.close(); await guestContext.close();
  }
}
