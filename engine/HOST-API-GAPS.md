# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at aba1f53, which answered
the port's earlier lists: module specifiers and their queries, fuel,
rotation, audio lifetimes, the game socket's envelopes, rooms, instance
attributes, geometry, projection, draw, UI areas and tones, input sources
and bindings, preferences, bold text, session ends and sign-in (also from
UI buttons), report context, large textures). Each entry names the module and member, the semantics wanted, why
football needs it, and what the port does meanwhile. Nothing here is
football-specific.

## Being added by other tracks

The bindings track reports these under way; the port uses the closest
alternative until a contract update lands.

1. **WebP images** (`TextureLoader`, `createImageBitmap`): the crests and
   the loading key art are WebP. Meanwhile stand-in crests drawn in code and
   the key art's plain colour.
2. **Tone mapping and HDR** (`renderer`, colors above 1): the browser renders
   ACES filmic and over-drives the LED boards (1.35), tunnel sign (1.25) and
   lamp glows (1.5–1.7) to feed bloom at threshold 1.3. Meanwhile sRGB with
   colors clamped to 0–1.
3. **Materials**: `MeshPhysicalMaterial` (the ball's clearcoat), `normalMap`
   (the detailed pitch's mow-band relief), `MeshLambertMaterial` (Low's
   cheaper stands, seats and crowd) and `scene.environment` (Reflections).
   Meanwhile standard materials.
4. **More than one shadow-casting light** and `LightShadow.focus` (Ultra's
   floodlit double shadow; the browser fits the frustum to the pitch).
   Meanwhile one caster with `near`/`distance` fitted.
5. **Points** (`Points`, `PointsMaterial` with `size`, `sizeAttenuation`,
   `vertexColors`, draw ranges): camera flashes and floodlight haze.
   Meanwhile sprites sharing one material, a flash's brightness read as its
   size.

## Open

Found by running the port on the runtime (branch `h1b-script-bindings` at
cd98686, release build, the football probe and a full-match probe at
960 × 540, High tier).

6. **Text — the built-in font's coverage and face** (`starhermit:draw`,
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

7. **Scene — per-frame host time of instanced meshes.** The scene graph's
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
