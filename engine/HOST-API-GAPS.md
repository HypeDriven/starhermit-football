# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at 0f3a320, which answered
the port's earlier lists: module specifiers and their queries, fuel,
rotation, audio lifetimes, the game socket's envelopes, rooms, instance
attributes, geometry, projection, draw, UI areas and tones, input sources
and bindings, preferences, bold text, session ends and sign-in (also from
UI buttons), report context, large textures, and R2's rendering: tone
mapping and HDR light, normal maps, physical and Lambert materials,
environments, four shadow casters with focus, points, anisotropy; system
fonts for the generic families; WebP images). Each
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

3. **`starhermit:draw` — `measureText` leaves out weight and letter
   spacing.** Its options are `size`, `font` and `maxWidth`, while `text`
   draws `weight` (bold faces are wider) and `letterSpacing` (added after
   each character), so bold or spaced text measures narrower than it draws.
   The HUD lays out bold names, the bold spaced score, the bold clock and
   the spaced mouse hint in panels from these widths. Wanted: `weight` and
   `letterSpacing` in `measureText`'s options (as a canvas's `font` and
   `letterSpacing` do for its `measureText`). Meanwhile the port adds the
   spacing itself and the bold excess shows as tighter gaps.

4. **Runtime — periodic game-thread stalls.** Since the R2 runtime
   (bdf60c8, and still at 0f3a320) the full-match probe shows stalls of
   50–100 ms every 1,000–1,500 frames during play, growing over the match
   (21, 53, 58, 84 ms at frames 1,165, 2,174, 3,227, 4,751 in one run).
   Timed with `performance.now()`, they fall after `onRender` returns and
   before its microtasks run (sometimes inside `onRender` while it
   allocates), so they look like collection pauses on a growing heap. The
   port as it was before R2 (5ca82ca) shows the same on that runtime; on
   f15bc40 the slowest frame of each half was 19–25 ms. (Routed to the
   script engine.)
