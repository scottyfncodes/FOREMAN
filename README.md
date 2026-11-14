# Foreman

Golf shots knocking down houses, as a shot-budget puzzle game for the phone browser. A worn-out driving range in West Texas, a pro in a straw hat, a caddie who has seen it all, and a street's worth of brick houses standing where the 150 marker should be.

**Play it:** https://scottyfncodes.github.io/FOREMAN/

Add it to your iPhone Home Screen (Share → Add to Home Screen) for full-screen play. Progress is saved on the device.

## How it plays

- **Touch the spot, pull back, let go.** The pull sets power; the flight bends to reach your spot. The guide shows the flight to the first thing it touches.
- **Every house is a puzzle.** Bring a share of it down inside a shot budget. Out of shots short of the goal is a fail and an instant retry on a fresh house.
- **Stars.** One for reaching the goal in budget, two for doing it at par, three for beating par. Par is what a careful bot manages with standard balls alone, so three stars takes something smarter: a gas chain, a special ball, a better read of the structure.
- **A ball knocks a hole, not a chip.** In the campaign a standard ball takes out a patch of wall. Take the wrong patch and nothing follows. Take the bricks under a lintel, a corner, or a porch column and the load above has nowhere to go.
- **Chain reactions.** Falling pieces hit hard and heavy ones send a shock into what they land on. Red gas bottles go off a beat after they are hit and set off any bottle in reach.
- **Weak points** pulse yellow while you aim: the standing parts whose loss would bring the most down.
- **Special balls are hidden in the bricks.** Break the right brick and a Power, Superball, Multiball, Heavy or Charge ball pops into your bag.

## Modes

- **Play**: ten houses, each bigger than the last, from a one-storey cottage to a three-storey house 14 m wide. Each has a destruction goal, a shot budget and a par.
- **Daily Demo**, **Sandbox**, **Challenges**: as before.
- **Frame Jobs** (Settings): an experiment with the same golf shot against bare structures and a load solver. Not the main game.
- **Crew Contracts** (Settings): the original machine-and-moves game, with its own save.

## How it is built

- **Game layer** (`src/golf/game/`): pull-back controls, shot quality, the reward economy and the campaign houses with their goals, budgets and par.
- **Simulation** (`src/golf/sim/`): deterministic and fixed-step (120 Hz). `house.ts` lays out the house brick by brick with openings, lintels, floors, partitions, stairs, roof decks and tiles, chimney, porch, furniture and garden, and links what rests on what. `world.ts` flies the balls, resolves damage (including the campaign's ball punch), solves support and load, and drops loose parts as tumbling debris.
- **Rendering** (`src/golf/render/`): three.js, instanced parts, pooled effects. The setting comes from `src/foreman/render/range.ts`.
- **Save**: `demo-day:golf` (version 2). House records gained a `stars` field; old saves load as before.
- Procedural Web Audio sound. PWA manifest and service worker.

## Development

```sh
pnpm install
pnpm dev          # local dev server
pnpm test         # vitest: physics, structure, controls, rewards, saves, every house at par, every challenge at par
pnpm typecheck    # tsc --noEmit
pnpm build        # production build to dist/
pnpm check        # all three
pnpm par          # a greedy bot plays every house and records its line (sets par)
pnpm preview && pnpm smoke   # headless iPhone runs
```

Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
