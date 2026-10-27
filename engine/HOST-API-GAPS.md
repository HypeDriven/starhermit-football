# Host API gaps found by the football

What the game (`engine/src`) still needs from the StarHermit runtime's host API
(`engine/starhermit.d.ts`, from the 1.16.1 runtime, host API 1.18). Each entry
names the module and member, the semantics wanted, why football needs it, and
what the game does meanwhile. Nothing here is football-specific. The answered
entries are kept below, briefly, for their history.

## Open


2. **`PMREMGenerator.fromScene`** (no render-to-texture): the floodlit
   environment is a small scene (four lamp banks, the LED ring, turf and a
   night sky). The game writes that scene as a latitude-longitude image of
   linear light (`world/environment.ts`) and prefilters it, which matches;
   noted because a game with a more complex environment scene would need it.

4. **`starhermit:engine` — no wall-time frame budget.** `fuelLeft()` counts
   reference instructions (100,000 to the millisecond), which ran about
   2.8× slower than that on the probe machine, so fuel cannot pace work
   across a frame. Football slices its loading (stadium, crowd, environment,
   footballers) into a share of each frame. Wanted: the frame's start time on
   `frame()` (or the wall time left in it). Meanwhile `engine/src/tasks.ts`
   times an 8 ms share itself and keeps 6 ms of fuel in reserve; a stadium a
   mode lets go is kept for the next mode with the same pitch, so most
   rebuilds are not needed.

5. **`starhermit:scene` — `BufferGeometry` helpers are slow for scripts.**
   `toNonIndexed` and `computeBoundingSphere` run per vertex in script
   (about 1.5 µs a vertex when measured: 17 ms for the stands' 108 boxes).
   Wanted: helpers whose per-vertex work runs in the host. Meanwhile the
   game's `mergeGeoms` (`world/stadium.ts`) expands indices in one pass and
   skips the bounding sphere, which the runtime never reads.

## Answered

1. **Post-processing passes** — API_MINOR 4 (da27a93): `renderer.ao`,
   `bloom` (with radius and resolution), `grade` and `antialias` at three.js
   r176 parity, and `noAO`; each preset turns on its effects (spec.md
   section 8).
3. **Game-thread stalls in play** — not reproduced on dcc2be3; collection
   pauses later went from 3.3 to 0.23 ms in play (incremental marking).
6. **The scene sync's walk and `Euler.set`** — the native scene sync, and
   world kernels with node bindings for the footballers' poses.
7. **Every material in use compared every frame** — materials are made and
   updated natively by the scene sync.
8. **`draw.text` laid out on every call** — text layouts are cached by text
   and style.
9. **Per-entity animation interpreted** — `starhermit:world`: the crowd's sway,
   the haze and the poses are kernels with instance and node bindings.
10. **The crowd's native cost** — sliced schedules and tracked instance
   bindings (an eighth of the crowd a frame, only those rows composed).
11. **Collections from the draw prelude** — the preludes make no garbage in
   the steady state (draw options read field by field, no clip arrays or
   spreads).
