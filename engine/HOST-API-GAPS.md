# Host API gaps found by the football port

What the native client (`engine/src`) still needs from host API v1
(`engine/starhermit.d.ts`, copied from the runtime at e4e20eb, which answered
the port's first list) and does not get. Each entry names the module and
member, the semantics wanted, why football needs it, and what the port does
meanwhile. Nothing here is football-specific. **Blocking** entries change
what the port can show or do; the others cost fidelity or performance.

## Blocking

1. **Modules — query strings in relative specifiers.** The browser's modules
   import each other with cache-busting queries (`./settings.js?v=11`), and
   the resolver takes the whole specifier as a file name, so a browser module
   with such imports cannot be imported. Football imports the browser's
   `js/platform-i18n.js` (the localized account strings) dynamically and
   falls back to English when that rejects. Wanted: relative specifiers
   resolve as URLs do, ignoring `?query` and `#fragment` (web semantics).

2. **`starhermit:scene` / `starhermit:canvas` — WebP images.** `TextureLoader`
   and `createImageBitmap` decode PNG only; the game's authored images are
   WebP (`assets/crest-blue.webp`, `crest-red.webp`, the loading key art
   `keyart-night-stadium.webp`). The port draws stand-in crests in code and
   shows the key art's plain colour. Wanted: WebP (lossy and lossless) in the
   engine's decoders.

3. **`starhermit:platform` — why the player signed out, and a sign-in
   request.** `onPlayerChange(null)` gives no reason, and there is no call to
   bring up the runtime's sign-in. The browser shows SESSION EXPIRED only for
   an expired session and its BACK TO STARHERMIT relaunches; the port shows
   the prompt when the game socket stops with `signed-out` and opens the
   Options menu (`openMenu`) for both SIGN IN WITH STARHERMIT and the prompt.
   Wanted: `onPlayerChange(listener(player, reason))` with `"expired" |
   "signed-out" | "refused"`, and `platform.requestSignIn()` (the runtime's
   own prompt).

## Fidelity and performance

4. **`starhermit:scene` — materials the browser's presets use.**
   `MeshPhysicalMaterial` (the ball's clearcoat 0.9), `normalMap` /
   `normalScale` on `MeshStandardMaterial` (the detailed pitch's mow-band
   normal map, whose stripes shift with the view), `MeshLambertMaterial` (the
   Low preset's cheaper stands, seats and crowd) and `scene.environment` with
   `environmentIntensity` (the Reflections category's floodlit environment
   map). The port uses standard materials without them.

5. **`starhermit:scene` — shadows from more than one light, and the frustum
   focus.** One light casts. The Ultra preset adds the opposite tower as a
   second caster (the floodlit double shadow under each player), and the
   browser fits the spot's shadow frustum to the pitch with
   `LightShadow.focus`; the port fits `near`/`distance` only and draws one
   shadow. Wanted: a small number of casting lights (two) and `focus`.

6. **`starhermit:scene` — points.** No `Points` / `PointsMaterial`. Camera
   flashes (up to 300) and floodlight haze (up to 700) are point clouds with
   per-vertex colors in the browser; the port uses sprites sharing one
   material, a flash's brightness read as its size. Wanted: `Points` with
   `size`, `sizeAttenuation`, `vertexColors` and `setDrawRange`, or a
   per-sprite color.

7. **`starhermit:scene` — HDR colors.** `Color` is documented 0–1; the browser
   over-drives the LED boards (1.35), the tunnel sign (1.25) and the lamp
   glows (1.5–1.7) so they read as lit after tone mapping and feed bloom
   (threshold 1.3). Wanted: linear components above 1 kept, as three.js.

8. **`starhermit:scene` — the renderer's tone mapping and post effects.** The
   browser renders ACES filmic and its presets choose ambient occlusion,
   a colour grade with vignette and the anti-aliasing method; only bloom is
   offered (`renderer.bloom`). If these are the runtime's own (Options), say
   which tone mapping it applies; the port leaves them to the runtime.

9. **`starhermit:canvas` / textures — Ultra's line texture.** The canvas bound
   (8,388,608 pixels) is below the Ultra preset's 4096-px line markings
   (4096 × 2540 on an 11v11 pitch), and with mipmaps it alone would exceed half
   of the 56 MiB texture budget. The port caps the texture to the bound and to
   half of what the budget has free. Wanted: canvases of 4096 × 4096, or a
   stated per-texture size the budget allows.

10. **`starhermit:engine` / `starhermit:ui` — the player's motion and device
    language preferences.** The UI follows the reduced-motion setting
    internally but a game cannot read it (the browser stills floodlight
    flicker, camera flashes and haze under `prefers-reduced-motion`), and a
    guest's device language is unavailable (the browser's Automatic falls back
    to `navigator.languages`; the port to en-US). Wanted:
    `frame().reducedMotion` (or `engine.preferences()`) and
    `engine.deviceLanguages()`.

11. **`starhermit:input` — touch button labels.** At most 8 characters; the
    game's Italian TACKLE is "CONTRASTO" (9). The port abbreviates it
    ("CONTRAS."). Wanted: a bound in display width rather than characters, or
    12.

12. **`starhermit:draw` — a bold built-in font.** `weight` picks a `FontFace`
    of the family; the built-in pixel font has none, so the score bar's
    800-weight digits and the 900-weight banners draw regular. Wanted: a bold
    face of the built-in font.

13. **`starhermit:platform` — bug-report context.** `reportBug` takes a title
    and a description; the browser attaches a small non-personal
    `context.json` (language, viewport, pixel ratio, frame-rate cap, audio
    limit). The port appends that context to the description. Wanted:
    `reportBug({ …, context?: JsonValue })`.
