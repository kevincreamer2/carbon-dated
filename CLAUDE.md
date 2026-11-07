# Carbon Dated — notes for Claude

- The question bank used from 8 Nov 2026 (`NB_DATA` in `index.html`) is stored scrambled so answers can't be read from the page source or this public repo. Never paste readable questions or answers into `index.html`.
- To read or edit it: `node tools/bank.mjs unpack` → edit `tools/bank.json` → `node tools/bank.mjs pack`. `node tools/bank.mjs check` prints the counts. `tools/bank.json` is git-ignored; never commit it.
- Run `nbRunway()` in the browser console to see when each kind of question runs out.
- `sw.js` gives offline support. The page itself is network-first, so deploys show up immediately; bump `CACHE` in `sw.js` only if cached icons or fonts need replacing.
- Keep the `stackle_` / `stackle3_` localStorage keys: renaming them would wipe players' streaks and history.
