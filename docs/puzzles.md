# Puzzles

`src/puzzle-data.json` contains 382 puzzles selected from the primary Lichess
open puzzle export, retrieved on 2026-10-23. The export is released under CC0:
https://database.lichess.org/#puzzles

The importer (`node scripts/import-puzzles.mjs`, Node 24+) downloads at most
8 MiB of the compressed export, selects a varied sample across 12 tactical
themes and three rating bands, applies the opponent's setup move, and verifies
every continuation with chess.js. Ratings are Lichess puzzle ratings, not
player ratings. The site bundles the selected data; visitors do not depend on
Lichess API availability. Tests validate every solution and mate position.

Daily puzzles follow a deterministic sequence of short puzzles rated at most
1500, selected by the visitor's local calendar date. Solving the full line,
including with hints or retries, records that day's completion once. Viewing
a solution alone does not record a solve. A puzzle started yesterday cannot
credit today. The streak remains active through the day after the last solve;
missing that day resets the current streak while preserving the best.

Progress uses versioned browser-local storage, recovers from invalid data,
and merges completed puzzles across open tabs. No account or network request
is needed to solve puzzles. This is practice progress, not a competitive
rating or a server-verified achievement system.

Keep catalogue ordering and the daily selection pool stable when possible:
changing either can change which puzzle is selected for a calendar date.
