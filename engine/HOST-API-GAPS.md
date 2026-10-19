# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at 1d0cf8f, which answered
the port's earlier lists: module specifiers and their queries, fuel,
rotation, audio lifetimes, the game socket's envelopes, rooms, instance
attributes, geometry, projection, draw, UI areas and tones, input sources
and bindings, preferences, bold text, session ends and sign-in (also from
UI buttons), report context, large textures, and R2's rendering: tone
mapping and HDR light, normal maps, physical and Lambert materials,
environments, four shadow casters with focus, points, anisotropy; system
fonts for the generic families, which are now the only names the system's
fonts have, so the port's font values name only generic families; WebP
images; measureText with weight and letter spacing). Each
entry names the module and member, the semantics wanted, why football needs
it, and what the port does meanwhile. Nothing here is football-specific.

## Not in the contract

1. **Post-processing passes** (`renderer`): the browser's High and Ultra
   presets add GTAO ambient occlusion (`ao`, blend 0.7–0.85) and every preset
   but Low a colour grade (`grade`: a gentle S-curve, 1.12 saturation, a
   cool-shadow/warm-highlight split and a 0.26 vignette, before output);
   its bloom also has a radius (0.45) and renders at the budget's
   `bloomRes`. Wanted: ambient occlusion and a grade (or a small fixed set
   of post effects with these parameters) the game can turn on; bloom's
   radius. Meanwhile neither, and bloom at the host's own radius.
2. **`PMREMGenerator.fromScene`** (no render-to-texture): the browser
   renders its environment from a small scene. The port writes the same
   scene as a latitude-longitude image of linear light
   (`world/environment.ts`) and prefilters that, which matches; noted only
   because a game with a more complex environment scene would need it.

## Open

Found by running the port on the runtime (branch `script-next` at 0f3a320,
release build, the engine's football probe and its full-match probe at
960 × 540, High tier). Earlier findings are answered there: system fonts
cover the browser's text (the port's ASCII folding is gone), and retained
instancing took the per-frame host cost of the crowd away (the game thread
now takes 3.7–3.9 ms a frame at the median, 4.3–4.9 ms at p95).

3. **Runtime — game-thread stalls in play: not reproduced on dcc2be3.**
   On bdf60c8 to 1d0cf8f the full-match probe showed 50–100 ms stalls
   every 1,000–1,500 frames of play, growing over the match, which looked
   like collection pauses on a growing heap. On dcc2be3 (two full matches
   with `STARHERMIT_GC_TRACE=1` on a quiet machine) the slowest frame in
   play was 26 and 15 ms (p99 10–11 and 7–8 ms), the slowest of 546
   collections 13 ms, and the heap levels off near 16 MiB. The earlier
   runs were on a heavily loaded machine; kept open until a loaded run
   agrees.

4. **`starhermit:engine` — no wall-time frame budget.** `fuelLeft()` counts
   reference instructions (100,000 to the millisecond), which ran about
   2.8× slower than that here, so fuel cannot pace work across a frame.
   Football slices its loading (stadium, crowd, environment, footballers)
   into a share of each frame. Wanted: the frame's start time on
   `frame()` (or the wall time left in it). Meanwhile `engine/src/tasks.ts`
   times an 8 ms share itself and keeps 6 ms of fuel in reserve.

5. **`starhermit:scene` — `BufferGeometry` helpers are slow for scripts.**
   `toNonIndexed` and `computeBoundingSphere` cost about 1.5 µs a vertex:
   17 ms for the stands' 108 boxes. Wanted: helpers whose per-vertex work
   runs in the host. Meanwhile the port's `mergeGeoms`
   (`world/stadium.ts`) expands indices in one pass and skips the bounding
   sphere, which the runtime never reads (3.5 ms).
