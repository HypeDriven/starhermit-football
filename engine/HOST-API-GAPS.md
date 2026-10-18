# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at bdf60c8, which answered
the port's earlier lists: module specifiers and their queries, fuel,
rotation, audio lifetimes, the game socket's envelopes, rooms, instance
attributes, geometry, projection, draw, UI areas and tones, input sources
and bindings, preferences, bold text, session ends and sign-in (also from
UI buttons), report context, large textures, and R2's rendering: tone
mapping and HDR light, normal maps, physical and Lambert materials,
environments, four shadow casters with focus, points, anisotropy). Each
entry names the module and member, the semantics wanted, why football needs
it, and what the port does meanwhile. Nothing here is football-specific.

## Being added by other tracks

The port uses the closest alternative until a contract update lands.

1. **WebP images** (`TextureLoader`, `createImageBitmap`): the crests and
   the loading key art are WebP. Meanwhile stand-in crests drawn in code and
   the key art's plain colour.

## Not in the contract

2. **Post-processing passes** (`renderer`): the browser's High and Ultra
   presets add GTAO ambient occlusion (`ao`, blend 0.7–0.85) and every preset
   but Low a colour grade (`grade`: a gentle S-curve, 1.12 saturation, a
   cool-shadow/warm-highlight split and a 0.26 vignette, before output);
   its bloom also has a radius (0.45) and renders at the budget's
   `bloomRes`. Wanted: ambient occlusion and a grade (or a small fixed set
   of post effects with these parameters) the game can turn on; bloom's
   radius. Meanwhile neither, and bloom at the host's own radius.
3. **`PMREMGenerator.fromScene`** (no render-to-texture): the browser
   renders its environment from a small scene. The port writes the same
   scene as a latitude-longitude image of linear light
   (`world/environment.ts`) and prefilters that, which matches; noted only
   because a game with a more complex environment scene would need it.

## Open

Found by running the port on the runtime (branch `h1b-script-bindings` at
cd98686, release build, the football probe and a full-match probe at
960 × 540, High tier).

The runtime's next steps answer both (OS fonts for the generic
families; instance buffers).

4. **Text — the built-in font's coverage and face** (`starhermit:draw`,
   `starhermit:ui`, `starhermit:canvas`). Without a package font every
   generic family is the 5 × 7 pixel face, which covers printable ASCII plus
   `· × — …` and the four arrows; any other character draws as a
   missing-glyph box, and the contract does not say so. The browser draws
   its HUD and menus in the system sans-serif (Segoe UI / system-ui, bold)
   and needs, in English alone, `–` (scores, "Shots: 24 – 19"), `’`, `★`
   (the tunnel sign) and `●`; its Spanish, German, French, Portuguese and
   Italian tables and an AI name ("Tomás Rocha") need Latin-1 letters.
   Wanted: a built-in proportional sans-serif face (regular and bold)
   covering at least Latin-1, Latin Extended-A and General Punctuation, the
   coverage stated in the contract, and a way to test it (as
   `document.fonts.check`). Meanwhile displayed text goes through
   `logic/glyphs.ts` (typographic characters to ASCII look-alikes, accents
   dropped) and the tunnel sign's stars are paths; the alternative is a font
   file in the package, which needs a licence decision.

5. **Scene — per-frame host time of instanced meshes.** The scene graph's
   `flatten` (`crates/starhermit-runtime/src/graph.rs`) expands every
   `InstancedMesh` into per-instance objects on the game thread each frame:
   about 19,800 objects for football's crowd and seats. Measured on the
   full-match probe: the game's callbacks take about 2.4 ms a frame
   (`onUpdate` 2.0, `onRender` 0.25, `onFixedUpdate` 0.1, timed with
   `performance.now()`), the probe's game-thread time is 7–10 ms (median),
   so about 4.5–7 ms a frame is the host's, although the game changes one
   eighth of the crowd a frame through one `addUpdateRange`. Wanted:
   instanced meshes carried to the renderer as instance buffers that only
   upload their changed ranges (three.js's model), so a static or partly
   updated crowd costs nothing per frame on the game thread.

6. **Runtime — periodic game-thread stalls on the R2 runtime.** Built from
   bdf60c8, the full-match probe shows stalls of 50–90 ms every 1,000–1,500
   frames during play, growing over the match (21, 53, 58, 84 ms at frames
   1,165, 2,174, 3,227, 4,751). Timed with `performance.now()`, they fall
   after `onRender` returns and before its microtasks run (sometimes inside
   `onRender` while it allocates), so they look like collection pauses on a
   growing heap. The port as it was before R2 (5ca82ca) shows the same on
   this runtime; on f15bc40 the slowest frame of each half was 19–25 ms.
   Medians are 4.2–4.8 ms and p99 5.6–10.7 ms.
