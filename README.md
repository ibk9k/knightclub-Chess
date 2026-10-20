# Knight Club

A responsive chess website built with React, TypeScript, Vinext, chess.js, and the real Stockfish 18 WebAssembly engine. A hosted Worker and D1 database synchronize online games. Stockfish runs in the browser; no API keys or paid analysis services are required.

## Run locally

```sh
npm install
npm run assets
npm run dev
```

Open the local URL printed by Vite. `npm run assets` prepares the installed Stockfish engine and downloads the 12 CC BY-SA chess piece SVGs. The prepared public assets are also included in the source repository.

## Production

```sh
npm run build
npm run start
```

The Sites build produces a Worker in `dist/server/` and browser assets in `dist/client/`. Keep the Sites Vite integration and the `DB` D1 binding in `.openai/hosting.json`. Publishing applies the tracked `drizzle/` migrations before deploying the Worker. For a local database, build once and apply pending migration files with:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_glorious_edwin_jarvis.sql
```

Apply each migration once. Local preview and production use separate databases. `npm run start` previews the production Worker locally. Cross-origin isolation is not required for Stockfish.

## Included

- Six bot opponents with Stockfish skill/depth limits and beginner mistake variation. Displayed bot ratings are approximate, not calibrated Elo.
- Click or drag legal moves, castling, en passant, underpromotion, check, mate, and automatic draw detection.
- Illegal clicks and drags show a plain-language explanation beside the board and mark the attempted destination. Help covers each piece’s movement, blocked paths, pawn captures, en passant, king safety, and individual castling restrictions. The piece stays selected for another try. Explanations work with keyboard controls and in standard online games without engine assistance; making a move, changing position, selecting another piece, dismissing the message, or pressing Escape clears them.
- Color selection, six time controls including untimed play, local games, hints, takebacks, flipping, move sounds, and board palettes.
- Bot games start with no clock. Timed play is an explicit choice.
- Online private rooms with 8-character codes and invite links, plus random matchmaking by time control. A random lobby can also be shared directly with a friend.
- Optional cheat mode at room creation gives both players the Stockfish bar, hints on their own turn, move analysis, and takebacks. It starts off, is disclosed before a guest joins, stays fixed for the room/rematches, and uses a separate matchmaking queue. A takeback during play undoes your last move and any reply on both boards without refunding elapsed clock time.
- Server-enforced legal moves, colors, turns, clocks, version conflicts, checkmate, draws, resignations, and two-player capacity. No account is needed. An HttpOnly browser cookie holds the seat credential; shared invite links never contain it. Refreshing or reconnecting restores the same seat in that browser.
- Online moves display immediately after local legality checks instead of waiting for the server round trip. Older heartbeats cannot undo a pending piece. Rejected moves restore the authoritative board, and lost responses are reconciled before rolling back, without resending the move. Clocks and game results remain server-authoritative. Visible games check for an opponent's move 200 ms after each completed read, with slower polling on your turn and in background tabs.
- Material advantage beside captured pieces: pawn 1, knight/bishop 3, rook 5, queen 9. Counts follow the displayed position and handle trades and promotions.
- Wins celebrate with brief confetti over the board; losses use a tipping king beside the result. Both respect reduced-motion preferences. Play again restarts against the actual current bot, or requests a rematch with the same online opponent. Online rematches require both players, keep the room/time control, switch colors, and reset the board and clocks. Rematch requests continue arriving during post-game review.
- Free live analysis in bot games: a separate full-strength Stockfish worker streams evaluation, search depth, and the best continuation while the opponent thinks. Analysis opens by default and follows the displayed position, including history and takebacks.
- Automatic move review, estimated move quality and accuracy, and game-wide review. Player feedback stays visible after the bot replies.
- PGN and FEN imports, PGN downloads, move history navigation, and completed game storage in the current browser.
- Responsive phone, tablet, and desktop layouts with keyboard-accessible controls and reduced-motion support.

Private rooms never enter random matchmaking. A waiting private invite expires after 24 hours. Public matchmaking only pairs players who are still checking in; closing a queue removes it from matching. Finished/cancelled rooms and abandoned invitations older than seven days are removed gradually as new rooms are created. Keep exported PGNs for a permanent copy.

Online moves and state are shared through short polling, including reconnection after a dropped request. Standard rooms disable hints, takebacks, the evaluation bar, and live analysis until the game ends. Cheat-mode rooms enable the same assistance for both players throughout play. Completed games can be reviewed and exported. Same-device games and bot practice remain available without a server connection. Browser cookies/storage must be available to resume an anonymous seat; using another browser or clearing cookies does not transfer a seat.

Move quality uses centipawn loss thresholds (25/65/130/250), with the engine’s top move labeled Best. Accuracy is an average exponential transform of evaluation loss. These are estimates and are independent of Chess.com’s proprietary classification. Explanations are context-sensitive templates, not generated by a language-model service.

Run `npm test` for rules integration, analysis polarity, special moves, outcome detection, and PGN round-trip checks. Run `npm run check` for TypeScript validation.

Multiplayer tests use SQLite and separate authenticated player sessions to exercise private room access, racing match requests, illegal/stale moves, terminal results, server clocks, and material scoring. With a local preview running, `playwright-cli run-code --filename=tests/browser/multiplayer.js` checks the full two-browser invite, matchmaking, reconnection, material, and phone-layout flows. The browser check creates temporary games in the selected environment; run it against local preview.

`tests/browser/online-latency.js` measures click-to-board latency with normal and delayed network requests, requiring local display within 100 ms. `tests/browser/online-move-recovery.js` exercises old heartbeats during a pending move, rejection and network failure rollback, committed moves with lost replies, conflicting versions, rematches, and confirmed-only results through the real two-player UI.

`tests/move-rules.test.ts` checks targeted rule explanations and that inspecting an attempt never mutates the game. `tests/browser/move-rules.js` verifies actual clicks, native dragging, keyboard input, mobile layout, and both colors in a standard online room.

Engine tests also verify in-progress UCI evaluation updates and cancellation when the displayed position changes. With the dev server running and a Playwright CLI browser open, run `playwright-cli run-code --filename=tests/browser/drag-live.js` to check the native piece-only drag preview and live bot-game analysis end to end.

## Credits

- [Stockfish.js 18.0.8](https://github.com/nmrugg/stockfish.js/tree/v18.0.8), GPL-3.0; matching source is available at the linked upstream release. The unmodified engine and its license are included in `public/engine/`.
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause.
- Cburnett chess pieces by Colin M. L. Burnett, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- Lucide icons, ISC license; DM Sans, SIL Open Font License.

Knight Club is an independent project and is unaffiliated with Chess.com.
