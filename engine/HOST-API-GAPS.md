# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at 180c36c, which answered
the port's earlier lists: module specifiers and their queries, fuel,
rotation, audio lifetimes, the game socket's envelopes, rooms, instance
attributes, geometry, projection, draw, UI areas and tones, input sources
and bindings, preferences, bold text, session ends and sign-in, report
context). Each entry names the module and member, the semantics wanted, why
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

6. **`starhermit:canvas` / textures — Ultra's line texture.** The canvas bound
   (8,388,608 pixels) is below the Ultra preset's 4096-px line markings
   (4096 × 2540 on an 11v11 pitch), and with mipmaps it alone would exceed half
   of the 56 MiB texture budget. The port caps the texture to the bound and to
   half of what the budget has free. Wanted: canvases of 4096 × 4096, or a
   stated per-texture size the budget allows.

7. **`starhermit:platform` — `requestSignIn` from a UI button.** It needs a
   press; `ui.button` says a press's activation counts for
   `clipboard.writeText` and pointer lock, not for `requestSignIn`. The
   menu's SIGN IN WITH STARHERMIT and the session prompt's BACK TO STARHERMIT
   are UI buttons; the port calls it in the button's frame and opens the
   Options menu when it is refused. Wanted: the same rule stated for
   `requestSignIn` (and `requestPermission`).
