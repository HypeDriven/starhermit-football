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

## Per-frame script cost

Found by profiling the port's own callbacks on the Linux football probe
(runtime e409a71, release, 960 × 540, High tier, the 5-a-side practice
match at 60 frames a second) after the port took what it could off the
game thread itself (crowd, flashes, rig nodes, HUD strings; see the
commits on `engine-port-perf`). In play the game thread takes about
3.1 ms a frame at the median; the game's callbacks take about 1.6 ms of it
and the scene sync and the host the rest. The native-logic plan
(spec/native-logic.html in the engine) answers each of these; listed so
the reference title's numbers can be checked against it.

6. **`starhermit:scene` — the sync visits every visible node every
   frame, and an Euler set is expensive.** `syncScene` checks each
   visible node after `onRender` whether or not it changed: about 2.7 µs a
   node (the footballers' 330 nodes, frozen, still cost 0.9 ms against
   hidden). An
   `Euler.set` costs about 1.75 µs (its quaternion's update reads the
   Euler through four getters and recomputes six sines and cosines), so a
   footballer's 14 joints cost about 30 µs a frame. Wanted: the scene as
   a native table with dirty rows, and a rig evaluator. Meanwhile each
   joint is the mesh of its body part (18 nodes a footballer instead of
   the browser's 33) and a joint whose angles did not change is not set.

7. **`starhermit:scene` — every material in use is compared every
   frame.** `materialHandle` compares 31 parameters of each distinct
   material a visible node uses, once a sync: about 4–9 µs a material
   (72 in a 5-a-side match, so 0.3–0.6 ms; 34 fewer saved 0.13–0.3 ms).
   Wanted: materials marked dirty by their setters. Meanwhile nothing:
   each skin tone, back number and name tag is its own material, as in
   the browser.

8. **`starhermit:draw` — text is laid out on every call.** `draw.text`
   shapes its string on each call, and spaced text becomes one overlay
   item a character: about 60–75 µs for the banner's 51 px line, so a
   banner (green glow copies, then the text with its drop shadow) cost
   about 0.45 ms a frame while it showed, and the mouse hint about 60 µs
   every frame. Wanted: layouts cached by string, font, size and spacing
   (or retained HUD text). Meanwhile the HUD keeps its `measureText`
   widths and strings until they change, and the banner draws its glow
   two copies a call (the second as the call's shadow, one layout).

9. **`starhermit:world` — per-entity animation runs interpreted.** The
   crowd's sway and bounce (an eighth of the ~8,400 spectators a frame,
   as the browser does) cost about 0.65 ms a frame after its shake-free
   path, about 0.6 µs a spectator, mostly typed-array reads and writes;
   the haze drift about 0.1 ms. Wanted: a table with a kernel and an
   instance binding, as in the plan's sway example (`table("crowd", …)`,
   `kernel(crowd, (r, u, f) => …)`, `bind.instances(crowdMesh, crowd,
   …)`), the camera flashes as an emitter and the haze as an oscillator,
   so every spectator could move every frame for less.
