// Run locally with playwright-cli run-code --filename=tests/browser/cheat-mode.js.
async (basePage) => {
  const results = [], browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  const assert = (condition, message) => { if (!condition) throw new Error(message); results.push(message); };
  const play = async (actor, from, to) => {
    const source = actor.getByRole('button', { name: new RegExp(`^${from} (white|black) `) });
    if (await source.getAttribute('aria-pressed') !== 'true') await source.click();
    await actor.getByRole('button', { name: new RegExp(`^${to}( (white|black) \\w+)? legal destination$`) }).click();
  };
  const resign = async actor => { await actor.getByRole('button', { name: 'Resign game', exact: true }).click(); await actor.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click(); };
  try {
    await host.goto(origin); await host.getByRole('button', { name: 'Play online', exact: true }).click();
    const toggle = host.getByRole('switch', { name: 'Cheat mode', exact: true });
    assert(await toggle.getAttribute('aria-checked') === 'false', 'Cheat mode starts switched off');
    await host.getByRole('textbox', { name: /Your name/ }).fill('Alice');
    await host.getByRole('combobox', { name: 'Online color' }).selectOption('w');
    await toggle.click();
    await host.getByRole('switch', { name: 'Allow direct takebacks', exact: true }).click();
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    await host.locator('.online-room-status.waiting').waitFor();
    let code = (await host.locator('.room-code-box strong').textContent()).trim();
    await guest.goto(`${origin}/?join=${code}`);
    await guest.getByText('Cheat mode is on', { exact: true }).waitFor();
    assert(await guest.getByRole('button', { name: 'Join with cheats', exact: true }).isEnabled(), 'Invitees see the shared assistance setting before joining');
    await guest.getByRole('textbox', { name: /Your name/ }).fill('Bob');
    await guest.getByRole('button', { name: 'Join with cheats', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    await Promise.all([host, guest].map(actor => actor.waitForFunction(() => document.querySelector('.engine-status.ready'))));
    for (const actor of [host, guest]) {
      assert(await actor.locator('.cheat-mode-banner').isVisible(), 'The shared cheat-mode setting is visible to a player');
      assert(await actor.locator('.evaluation-bar').isVisible(), 'A player has the live Stockfish evaluation bar');
      assert(await actor.getByRole('tab', { name: 'Analysis FREE' }).isEnabled(), 'A player can open analysis during the game');
    }
    assert(await host.getByRole('button', { name: 'Hint', exact: true }).isDisabled() && await guest.getByRole('button', { name: 'Hint', exact: true }).isDisabled(), 'Direct hints remain disabled for both assisted players');
    await play(host, 'e2', 'e4');
    await guest.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    await play(guest, 'e7', 'e5');
    await host.getByRole('button', { name: 'e5 black pawn', exact: true }).waitFor();
    await play(host, 'g1', 'f3');
    await guest.getByRole('button', { name: 'f3 white knight', exact: true }).waitFor();
    await host.waitForFunction(() => /Nf3.*(Best|Excellent|Good|Inaccuracy|Mistake|Blunder)/.test(document.querySelector('.analysis-judgment strong')?.textContent || ''));
    await guest.waitForFunction(() => /e5.*(Best|Excellent|Good|Inaccuracy|Mistake|Blunder)/.test(document.querySelector('.analysis-judgment strong')?.textContent || ''));
    assert(true, 'Both players receive move-quality analysis without stopping online play');
    await host.screenshot({ path: 'output/playwright/cheat-mode-desktop.png', fullPage: true });
    await host.getByRole('tab', { name: 'Game', exact: true }).click();
    await guest.getByRole('tab', { name: 'Game', exact: true }).click();
    await guest.getByRole('button', { name: 'Take back', exact: true }).click();
    await host.getByRole('button', { name: 'g1 white knight', exact: true }).waitFor();
    await host.getByRole('button', { name: 'e7 black pawn', exact: true }).waitFor();
    assert(await host.locator('.move-cell').count() === 1 && await guest.locator('.move-cell').count() === 1, 'Black’s takeback removes their move and the reply on both boards');
    await play(guest, 'c7', 'c5');
    await host.getByRole('button', { name: 'c5 black pawn', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Take back', exact: true }).click();
    await guest.getByRole('button', { name: 'e2 white pawn', exact: true }).waitFor();
    await guest.getByRole('button', { name: 'c7 black pawn', exact: true }).waitFor();
    assert(await guest.locator('.move-cell').count() === 0, 'White has the same synchronized takeback ability');
    await host.getByRole('button', { name: 'Analysis board', exact: true }).click();
    assert((await host.locator('.breadcrumb').textContent()).includes('Online game'), 'Opening analysis keeps the player in the shared game');
    await resign(host);
    await host.getByRole('button', { name: 'Play again', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Play again', exact: true }).click();
    await guest.getByRole('button', { name: 'Accept rematch', exact: true }).waitFor();
    await guest.getByRole('button', { name: 'Accept rematch', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    assert(await host.locator('.cheat-mode-banner').isVisible() && await guest.locator('.cheat-mode-banner').isVisible(), 'Rematches preserve cheat mode for both players');
    await resign(host);
    await guest.getByRole('button', { name: 'Leave room', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Leave room', exact: true }).click();
    await guest.getByRole('button', { name: 'Leave room', exact: true }).click();
    if (await toggle.getAttribute('aria-checked') === 'true') await toggle.click();
    await host.getByRole('button', { name: 'Create private room', exact: true }).click();
    await host.locator('.online-room-status.waiting').waitFor();
    code = (await host.locator('.room-code-box strong').textContent()).trim();
    await guest.getByRole('textbox', { name: 'Have an invite?' }).fill(code);
    await guest.locator('.join-preview strong').filter({ hasText: 'Standard game' }).waitFor();
    await guest.getByRole('button', { name: 'Join', exact: true }).click();
    await host.locator('.online-room-status.active').waitFor();
    await play(host, 'e2', 'e4');
    await guest.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    for (const actor of [host, guest]) {
      assert(await actor.locator('.evaluation-bar').count() === 0 && await actor.getByRole('tab', { name: 'Analysis FREE' }).isDisabled(), 'Standard rooms keep engine analysis off');
      assert(await actor.getByRole('button', { name: 'Hint', exact: true }).isDisabled() && await actor.getByRole('button', { name: 'Take back', exact: true }).isDisabled(), 'Standard rooms keep hints and takebacks off for both players');
    }
    await resign(host); await host.getByRole('button', { name: 'Leave room', exact: true }).click();
    await host.setViewportSize({ width: 390, height: 844 });
    await host.waitForFunction(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.sidebar')).transform).m41 <= -213);
    assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The cheat-mode toggle and room controls fit a phone');
    await host.screenshot({ path: 'output/playwright/cheat-mode-mobile.png', fullPage: false });
    return results;
  } finally { await hostContext.close(); await guestContext.close(); }
}
