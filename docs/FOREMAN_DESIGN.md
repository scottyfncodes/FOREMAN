# FOREMAN: design notes

What this generation of the game is, why it is built this way, and what was measured.

## The idea

Golf shots solve buildings. You stand at the tee, touch the spot you want to hit, pull back
for power and let go. The ball is small and the building is big, so a shot only matters if
it lands on the right piece: the one whose loss (or weakening) leaves the weight above it
with nowhere to go. Everything after the ball lands is physics.

The earlier game had the right verb and the wrong buildings. Its houses were one to three
thousand loose bricks with every wall bearing load; a full-power ball into the Starter
Cottage moved the destruction meter by 0.1%. So the golf stayed and the buildings were
replaced.

| Question | Answer in FOREMAN |
| --- | --- |
| What is "match four and watch it cascade"? | A ball takes out or cracks a support. Its neighbours inherit the weight. If that is more than they can hold they crack, hesitate and fail, and hand the weight on. |
| What is the colour bomb? | Gas bottles (visible, or sealed behind a wall at the end of a yellow pipe) and the special balls sealed in marked pieces. |
| What makes a shot feel clever? | The result is out of proportion to the ball, and you can say why: "that pier was at 87% of its limit, and a crack takes up to half its strength". |
| What is the perfect shot? | KEYSTONE: one shot brings down at least half the building. The game slows, stamps it, and it is the difference between two stars and three at par. |

## Setting and voice

A worn-out driving range in West Texas, late in the day: hardpan and scrub out to the mesas,
telephone poles down the county road, a pump jack, a windmill, a pickup by the tee, range
balls nobody picked up, tumbleweeds, an armadillo. The pro wears a straw hat and a faded
shirt. The jobs are the buildings a town like that has, each with its sign still up. A
caddie comments after every shot and on every verdict: dry, unimpressed, on your side.
The tone is a long-shot golfer who would rather go for it than lay up. No character,
name or line is taken from any film.

## Rules the player learns (one per job)

1. **Deer Blind**: touch, pull, let it rip. Knock out a stilt and it goes over.
2. **Old Ranch House**: loads move. The post carrying the most is the one worth a ball.
3. **Feed Store**: a standard ball only cracks brick, and a crack costs up to half its strength. On the pier that is nearly at its limit, that is enough. Then the floor span snaps and the break runs up the building.
4. **Water Tower**: where you cut a tower decides which way it goes, and the preacher lives next door.
5. **Welding Shop**: balls bounce off steel. Gas chains, and the steel stands on brick.
6. **Filling Station**: a yellow pipe always ends at a gas bottle, even one sealed behind a wall.
7. **Starlite Motel**: concrete shrugs off a standard ball. A painted ring marks a piece with a special ball inside; the Heavy ball goes through concrete.
8. **Cattlemen's Bank**: six storeys. Find the Charge ball, then put it where the load is greatest.
9. **Grain Elevator**: eighteen metres of concrete silos on five piers near their limit, with propane underneath. The big finish.

Nothing is hidden without a tell: stress shows as cracks before anything is hit, LOADS
colours every piece by how close it is to its limit, the aim read-out says what the piece
is holding and what this shot at this power will do to it, hidden gas is at the end of a
pipe, and hidden balls are under a painted ring.

**Budget and stars.** Every job has a hard shot budget; out of shots is a fail and an
immediate retry. One star for getting it down in budget, two for par, three for beating par
or a par finish with a keystone. No timers, currencies or lives.

## Architecture

Kept from the golf game: the control scheme and its tested numbers (`src/golf/game/controls.ts`),
the golfer (`src/golf/render/models.ts`), the sound engine, and the
whole earlier game, which still runs from Settings as "Classic".

Replaced: buildings, destruction, levels and the play screen (`src/foreman/`).

| Option considered | Verdict |
| --- | --- |
| Keep the 3D brick-by-brick world and add a load model | Thousands of interchangeable bricks give a ball nothing decisive to hit, and weight paths cannot be read on a phone. |
| Full rigid-body simulation of the standing building | Jointed stacks creep and jitter, cost too much on phones, and cannot explain why something failed. |
| **Hybrid (chosen)** | A load solver owns everything that is standing. Rigid bodies exist only for what has come loose. The building faces the tee; the ball arrives through the air and strikes its face. |

- **`sim/structure.ts`, the load solver.** Weight travels down through the faces a piece
  sits on; a load between two supports is shared by the lever rule; a piece whose load
  falls outside its supports tips; a post or wall is crushed when load over bearing width
  beats its material; a span snaps where the bending moment beats its depth.
- **`sim/world.ts`, the world.** Fixed 60 Hz step, no randomness. A ball with enough energy
  punches a local hole and the rest of the piece stays standing around it; with less it
  cracks the piece and weakens it. Overloaded pieces accumulate damage at a rate set by how
  overloaded they are, which is the hesitation before a failure. Pieces with nothing under
  them become planck.js (Box2D) rigid bodies, joined into chunks so a storey falls as a
  storey. Debris landing on standing pieces feeds the solver as load, so a falling floor
  overloads the columns below. A snapped span cuts a break line up the building so the
  halves fold. Leaning debris can shove a free-standing wall over.
- **Fragmentation in three tiers.** Structure pieces (tens to low hundreds per building);
  real rubble lumps (bricks, boards, concrete chunks) spawned when a falling piece breaks,
  under a budget of 150 moving at once; and up to 1,500 drawn-only chips plus dust, which
  cost almost nothing.
- **`game/shot.ts`** is the ball flight (power sets launch speed, loft is solved to reach
  the spot, impact energy follows from impact speed). **`game/session.ts`** is the budget,
  bag, chain, score and verdict, read only from simulation events.
- **Rendering** (`render/`): three.js, one instanced draw call for the box pieces, materials
  and cracks drawn procedurally in the shader in metres, a camera that sits behind the golfer
  to aim and travels in with the ball for the collapse.

Saves: FOREMAN uses `foreman:v1`. The classic golf and crew saves are not read or written.

## What was verified, and how

- `tests/foreman.test.ts` (47 cases): solver arithmetic; ball flight lands where aimed and
  hits harder when pulled harder; every building stands at rest with every piece under its
  limit; every recorded solution clears at par for three stars with margin; identical shots
  give identical collapses and different shots give different ones; local holes; cracking;
  steel; the neighbour; hidden gas; hidden balls; running out of shots.
- The classic golf test suites still pass unchanged.
- `pnpm probe`: fires a ball at every piece of every job and prints what happens. Used to
  set par.
- `pnpm smoke`: a headless iPhone plays all nine jobs with the real press-and-pull
  gesture, then checks the failing path, a reload, and that classic golf still opens.

## Known limits

- Frame rate on a real phone is not measured here: this sandbox renders in software.
  Simulation cost is small and the scene is a handful of draw calls, but treat on-device
  performance as untested until someone plays it on an iPhone.
- Collapses are deterministic on one JavaScript engine. Near a boundary, engines could
  differ, so recorded solutions must clear with margin.
- The buildings are one bay deep. Shots arrive at the face; there is no shooting through
  a building into a room behind.
- Power is reach and force. A full pull is usually right; soft shots matter only when a
  full one would overshoot the job (it rarely does). Worth revisiting.
- The load model is a teaching model, not engineering.
- Whether it is fun is a question for people. Watch for: do players read the aim read-out,
  do they find LOADS unprompted, does a failed job tell them what to try next.
