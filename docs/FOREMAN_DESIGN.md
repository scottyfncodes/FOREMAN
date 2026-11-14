# FOREMAN: design notes

What the game is, why it is built this way, and what was measured.

## The idea

You do not aim at a building. You read it. Every level is a structure that stands because
its loads have somewhere to go; the puzzle is to find the one piece whose loss leaves them
nowhere to go. You get a small number of charges. A charge removes one piece. Everything
after that is physics.

| Question | Answer in FOREMAN |
| --- | --- |
| What is "match four and watch it cascade"? | Take out a support and its neighbours inherit the weight. If that is more than they can hold they crack, hesitate, and fail, which hands the weight to the next ones. |
| What is the colour bomb? | Gas. A bottle goes off when hit, takes out the brick and timber around it, and sets off every bottle in reach. |
| What makes a move feel clever? | The result is out of proportion to the action, and you can say why: "that post was at 83% of its limit". |
| What is the perfect shot? | KEYSTONE: one charge brings down at least half the building. The game slows, stamps it, and records it on the job. |

## Rules the player learns (one per job)

1. **Watchman's Hut**: a charge removes a piece; what it held comes down. Get everything below the line.
2. **Frame House**: loads move to the neighbours. The post carrying the most is the one to cut.
3. **Mill Row**: a floor is a span. Remove the middle support and it snaps, and the break runs up the building.
4. **Tank Tower**: a building falls toward the support it lost. There is a house next door.
5. **Dockside Shed**: steel cannot be cut. Gas chains, and the steel stands on brick.
6. **Corner Shop**: a yellow pipe always ends at a gas bottle, even one sealed behind a wall.
7. **Harbour Flats**: concrete takes two charges, or one if the weight on it is more than cracked concrete can hold.

Nothing is hidden without a tell. Stress shows as cracks before you touch anything, the
LOADS view colours every piece by how close it is to its limit, selecting a piece reads out
what it carries, and hidden gas is always at the end of a visible pipe.

Stars are charges used against par (three at par, two at one over). There is no timer, no
currency and no lives.

## Architecture

The earlier game flew golf balls at 3D brick houses. Its simulation was built around a
projectile, with support solved as a side effect of what the ball removed. Making the
building itself the puzzle needed the opposite: structure first, and a deterministic,
readable answer to "what happens if this piece goes". Trade-offs considered:

| Option | Why not / why |
| --- | --- |
| Keep the 3D brick world, replace the ball with charges | Hundreds of small bricks per house: weight paths are not readable on a phone, and the support solve was not a load solve. |
| Full rigid-body simulation of the standing building | Stacks of jointed bodies creep, jitter and are costly on phones; nothing stands truly still, and there is no clean way to show why something failed. |
| **Hybrid (chosen)** | A load solver owns everything that is standing. Rigid bodies only exist for what has come loose. |

How the hybrid works (`src/foreman/sim/`):

- **`structure.ts`, the load solver.** Pure function. Weight travels down through the faces
  a piece sits on. A load between two supports is shared by the lever rule. A piece whose
  total load falls outside its supports tips. A post or wall is crushed when load over
  bearing width beats its material. A spanning piece snaps where the bending moment beats
  its depth. The output is a utilisation (load over capacity) for every piece.
- **`world.ts`, the world.** Fixed 60 Hz step, no randomness. Standing pieces are static
  colliders that cost nothing. Each step the solver runs; pieces with nothing under them,
  or off balance, become planck.js (Box2D) rigid bodies, joined into chunks along their
  bonds so a storey falls as a storey. Overloaded pieces accumulate damage at a rate set by
  how overloaded they are, which is the hesitation before a failure. Debris landing on
  standing pieces feeds the solver as an outside load, so a falling floor overloads the
  columns below it (pancake). A snapped span cuts a break line up through everything built
  across it, so the halves fold. Loose debris leaning on a free-standing wall can shove it
  over. Chunks hold together in free fall and come apart when they land or get propped.
- **`session.ts`, the game.** Charges, chain counter, score, tiers and the verdict, read
  only from simulation events.

Rendering (`src/foreman/render/`) is three.js: the 2D simulation drawn as a miniature set
with depth, one instanced draw call for all box pieces, materials drawn procedurally in the
shader in metres (brick stays brick-sized on any piece), cracks from a cell pattern driven
by damage, pooled debris and dust. The renderer never writes to the simulation.

The Demo Day games (golf, crew contracts) are untouched and load on their own page at
`?archive=1`, from Settings. Their saves are not read or written by FOREMAN, which stores
progress under `foreman:v1`.

## What was verified, and how

- `tests/foreman.test.ts`: solver arithmetic; every building stands at rest with every
  piece under its limit; every recorded solution clears within par with a keystone and a
  margin; identical inputs give identical collapses; different strikes give different
  collapses; the rule cases (steel, neighbour, concrete, hidden gas, supply crate).
- `pnpm probe`: tries every single strike on every level and prints the outcome. Used to
  set par and to check that the intended answer is not the only interesting thing to try.
- `pnpm smoke`: a headless iPhone plays all seven jobs with real taps, checks the losing
  path, touch target sizes, and that progress survives a reload.

## Known limits

- Performance on a real phone has not been measured here. The sandbox renders in software.
  Simulation cost is small (a full collapse of the largest level runs in a few tens of
  milliseconds of CPU in Node), and the scene is a handful of draw calls, but treat frame
  rate on device as untested.
- The collapse of a given strike is deterministic on one JavaScript engine. Results near a
  boundary could differ between engines; the recorded solutions are required to clear with
  margin for that reason.
- The load model is a teaching model, not engineering: no lateral loads on braced pieces,
  no buckling, simple spans only.
- Whether it is fun is a question for people. Things to watch in a playtest: do players
  find LOADS without being told; do they understand a failed attempt; does level 7's
  "corner column" answer feel fair.
