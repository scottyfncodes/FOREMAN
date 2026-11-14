# Foreman

Golf-powered demolition puzzles for the phone browser, set on a worn-out driving range in West Texas with a caddie who has seen it all. Every building stands because its weight has somewhere to go. Find the piece that changes that, put a golf ball on it, and the physics does the rest.

**Play it:** https://scottyfncodes.github.io/FOREMAN/

Add it to your iPhone Home Screen (Share → Add to Home Screen) for full-screen play. Progress is saved on the device.

## How it plays

- **Touch the spot, pull back, let go.** The pull sets power. The guide shows the flight, and the read-out says what the piece is holding and what this shot will do to it.
- **Get everything below the red line** inside the shot budget. One star for doing it, two for par, three for beating par or for a par finish with a KEYSTONE: one shot that drops half the building.
- **A ball goes through or it cracks.** Timber and glass give way to a standard ball. Brick only cracks, losing up to half its strength, which is enough for a pier already near its limit. Concrete needs the Heavy ball. Balls bounce off steel.
- **Loads move.** Take a support away and its neighbours carry the difference. Overloaded pieces crack, hold for a moment, then go, and hand their load on. That is the chain.
- **Read before you swing.** Stressed pieces already show cracks. LOADS colours every piece by how close it is to its limit.
- **Hidden things have tells.** A yellow pipe ends at a gas bottle, even one sealed behind a wall. A painted ring marks a piece with a special ball inside (Power, Heavy, Charge).

Nine jobs out on the range: a deer blind, an old ranch house, the feed store, the water tower, a welding shop, the filling station, the Starlite Motel, the Cattlemen's Bank and an eighteen-metre grain elevator. See `docs/FOREMAN_DESIGN.md`.

**Classic** (Settings): the earlier brick-house golf game with its campaign, Daily Demo, Sandbox and Challenges, and Crew Contracts behind that. All kept whole with their own saves.

## How it is built

- **Simulation** (`src/foreman/sim/`): a load solver (`structure.ts`) owns everything standing; planck.js rigid bodies exist only for what has come loose (`world.ts`). Fixed step, deterministic. Jobs are data (`levels.ts`).
- **Game** (`src/foreman/game/`): ball flight (`shot.ts`); shot budget, ball bag, chain, score and verdict (`session.ts`).
- **Rendering** (`src/foreman/render/`): three.js, instanced pieces with procedural materials and cracks, pooled chips and dust. The setting (`range.ts`) is all scenery: hardpan, mesas, a pump jack, a windmill, a pickup, range balls, tumbleweeds and an armadillo.
- **UI** (`src/foreman/ui/`): plain DOM over the canvas, touch first, safe-area aware.
- **Classic games**: `src/golf` (golf), `src/wreck`, `src/game`, `src/ui`, `src/render` (crew contracts).
- Procedural Web Audio sound. PWA manifest and service worker.

## Development

```sh
pnpm install
pnpm dev          # local dev server
pnpm test         # vitest: FOREMAN solver, shots, jobs and rules; plus the classic suites
pnpm typecheck    # tsc --noEmit
pnpm build        # production build to dist/
pnpm check        # all three
pnpm probe        # fires a ball at every piece of every job and prints what happens
pnpm preview && pnpm smoke   # headless iPhone plays every job; then the classic smokes
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
