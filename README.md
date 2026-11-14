# Foreman

A demolition puzzle for the phone browser. Every building stands because its weight has somewhere to go. Find the one piece that changes that, set a charge on it, and the physics does the rest.

**Play it:** https://scottyfncodes.github.io/FOREMAN/

Add it to your iPhone Home Screen (Share → Add to Home Screen) for full-screen play. Progress is saved on the device.

## How it plays

- **Tap a piece, press BLAST.** A charge removes that piece. You get a few charges per job; three stars for doing it in par.
- **Get everything below the red line.** Some jobs add a neighbour you must not hit.
- **Loads move.** Take a support away and its neighbours carry the difference. Overloaded pieces crack, hold for a moment, then go, and hand their load to the next ones. That is the chain.
- **Read before you cut.** Stressed pieces already show cracks. LOADS colours every piece by how close it is to its limit. Selecting a piece tells you what it is holding.
- **Materials.** Timber and brick take one charge. Concrete takes two: the first cracks it to under half strength. Steel cannot be cut. Glass and infill panels hold nothing up.
- **Gas.** A bottle goes off when hit and sets off any bottle near it. A yellow pipe always ends at one, even when it is sealed behind a wall.
- **KEYSTONE.** Bring down half a building with one charge and the job is marked with it.

Seven jobs: a timber hut, a frame house, a brick terrace, a tower beside a house, a steel shed, a corner shop and a concrete apartment block. Each teaches one rule. See `docs/FOREMAN_DESIGN.md`.

## How it is built

- **Simulation** (`src/foreman/sim/`): a load solver (`structure.ts`) owns everything that is standing; planck.js rigid bodies exist only for what has come loose (`world.ts`). Fixed step, deterministic. Levels are data (`levels.ts`).
- **Game** (`src/foreman/game/session.ts`): charges, chain, score and verdict, read only from simulation events.
- **Rendering** (`src/foreman/render/`): three.js, one instanced draw call for the pieces, procedural materials and cracks, pooled debris and dust.
- **UI** (`src/foreman/ui/`): plain DOM over the canvas, touch first, safe-area aware.
- **Save**: `foreman:v1` in localStorage.
- **Archive**: the earlier Demo Day games (golf demolition and crew contracts) are kept whole in `src/golf`, `src/wreck`, `src/game`, `src/ui` and load on their own page from Settings (`?archive=1`). Their saves are untouched.
- Procedural Web Audio sound. PWA manifest and service worker.

## Development

```sh
pnpm install
pnpm dev          # local dev server
pnpm test         # vitest: load solver, every level at rest and solved, determinism, rules; plus the archive games' suites
pnpm typecheck    # tsc --noEmit
pnpm build        # production build to dist/
pnpm check        # all three
pnpm probe        # tries every single strike on every level and prints what happens
pnpm preview && pnpm smoke   # headless iPhone plays every job; then the archive smokes
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
