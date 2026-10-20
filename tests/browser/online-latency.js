// Measures the actual board update after clicking a legal destination.
// Run with playwright-cli run-code --filename=tests/browser/online-latency.js.
async (basePage) => {
  const browser = basePage.context().browser(), origin = new URL(basePage.url()).origin;
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
  const measure = async (actor, from, to, piece) => {
    await actor.getByRole('button', { name: `${from} ${piece}`, exact: true }).click();
    await actor.evaluate(({ to, piece }) => {
      window.__moveLatency = null;
      let started = 0;
      const click = event => {
        if (event.target.closest('button')?.getAttribute('aria-label')?.startsWith(`${to} `)) started = performance.now();
      };
      const observer = new MutationObserver(() => {
        if (started && document.querySelector(`button[aria-label="${to} ${piece}"]`)) {
          window.__moveLatency = Math.round(performance.now() - started);
          observer.disconnect(); document.removeEventListener('click', click, true);
        }
      });
      document.addEventListener('click', click, true);
      observer.observe(document.body, { subtree: true, attributes: true, childList: true });
    }, { to, piece });
    await actor.getByRole('button', { name: new RegExp(`^${to}( (white|black) \\w+)? legal destination$`) }).click();
    await actor.waitForFunction(() => window.__moveLatency !== null);
    return actor.evaluate(() => window.__moveLatency);
  };
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
    const normalMs = await measure(host, 'e2', 'e4', 'white pawn');
    await guest.getByRole('button', { name: 'e4 white pawn', exact: true }).waitFor();
    await measure(guest, 'e7', 'e5', 'black pawn');
    await host.getByRole('button', { name: 'e5 black pawn', exact: true }).waitFor();
    await host.route('**/api/online/rooms/*/move', async route => {
      await new Promise(resolve => setTimeout(resolve, 1100));
      await route.continue();
    });
    const delayedNetworkMs = await measure(host, 'g1', 'f3', 'white knight');
    await guest.getByRole('button', { name: 'f3 white knight', exact: true }).waitFor();
    if (normalMs > 100 || delayedNetworkMs > 100) throw new Error(`Online input lag: normal=${normalMs}ms, delayed network=${delayedNetworkMs}ms. Own moves must display within 100ms without waiting for the server.`);
    return { normalMs, delayedNetworkMs, synchronized: true };
  } finally {
    if (await host.getByRole('button', { name: 'Resign game', exact: true }).isEnabled().catch(() => false)) {
      await host.getByRole('button', { name: 'Resign game', exact: true }).click();
      await host.locator('.app-dialog').getByRole('button', { name: 'Resign game', exact: true }).click();
    }
    await Promise.all(contexts.map(context => context.close()));
  }
}
