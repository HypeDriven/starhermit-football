// Copied unchanged below this note from the StarHermit runtime 1.18.0
// (`starhermit types .`). Refresh it with each engine re-pin.
// StarHermit host API, version 1: the built-in modules a script game imports
// by name (`import { onUpdate } from "starhermit:engine"`). The runtime
// (`starhermit`) is the only trusted code; a game package is data, and every
// host object it receives is an opaque handle the runtime validates on each
// call.
//
// A game runs natively in the runtime's own interpreter and in browsers in
// the browser's engine (V8). What differs between the two (modules that
// import each other, built-ins only browsers have, local time, limits) is
// listed in spec/script-games.html, "Known differences between the native
// interpreter and V8"; `starhermit check` links the game's modules as
// browsers get them and warns of globals only browsers have.
//
// Conventions for every module:
//
// - Errors. A wrong argument type, a non-finite number where a number is
//   needed, or a handle that was disposed, forged or belongs to another
//   object throws a `TypeError`. Going past a limit (the manifest's
//   `engine.limits.*`, a per-frame bound, a size) throws a `RangeError`.
//   Where a web API is the model, its DOMException cases throw an `Error`
//   whose `name` is the DOMException name (`IndexSizeError`,
//   `SyntaxError`, `InvalidStateError`, `NotSupportedError`,
//   `InvalidAccessError`, `NotAllowedError`), so `e.name` checks port
//   unchanged. Platform calls reject with a `PlatformError`
//   (`starhermit:platform`). Once the runtime has asked the game to stop,
//   every host call throws.
// - Units. World distances are meters, angles radians (except
//   `PerspectiveCamera.fov`, degrees as in three.js), times seconds
//   (platform timestamps are milliseconds since the Unix epoch, as the
//   platform sends them), window coordinates physical pixels from the
//   top-left corner (`frame().scale` converts to logical pixels).
// - Colors (`ColorLike`) are sRGB: a CSS color string (`"#ff8800"`,
//   `"rgb(255 136 0 / 50%)"`, a named color), a `0xRRGGBB` number, or
//   `[r, g, b]` / `[r, g, b, a]` with components 0–1. Scene colors are
//   converted to linear light for lighting, as three.js does.
// - Light intensities keep the engine's convention: a white surface facing
//   a light of color 1 and intensity 1 shows its base color. three.js
//   r155+ divides direct and ambient light by π, so a ported light uses
//   `threeIntensity / Math.PI`.
// - Callbacks. Lifecycle callbacks are registered once at the top level of
//   the entry module; input events arrive at the start of each frame,
//   before `onFixedUpdate`. Asynchronous host work (asset loads, platform
//   calls, permission prompts) resolves promises between frames; waiting on
//   it costs no fuel and never counts as not responding.
// - Resources. A handle's resource (a node, mesh, material, texture,
//   canvas, bitmap, sound, socket, worker…) counts against its budget
//   until `dispose()`, `close()` or `release()`, which free it at once, or
//   until the collector finds the handle unreachable: natively at the end
//   of the call in which that collection ends, which the runtime drives as
//   the game makes scene and canvas resources, so dropped ones are
//   released before their budgets fill; and a creation a budget would
//   refuse first collects and releases what was dropped. In browsers the
//   browser's collector decides when, so dispose what you drop when a
//   budget is tight.
// - Version. `engine.API_VERSION` is this file's major version (the
//   manifest's `engine.api=1`); minor versions only add members.
//
// Tools. The runtime carries this file and the developer commands, so a game
// needs nothing else: `starhermit new DIR` writes a new script game pinned to
// the runtime's engine release, `starhermit types DIR` writes this file as
// `DIR/.starhermit/starhermit.d.ts` (a dot-name, so no package carries it; the
// game's tsconfig.json lists it), `starhermit check DIR` validates the package
// and plays it headless, `starhermit DIR` plays it, `starhermit package
// --native DIR` writes its file index for a folder upload the StarHermit
// client installs and plays natively, and `starhermit package --web DIR --out
// UPLOAD` writes its web upload, its loader pinned to the same release on
// https://wiki.starhermit.com/engine/. `cargo starhermit` has the same
// commands for engine developers.
//
// Modules. Scripts are ECMAScript modules; `import` takes the built-in
// `starhermit:<module>` names and package files by a specifier relative to
// the importing file (`"./logic/pose.ts"`, `"../shared/sim.js"`); there are
// no bare specifiers, package-absolute paths or import maps. A specifier
// that names an existing package file loads it. Otherwise one ending in
// `.js` or `.mjs` loads the `.ts` or `.mts` file of the same stem (the
// TypeScript compiler's convention), and an extensionless one tries `.ts`,
// `.mts`, `.js` and `.mjs` in that order; directories are not resolved to
// an index file. A query string or fragment on a relative specifier
// (`"./settings.js?v=11"`, web cache-busting) is ignored for resolution:
// a module's identity is its resolved path, so `./a.js?v=1` and `./a.js`
// are one module, evaluated once. A specifier that resolves to nothing, or
// outside the package, ends the game on the error screen naming the
// importing file and the specifier. Dynamic `import()` resolves the same way and rejects
// instead. `"moduleResolution": "bundler"` with
// `"allowImportingTsExtensions": true` type-checks every accepted form.
//
// Language. Strict-mode ECMAScript 2022 plus TypeScript syntax (erased).
// Natively the interpreter erases the types; on the web the same eraser
// hands each module to the browser's engine as JavaScript with every line
// where it was (columns too, but on the line of an enum or of a parameter
// property's constructor or class body), and `starhermit check` parses and
// links what it hands over. Supported: annotations and return types
// anywhere (also over several lines before an arrow's `=>`), generics
// (`<T,>(x: T) => x` in arrows), `as`, `as const`, `satisfies`, `!`,
// `x!: T`, optional members, `declare` fields and declarations, `abstract`
// classes and members, overloads, index signatures, interfaces and type
// aliases, `import type`, `export type` and inline `type` specifiers (an
// import used only as a type is left out), `implements`, accessibility and
// `readonly` modifiers, enums and const enums (compiled to objects) and
// parameter properties (fields declared before the class's own and
// assigned as the constructor starts, after `super()`: TypeScript for
// ES2022). Not supported, refused natively and by check: decorators,
// value namespaces (type-only namespaces erase), `import x = require()`
// and `import x = N.y`, auto-accessors, JSX, `<T>x` assertions broken
// across lines after `return`, `throw` or `yield` (use `as`), and line
// breaks in an async arrow's type parameters (`async <T>` and its `(`
// on different lines); none of these would be JavaScript once erased.
// BigInt is included (literals, operators, `BigInt.asIntN`/`asUintN`,
// `BigInt64Array`, `BigUint64Array`, DataView's BigInt accessors, exact
// `toLocaleString` and `Intl.NumberFormat`). A BigInt holds at most
// 1,048,576 bits (2^20, about 315,000 decimal digits; V8 allows more): a
// result past that is a `RangeError` ("Maximum BigInt size exceeded"), and
// large-number work counts against the script's fuel like any other. The
// host API takes no BigInt: numeric and data parameters throw a
// `TypeError` for one (convert with `Number(x)` or `String(x)` first),
// `JSON.stringify` (so storage, saves, workers and platform calls) throws,
// `BigInt64Array`/`BigUint64Array` are not accepted where a typed array of
// numbers is, and `starhermit:world` kernels refuse BigInt (their numbers
// are doubles). Scene property fields convert one as `Number(x)` does, as
// the browser's engine does. `console.log(12n)` prints `12n`.
// Of `Intl` and the locale-aware members, these follow the player's
// language (BCP 47 tags; others fall back to it): `String.prototype.
// localeCompare` and `Intl.Collator` (Unicode root collation with
// `sensitivity` and `numeric`), `String.prototype.normalize`,
// `Number.prototype.toLocaleString` and `Intl.NumberFormat` (`style`
// decimal, percent, currency and unit; `currency` with `currencyDisplay`
// symbol, narrowSymbol, code or name and `currencySign` standard or
// accounting, digits defaulting to the currency's (JPY 0, KWD 3); fraction
// and integer digit options, `useGrouping`; `format`, `formatToParts`),
// `Date.prototype.toLocaleDateString`/`TimeString`/
// `String` and `Intl.DateTimeFormat` (`dateStyle`, `timeStyle`, the
// numeric and short/long field options, `timeZone` "UTC" or the system's),
// `Intl.PluralRules` (`select`) and `Intl.RelativeTimeFormat`. Other `Intl`
// members are absent.
//
// The project's tsconfig should use `"lib": ["ES2022"]` (which declares
// BigInt and the BigInt typed arrays) and `"types": []`:
// the runtime is not a browser and has no DOM. The globals below are the
// only ones beyond ECMAScript.

/** Logging to the runtime's log: the terminal with `--dev` and in
 * `starhermit check` (unless `--quiet`; a check prints at most 1,000
 * lines), the page's console in browsers. Each line shows its level and
 * where the script called the console: `[game] warn src/main.ts:12:5:
 * text`. At most 64 lines a frame of at most 1,024 bytes each are kept:
 * the 64th says the rest were dropped. What a call logged before it threw
 * is kept too. Game text is printed as data: control and bidirectional
 * characters are escaped. */
interface Console {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  debug(...values: unknown[]): void;
}
declare var console: Console;

/** Timers run on the game clock (they pause while the game is suspended)
 * just before `onUpdate`, at most once a frame each; `delay` is in
 * milliseconds as on the web. At most 1,024 timers at once (RangeError). */
declare function setTimeout(callback: () => void, delay?: number): number;
declare function clearTimeout(id: number | undefined): void;
declare function setInterval(callback: () => void, delay?: number): number;
declare function clearInterval(id: number | undefined): void;
declare function queueMicrotask(callback: () => void): void;

/** A monotonic clock: `now()` is milliseconds (fractional, at least
 * microsecond resolution) since the game started, unaffected by changes to
 * the system clock; `Date.now()` stays the wall clock. */
interface Performance {
  now(): number;
  readonly timeOrigin: number;
}
declare var performance: Performance;

/** UTF-8 only, as on the web. */
declare class TextEncoder {
  readonly encoding: "utf-8";
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: "utf-8" | "utf8", options?: { fatal?: boolean; ignoreBOM?: boolean });
  readonly encoding: "utf-8";
  decode(input?: ArrayBuffer | ArrayBufferView): string;
}
/** Base64 as on the web (since API_MINOR 8), the engine's in both
 * runtimes (the browser's own is replaced): `atob` decodes forgiving
 * base64 (ASCII whitespace skipped, padding optional) into a string of
 * U+0000–U+00FF, one character a byte; `btoa` encodes such a string.
 * Anything else throws an Error named `InvalidCharacterError`. Bytes:
 * `Uint8Array.from(atob(text), (c) => c.charCodeAt(0))`. */
declare function atob(data: string): string;
declare function btoa(data: string): string;

// ===========================================================================
declare module "starhermit:engine" {
  import type { AntialiasMode } from "starhermit:scene";

  /** The host API's major version. */
  export const API_VERSION: 1;
  /** The runtime's minor version of the host API (members it added). */
  export const API_MINOR: number;

  /** Removes the callback or listener it was returned for. */
  export type Unsubscribe = () => void;
  /** An sRGB color; see the conventions at the top of this file. */
  export type ColorLike =
    | string
    | number
    | readonly [number, number, number]
    | readonly [number, number, number, number];
  /** A JSON value: what crosses the platform and storage boundaries. */
  export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
  /** The `name` of errors thrown where a web API is the model. */
  export type DOMExceptionName =
    | "IndexSizeError"
    | "SyntaxError"
    | "InvalidStateError"
    | "NotSupportedError"
    | "InvalidAccessError"
    | "NotAllowedError"
    | "NotReadableError"
    | "EncodingError";

  // -- Lifecycle ------------------------------------------------------------
  // Each registers one callback (a second call replaces the first); register
  // them while the entry module evaluates. Every call into the game (a
  // callback, an event, a timer, a promise job) gets the manifest's fuel
  // (`engine.limits.fuel_ms`, 32 ms of the reference machine's instructions
  // by default; `onStart` gets eight times it). A call that spends its fuel
  // is paused, not ended: it continues with fresh fuel on the following
  // frames while the game draws nothing new, and once it has run too long
  // the player sees the not-responding screen, where Wait lets it go on and
  // Stop ends the game. The budgets by phase (browsers have no fuel, and the
  // same not-responding limits):
  //
  //   phase                                fuel                 not responding after
  //   module evaluation (module scope,     60 s in all, by the  9 s, with onStart
  //     the entry and its imports)         clock; cannot pause
  //   onStart and its promise jobs         8 x fuel_ms a slice  9 s (with module scope)
  //   a frame: events, timers,             fuel_ms an entry     3 s for the whole frame
  //     onFixedUpdate, onUpdate,
  //     onRender, promise jobs
  //   onSuspend, onResume                  fuel_ms              3 s
  //   onQuit (after the frame in flight)   fuel_ms              closes after 1 s
  //                                                             (a page going
  //                                                             away: 0.2 s)
  //
  // While the game is busy (`setBusy`) the not-responding screen waits 60 s.
  // Module evaluation that runs 60 s (by the clock, however fast the
  // device), or a call looping inside a built-in's callback (a sort
  // comparator) past a long overdraft, ends the game with an error naming
  // the phase, the time it ran and the limit: "module evaluation of
  // src/main.ts ran past its time budget (it ran 61234 ms; the limit is
  // 60000 ms)". `starhermit check` fails a game that would show the
  // not-responding screen, saying which phase ran how long. Long work
  // should be sliced across frames (`fuelLeft()` says how much of this
  // call's fuel remains) or announced with `setBusy`. Running out of heap
  // (`engine.limits.heap_mib`: 256 MiB, which the manifest may lower, or
  // raise up to 1,024 since API_MINOR 14; natively a device that cannot
  // give a large allocation within it ends the game the same way) or call
  // frames ends the game at once, as an uncaught exception or rejected
  // promise from a callback does, on the runtime's error screen with its
  // message and location. In browsers the
  // heap is the browser's (gigabytes; `heap_mib` is not enforced) and an
  // allocation it refuses throws a catchable RangeError; the game's worker
  // shares that memory with the page, so a game still running when the
  // browser refuses the page memory (one that caught its refusal and holds
  // on) is ended the same way: "the game ran out of script memory".

  /** Once, before the first frame. If it returns a promise, the first frame
   * waits for it while the runtime shows its loading screen; for a loading
   * screen of the game's own, resolve early and keep loading behind state
   * that `onUpdate` draws. */
  export function onStart(callback: () => void | Promise<void>): void;
  /** At the fixed rate (`setFixedRate`), zero or more times a frame (at most
   * five; time beyond that is dropped and counted in `stats()`), with the
   * step in seconds. Simulation belongs here. */
  export function onFixedUpdate(callback: (step: number) => void): void;
  /** Once a frame after the fixed steps, with the seconds since the last
   * frame (0 on the first). Scene changes, `draw` and `ui` calls go here or
   * in `onRender`. */
  export function onUpdate(callback: (delta: number) => void): void;
  /** Once a frame after `onUpdate`, with how far the frame is between the
   * last fixed step and the next (0–1), for interpolating drawn state. */
  export function onRender(callback: (interpolation: number) => void): void;
  /** The window was minimized or hidden (in a browser, the page: another
   * tab, a minimized browser): no frames until `onResume`. It runs after
   * the frame the game was making, and its storage writes persist. */
  export function onSuspend(callback: () => void): void;
  /** Frames resume (after the window or page shows again, before the next
   * frame); the game clock does not catch up the time suspended. */
  export function onResume(callback: () => void): void;
  /** The player quits or the runtime closes (the window; in a browser the
   * page goes away: a closed tab, a reload, a link followed): a last chance
   * to save. It runs once, after the frame the game was making (and after
   * `onSuspend` when the window or page was hidden first), briefly: at most
   * one call's fuel, and nothing waits for its promises (platform calls
   * made here get no answer). What it writes to storage (`storage`,
   * `settings` on the device) persists, and its save (`saves.save`), the
   * account's copy of its settings and its platform calls go out as the
   * runtime closes; sockets' sends and voice do not. Natively the frame
   * and the quit get a second, and their uploads and calls up to three
   * more. A browser runs nothing of a page that goes away, so for a game
   * with the `storage` capability or a signed-in player the page waits
   * 0.2 s; what the frame and the quit have not done by then is lost. In
   * that time the game's worker keeps the storage and the save on the
   * device, and the page sends the save, the settings and the platform
   * calls' writes with `keepalive`: at most 16 requests and 64 KiB of
   * their bodies in all (a larger save uploads in the next session), and
   * a call that reads before it writes, or only reads, does not go out.
   * Safari stops the game's worker before the page hears it is going away,
   * so there `onQuit` does not run then: write what must last as it
   * changes, or in `onSuspend`. A page the browser's back/forward cache
   * gives back loads again: the game starts anew with what it stored. */
  export function onQuit(callback: () => void): void;
  /** The window gained or lost focus (held input was released). */
  export function onFocus(callback: (focused: boolean) => void): Unsubscribe;
  /** The runtime's own interface opened or closed over the game (Options,
   * a permission prompt, an error): while it is open no input reaches the
   * game and `input` reports nothing held. Every `true` is followed by a
   * `false` when it closes; one that opened and closed between two of the
   * game's frames (a not-responding screen over the call the game was in)
   * is not reported, and a restarted game hears only what is open over it. */
  export function onOverlay(callback: (open: boolean) => void): Unsubscribe;

  /** Fixed steps per second, 1–240 (60 until set); RangeError otherwise.
   * A change takes effect from the next frame. */
  export function setFixedRate(hz: number): void;
  export function fixedRate(): number;
  /** The fuel the running call has left, in milliseconds of the reference
   * machine's instructions (0 when spent: the call is then paused at its
   * next check); at module scope, natively, the time module evaluation
   * has left (ms). */
  export function fuelLeft(): number;

  /** Decompresses `data` synchronously (since API_MINOR 8) with the
   * engine's own inflate, the same natively and in browsers (not the
   * browser's `DecompressionStream`, whose format names these are):
   * `"gzip"` (one RFC 1952 member), `"deflate"` (zlib, RFC 1950) or
   * `"deflate-raw"` (RFC 1951). Input is at most 64 MiB and the output at
   * most `maxBytes` (16 MiB by default, an integer up to 128 MiB): past
   * either, or past 65,536 DEFLATE blocks, a RangeError (a small "bomb"
   * stops at its bound). Malformed or truncated data, a bad checksum or
   * another format (or a string) is a TypeError. It costs about one
   * instruction of fuel a byte in and out. Text, exact: `new
   * TextDecoder().decode(decompress(bytes, "gzip"))`. */
  export function decompress(
    data: ArrayBuffer | ArrayBufferView,
    format: "gzip" | "deflate" | "deflate-raw",
    options?: { maxBytes?: number },
  ): Uint8Array;
  /** Compresses `data` synchronously (since API_MINOR 8) with the engine's
   * own deflate in the formats of `decompress`: the same bytes natively
   * and in browsers (not `CompressionStream`), which zlib, Node and the
   * browser's `DecompressionStream` read. A string is compressed as its
   * UTF-8 bytes. At most 16 MiB of input (a RangeError past it); it costs
   * about 6 instructions of fuel a byte (1 MiB is about 60 ms of the
   * reference machine's work, two frames' default fuel), so compress large
   * data across frames. The output is at most the input plus 0.1% and
   * 1 KiB. For text in base64: `btoa(String.fromCharCode(...bytes))` (in
   * slices for large outputs). */
  export function compress(
    data: string | ArrayBuffer | ArrayBufferView,
    format: "gzip" | "deflate" | "deflate-raw",
  ): Uint8Array;

  // -- Frame ----------------------------------------------------------------
  /** The reference's four presets: each graphics level is one of them
   * (quantum and atomic low; molecular and cellular balanced; terrestrial,
   * planetary and stellar high; galactic, cosmic and infinite ultra). */
  export type QualityTier = "low" | "balanced" | "high" | "ultra";
  /** The ten graphics levels (since API_MINOR 14), lowest first, about
   * 1.64 times apart in GPU throughput: quantum is made for a Galaxy S20
   * class phone (about 1.2 TFLOPS, in a mobile browser), infinite for an
   * RTX 5090 class desktop (about 105 TFLOPS). Quantum, molecular,
   * terrestrial and galactic are the Low, Balanced, High and Ultra
   * presets. */
  export type GraphicsLevel =
    | "quantum" | "atomic" | "molecular" | "cellular" | "terrestrial"
    | "planetary" | "stellar" | "galactic" | "cosmic" | "infinite";
  /** The player's Graphics choice (since API_MINOR 14): Auto, the default,
   * or a level. */
  export type GraphicsSetting = "auto" | GraphicsLevel;
  /** The graphics levels, lowest first (since API_MINOR 14). */
  export const levels: readonly GraphicsLevel[];
  /** What a level asks for (since API_MINOR 14; `levelSettings()`). The
   * engine applies the shadow cap and the samples to games declaring
   * `engine.minor=14` or later; the rest are the level's budgets for the
   * game to follow. */
  export interface LevelSettings {
    readonly level: GraphicsLevel;
    /** 0 (quantum) to 9 (infinite). */
    readonly index: number;
    readonly quality: QualityTier;
    /** The FP32 throughput the level is made for (TFLOPS). */
    readonly teraflops: number;
    /** The scene's base scale (above 1 supersamples: 1.25 galactic, 1.5
     * cosmic, 2 infinite), the most device pixels per logical pixel it
     * uses, and the most pixels it renders at (width × height: 1280 × 720
     * at quantum to 7680 × 4320 at infinite). */
    readonly renderScale: number;
    readonly pixelRatioCap: number;
    readonly maxPixels: number;
    /** The level's anti-aliasing, and the samples `antialias: "msaa"`
     * takes (4; 8 from cosmic, lowered to what the device supports). */
    readonly antialias: AntialiasMode;
    readonly msaaSamples: number;
    /** Whether the level draws shadows; the largest map a light's shadow
     * uses (512 at quantum to 4096; the engine holds `shadow.mapSize` to
     * it); cascades a game splitting its view may use; the distance
     * shadows reach relative to the game's own. */
    readonly shadows: boolean;
    readonly shadowMapSize: number;
    readonly shadowCascades: number;
    readonly shadowDistance: number;
    /** Ambient occlusion's resolution and samples, null when off. */
    readonly ao: { readonly resolution: number; readonly samples: number; readonly denoiseSamples: number } | null;
    /** Bloom's resolution, null when off. */
    readonly bloom: { readonly resolution: number } | null;
    readonly grade: boolean;
    /** The largest texture side and anisotropic filtering to load at. */
    readonly maxTextureSize: number;
    readonly anisotropy: number;
    /** Draw distance relative to the game's own, and the LOD bias (above
     * 0 picks coarser models sooner). */
    readonly drawDistance: number;
    readonly lodBias: number;
    /** Live particles and drawn instances to keep within. */
    readonly particles: number;
    readonly instances: number;
    /** The frame rate Auto holds at the level before stepping down (30 at
     * quantum, 60 to galactic, 90 cosmic, 120 infinite; never above the
     * display's or the frame limit). */
    readonly targetFps: number;
  }
  /** A level's settings, the frame's level by default (since API_MINOR
   * 14): the same frozen object each call. A RangeError for a name that
   * is not a level. */
  export function levelSettings(level?: GraphicsLevel): LevelSettings;
  export interface SafeArea {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  }
  export interface FrameInfo {
    /** Frames since the start, from 1. */
    readonly frame: number;
    /** Seconds of game time since the first frame. */
    readonly time: number;
    /** Seconds since the last frame. */
    readonly delta: number;
    /** The window's drawable size in physical pixels: 0 × 0 before the
     * first frame (at module scope and in `onStart`): size layout and
     * cameras in a frame (`onUpdate`, `onRender`). Without a window,
     * `starhermit check` plays its frames at 640 × 360 and
     * `--render-check` at 480 × 270 (960 × 540 with `--script`), both at
     * scale 1. */
    readonly width: number;
    readonly height: number;
    /** Physical pixels per logical pixel. */
    readonly scale: number;
    /** Insets (physical pixels) that system UI or display cutouts cover. */
    readonly safeArea: SafeArea;
    /** The tier of the graphics level in use: the same four values as
     * before the levels. */
    readonly quality: QualityTier;
    /** The graphics level in use (since API_MINOR 14): Auto's (it starts
     * at the level detected for the device, at most stellar, steps down a
     * level on sustained overload and may climb by measured headroom to
     * cosmic, never infinite), or the player's choice held to what the
     * device allows. It may change between frames. */
    readonly level: GraphicsLevel;
    /** The level's index, 0 (quantum) to 9 (infinite) (since API_MINOR
     * 14). */
    readonly levelIndex: number;
    /** The player's Graphics choice (since API_MINOR 14). It may be above
     * `levelCeiling` (settings follow the player across devices): it stays
     * their choice, held to the ceiling here. */
    readonly graphics: GraphicsSetting;
    /** The highest level this device supports (since API_MINOR 14), never
     * below `level`: a device whose largest texture is under 4096 texels
     * stops at molecular (2048-texel textures and 1024 shadow maps), under
     * 2048 at quantum; phones, tablets and devices of at most 4 GiB at
     * cellular. A game drawing its own graphics menu offers the levels
     * above it disabled ("not supported on this device"), as Options ›
     * Graphics does: `levels.indexOf(frame().levelCeiling)` is the last
     * one to enable. */
    readonly levelCeiling: GraphicsLevel;
    readonly focused: boolean;
    /** The runtime's interface is open over the game. */
    readonly overlayOpen: boolean;
    readonly fixedRate: number;
  }
  /** This frame's information (the same object all frame). Before the
   * first frame (module scope, `onStart`) its size is 0 × 0, in a window
   * and in checks alike; `starhermit check` plays at 640 × 360, scale 1. */
  export function frame(): FrameInfo;
  export interface FrameStats {
    /** Fixed steps run this frame. */
    readonly fixedSteps: number;
    /** Fixed steps dropped this frame because the game fell behind. */
    readonly droppedSteps: number;
    /** Drawn objects and sprites in the latest frame the runtime drew,
     * and those left out for invalid data (a missing mesh, non-finite
     * numbers). Frames are pipelined: the game computes a frame while the
     * runtime draws the one before it, so that is the frame before last. */
    readonly drawnObjects: number;
    readonly skippedObjects: number;
    /** Milliseconds the game's thread took for the previous frame (its
     * events, fixed steps, `onUpdate` and `onRender`). */
    readonly gameMs: number;
    /** Milliseconds the runtime took to draw the latest frame it drew
     * (applying its GPU work and drawing it, waits for the GPU included)
     * and to present it (waiting for the display or the GPU): 0 where
     * nothing is drawn or presented. */
    readonly paintMs: number;
    readonly presentMs: number;
    /** The script heap in use now (live data and garbage not yet
     * collected) and the most it may hold, in bytes (since API_MINOR 5).
     * Natively only: in browsers (since API_MINOR 9) both are absent
     * (`undefined`), as the browser's engine reports no heap to the
     * game's worker and its heap limit is the browser's own, not
     * `game.limits.heapMib`; before, they read 0 and the manifest's
     * limit. Test for them (`stats().heapBytes ?? …`) rather than
     * reading a number. */
    readonly heapBytes?: number;
    readonly heapLimitBytes?: number;
  }
  export function stats(): FrameStats;

  // -- The game ---------------------------------------------------------------
  export type Capability = "platform" | "voice" | "clipboard" | "storage";
  /** The manifest's limits after `engine.limits.*` (which only lower them,
   * except `heap_mib`, `image_mib`, `meshes`, `mesh_mib` and
   * `instanced_meshes`). */
  export interface Limits {
    readonly fuelMs: number;
    /** The script heap: 256 unless the manifest's `engine.limits.heap_mib=`
     * lowers it or raises it (since API_MINOR 14), up to 1,024 (MiB).
     * Natively only: browsers hold the game to their own heap. */
    readonly heapMib: number;
    readonly callFrames: number;
    readonly gpuMib: number;
    /** The mesh count (since API_MINOR 14): 1,008 unless the manifest's
     * `engine.limits.meshes=` lowers it or raises it, up to 4,096. */
    readonly meshes: number;
    /** The mesh budget (since API_MINOR 14): 124 unless the manifest's
     * `engine.limits.mesh_mib=` lowers it or raises it, up to 1,536 (MiB);
     * meshes count against it within `gpuMib`. */
    readonly meshMib: number;
    /** The instanced meshes a game holds (since API_MINOR 14): 1,024
     * unless the manifest's `engine.limits.instanced_meshes=` lowers it or
     * raises it, up to 4,096. */
    readonly instancedMeshes: number;
    /** The image budget (since API_MINOR 9): 56 unless the manifest's
     * `engine.limits.image_mib=` lowers it or raises it, up to 512 (MiB);
     * images count against it within `gpuMib`. */
    readonly imageMib: number;
    /** The clip count: 128 unless the manifest's
     * `engine.limits.audio_clips=` lowers it or raises it, up to 1,024
     * (since API_MINOR 18; before, the manifest's default read 1,024 while
     * the mixer held 128). */
    readonly audioClips: number;
    readonly audioMib: number;
    readonly voices: number;
    readonly storageKeyKib: number;
    readonly storageMib: number;
  }
  export interface GameInfo {
    /** The manifest's `name=` (data the game supplied; shown as text). */
    readonly name: string;
    /** The entry module's package path. */
    readonly entry: string;
    /** Running with `--dev`. */
    readonly dev: boolean;
    readonly capabilities: readonly Capability[];
    readonly limits: Limits;
    /** The manifest's actions in declaration order (`control.*`), each
     * with the heading of the group it is in (`engine.group.*`), if any (since API_MINOR 6). */
    readonly actions: readonly {
      readonly name: string;
      readonly label: string;
      readonly group?: string;
    }[];
  }
  export const game: GameInfo;

  /** What the game holds against its budgets now. */
  export interface Usage {
    readonly meshes: number;
    readonly meshBytes: number;
    readonly textures: number;
    readonly textureBytes: number;
    readonly clips: number;
    readonly clipBytes: number;
    readonly sounds: number;
    readonly storageBytes: number;
    readonly storageKeys: number;
    /** The scene (since API_MINOR 10), in it or not; `budgets()` has each
     * limit, and creating past one throws a RangeError, so a game sizes
     * its pools from these instead. Scene nodes of every kind. */
    readonly nodes: number;
    /** Meshes, and points' points (each counts one). */
    readonly objects: number;
    /** InstancedMeshes' capacities together (the instance budget). */
    readonly instances: number;
    readonly instancedMeshes: number;
    readonly sprites: number;
    readonly materials: number;
    /** Custom material and post programs. */
    readonly programs: number;
    /** The lights the latest frame drawn asked for besides ambient light
     * and its first directional light (which always draw): past
     * `budgets().lights` they are left out (`stats().skippedObjects`
     * counts them). */
    readonly lights: number;
    /** Meshes and images made past a frame's upload bound that wait for
     * later frames, and their bytes (since API_MINOR 15). A frame sends
     * the GPU at most 96 MiB of new meshes and image pixels; what a game
     * makes past that (a level built in one frame) waits, in the order it
     * was made, and goes with the following frames as each has room
     * (300 MiB in four or five frames). Until a mesh and the
     * images its material samples are sent, objects drawn with them are
     * left out of the frame and of `renderer.render` passes (nothing else
     * changes: they count against the budgets, raycasts hit them). Both
     * read 0 once everything made so far is on its way; a loading screen
     * waits for that. */
    readonly waitingUploads: number;
    readonly waitingUploadBytes: number;
  }
  /** The budgets: the manifest's limits within the engine's (120
   * textures, 1,024 clips and 64 MiB of clip data in the mixer) less what
   * the runtime keeps for its interface. `meshes` is the mesh count:
   * 1,008, or what `engine.limits.meshes=` sets (at most 4,096, since
   * API_MINOR 14). `meshBytes` is the mesh
   * budget: 124 MiB, or what `engine.limits.mesh_mib=` sets (at most
   * 1,536 MiB, since API_MINOR 14), within `engine.limits.gpu_mib`; a mesh
   * counts 32 bytes a vertex (48 with vertex colors, 64 with the custom
   * attribute) and 4 an index, or 2 below 65,536 vertices (in whole 4
   * bytes; since API_MINOR 14, as the GPU holds them). `textureBytes` is
   * the image
   * budget: 56 MiB, or what `engine.limits.image_mib=` sets (at most
   * 512 MiB, since API_MINOR 9), within `engine.limits.gpu_mib`. The
   * scene's limits (since API_MINOR 10; the same natively and in
   * browsers): 131,072 nodes, 65,536 objects, 262,144 instances, 1,024
   * InstancedMeshes (or what `engine.limits.instanced_meshes=` sets, at
   * most 4,096, since API_MINOR 14), 16,384 sprites, 4,096 materials, 256
   * programs and 16 lights a frame. */
  export interface Budgets {
    readonly meshes: number;
    readonly meshBytes: number;
    readonly textures: number;
    readonly textureBytes: number;
    readonly clips: number;
    readonly clipBytes: number;
    readonly sounds: number;
    readonly storageBytes: number;
    readonly storageKeys: number;
    /** Since API_MINOR 10 (see `Usage`). */
    readonly nodes: number;
    readonly objects: number;
    readonly instances: number;
    readonly instancedMeshes: number;
    readonly sprites: number;
    readonly materials: number;
    readonly programs: number;
    readonly lights: number;
  }
  export function usage(): Usage;
  export function budgets(): Budgets;

  /** Opens the runtime's Options menu (the player can always press F1). */
  export function openMenu(): void;
  /** Ends the game (runs `onQuit`, then the runtime closes). */
  export function quit(): void;
  /** The game is busy with a long piece of work it cannot split across
   * frames (a level generated, a world built), or no longer (null; since
   * API_MINOR 5). While it is busy a call may run up to 60 seconds, not
   * three, before the runtime calls the game not responding, and once a
   * call has run 0.4 s the runtime shows the label (at most 200
   * characters; "Generating the map" shows as "Generating the map…") over
   * the game's last frame. Say so before the work starts and clear it
   * after; it holds across frames until cleared.
   *
   * Since API_MINOR 14 `options.seconds` sets that allowance: 1 to 600
   * seconds (60 by default; other values throw a RangeError), never less
   * than a call's own limit. It holds across calls until changed; a call
   * runs under the largest it was busy with since it began (a larger one
   * counts at once, from the call's start; a smaller one, or null, from
   * the next call). Past it the not-responding screen shows as before,
   * and the player's Wait gives the call as long again. Fuel never
   * ends a busy call first: module evaluation's time and what a call may
   * overdraw inside a native's callback grow with the allowance. Ask for
   * what the slowest device needs (the native interpreter runs heavy
   * numeric loops many times slower than a browser's engine). */
  export function setBusy(label: string | null, options?: BusyOptions): void;
  /** `setBusy`'s options (since API_MINOR 14). */
  export interface BusyOptions {
    /** How long a call may run while busy before the runtime calls the
     * game not responding: 1 to 600 seconds, 60 by default. */
    seconds?: number;
  }

  // -- Package files ----------------------------------------------------------
  /** Read-only access to the game's own package (and, since API_MINOR 9,
   * the files the player picks: `saveAs` and `open`). Paths are package-relative
   * with `/` separators (`"levels/one.json"`, `"./a.txt"`, `"a/../b"` are
   * normalized); absolute paths, backslashes, escapes above the root and
   * names a package may not hold throw a TypeError. A read returns at most
   * 64 MiB (RangeError; a ranged `readBytes` reads part of a larger file).
   * Reads are synchronous: packages are local.
   *
   * Remote files (since API_MINOR 7) are package files the game's own
   * hosts serve: starhermit.txt marks them (`engine.remote.files=models/**`)
   * and names the hosts (`engine.remote.urls=https://…/`; since API_MINOR
   * 8 also `platform`, the StarHermit platform the game is published on,
   * which serves them on the game's own origin), and packaging
   * pins each by size and SHA-256. They are in `exists`, `size` and `list`
   * like any file. The asynchronous loaders (`TextureLoader`, `GLTFLoader`,
   * `loadClip`, `AudioContext.loadBuffer`, `createImageBitmap(path)`) fetch
   * the remote files they load; the synchronous reads take a remote file
   * once this run made it ready (`files.fetch`, or a loader that loaded it)
   * and otherwise throw an Error saying to fetch it first, natively and in
   * browsers alike. A file whose bytes do not match the package's pin is
   * never used. Run from a game's directory, a remote file the directory
   * holds is read from it (development).
   *
   * In browsers the page fetches the package's images, sounds, fonts and
   * video only when the game loads them. The asynchronous loaders never
   * wait for a file (natively they read it off the game's thread); a
   * synchronous read of one the page has not fetched gets it, but the
   * page waits meanwhile and the console warns, naming the file and the
   * API that read it: `files.fetch` it first.
   *
   * Development files are no part of the package, in development as once
   * uploaded: names starting with a dot, by default `node_modules/`,
   * `tsconfig.json`, `jsconfig.json`, `package.json` and the npm, yarn and
   * pnpm lock files, source maps (`*.js.map`, `*.mjs.map`, `*.ts.map`,
   * `*.css.map`), `Thumbs.db` and `desktop.ini`, and what the game's
   * `.starhermitignore` lists (gitignore-style rules; `!name` keeps a
   * default). Such a file does not exist for the game: a read or import of
   * one fails with a `NotFoundError` (a load error for an import) that
   * names the rule, so `starhermit check` catches a static import. One
   * exception, for development config that is never uploaded: a native
   * `--dev` run of a package directory reads the files the game's own
   * `.starhermitignore` leaves out (`exists`, `size`, `status` and
   * the reads see them; not dot-names, not the defaults, not imports) and
   * the console warns once a file: `files: "config/dev.json" is read only
   * in development: not part of the package (…)`. Normal runs, checks and
   * browsers see the package only, as players do, so guard such reads
   * with `files.exists`. On the
   * web a file `starhermit-files.json` does not list is not there either:
   * run `starhermit package` again after adding files. */
  export interface PackageFiles {
    exists(path: string): boolean;
    /** Bytes, or null for a missing file. */
    size(path: string): number | null;
    /** Throws an Error named `NotFoundError` for a missing file, and an
     * Error for a remote file that is not ready.
     *
     * With an `offset` (since API_MINOR 8), `length` bytes from it (to the
     * file's end without a length): only those bytes are read and copied
     * into the script's heap, so a game can keep many parts in one large
     * file (a model set) and read each when it needs it. The range must
     * lie in the file and hold at most 64 MiB (a RangeError otherwise),
     * but the file itself may be larger: a remote file of any size reads
     * this way once ready (`files.fetch`). Natively a package file or a
     * cached remote file is read in place (a compressed ZIP entry is
     * inflated whole first: store large files uncompressed); in a browser
     * a remote file is read as a slice of its cached copy, and a package
     * file comes from what `files.fetch` kept (a file nothing fetched is
     * fetched whole while the page waits, as for a whole read). */
    readBytes(path: string, offset?: number, length?: number): Uint8Array;
    /** `readBytes` without waiting (since API_MINOR 8): the bytes, or the
     * range of them, once read. A remote file is fetched first; in a
     * browser a package file is fetched through the page (with
     * `files.fetch`'s other fetches; what was kept is used) and the range
     * cut from it, natively it is read on a thread of its own. Rejects as
     * `readBytes` throws (a RangeError for a range past the file or over
     * 64 MiB, `NotFoundError`) and with `NetworkError` when the file could
     * not be had; a RangeError with 128 reads already waiting. */
    readBytesAsync(path: string, offset?: number, length?: number): Promise<Uint8Array>;
    /** UTF-8 (a leading BOM is dropped); invalid UTF-8 throws a TypeError. */
    readText(path: string): string;
    /** Parses JSON; invalid JSON throws a SyntaxError. */
    readJson(path: string): JsonValue;
    /** The files directly in a directory (`""` for the root), sorted,
     * remote files among them. */
    list(directory: string): string[];
    /** Where a file is (since API_MINOR 7): `"package"` (in the package),
     * or for a remote file `"ready"` (readable now), `"cached"` (on this
     * device: fetching it downloads nothing), `"fetching"`, `"remote"` (to
     * download) or `"failed"` (its last fetch failed; fetch again to
     * retry); null when there is no such file. */
    status(path: string): FileStatus | null;
    /** Makes files ready (since API_MINOR 7): downloads the remote files
     * among `paths` that are not on this device (checking each against the
     * package's pin and keeping it in the device's cache), takes the cached
     * ones from the cache, and settles once all are ready, with the final
     * progress. `onProgress` hears the progress as it changes, at most once
     * a frame, in bytes to download (cached files count as done once
     * taken); a loading screen draws it. Files the package holds are ready
     * already, except in browsers those the page fetches on demand
     * (images, sounds, fonts, video): it fetches the ones the page has not
     * and keeps them for synchronous reads, counting them as downloads.
     * Rejects with a TypeError for a bad path, `NotFoundError` for
     * a missing file, and `NetworkError` when a file could not be fetched
     * from any of the game's hosts or did not match its pin (the others
     * keep fetching; fetch again to retry); a RangeError with 64 fetches
     * already waiting. */
    fetch(paths: string | readonly string[], onProgress?: (progress: FetchProgress) => void): Promise<FetchProgress>;

    // Files the player picks (since API_MINOR 9): a game's export and
    // import (a save to back up, a level to share). The dialog is the
    // runtime's, never the game's: natively its own file picker, drawn
    // in its interface above the game (which gets no input while it
    // shows), in browsers the browser's download and file chooser. The
    // game never learns a folder or path, only the name and the bytes.
    //
    // A dialog opens only while the game handles one of the player's
    // presses (an action, key, pointer button or touch start, not an
    // auto-repeat; or a `starhermit:ui` widget's activation this frame) or
    // within 5 seconds of it, as a browser's transient activation: so
    // `files.saveAs("photo.png", await renderer.capture())` works in the
    // press's handler. Each press opens one dialog, one dialog is open at
    // a time, and the next opens at least a second after the last closed;
    // otherwise the promise rejects with `NotAllowedError` (no press, or
    // too soon) or `InvalidStateError` (one is open). In a browser a press
    // the page itself did not see (a gamepad's, or after its own
    // activation ran out) makes the page ask the player to choose with a
    // bar of its own.

    /** Saves `data` (a string as UTF-8, an `ArrayBuffer` or a typed array;
     * at most 64 MiB, else a RangeError) to a file the player picks,
     * suggesting `name`: the name they saved under, or null when they
     * cancelled. `name` is a file's name only (at most 128 characters; no
     * `/ \ : * ? " < > |`, controls or invisible characters, no leading
     * dot, no trailing dot or space, no device name such as `CON`, and no
     * extension of a program, script or page: `.exe`, `.bat`, `.sh`,
     * `.js`, `.html`, `.lnk` and the like), else a TypeError. `type` is a
     * media type (`application/json`; default
     * `application/octet-stream`). Natively the picker opens in the
     * folder the player used last (else Downloads), and replacing a file
     * takes a second press; in a browser the bytes are the page's
     * download, which the browser saves (or asks where), so it resolves
     * with `name` once the download starts, whether or not the player
     * then keeps it. A file the runtime could not write rejects with
     * `NotReadableError`. */
    saveAs(name: string, data: string | ArrayBuffer | ArrayBufferView, options?: { type?: string }): Promise<string | null>;
    /** Reads a file the player picks: its name and bytes (at most 64 MiB:
     * the picker refuses larger files, and in a browser the promise rejects
     * with a RangeError), or null when they cancelled. `accept` lists
     * extensions (`".json"`, at most 16; any case), else a TypeError;
     * natively the picker lists only those, a browser's chooser offers them
     * first, so check the bytes: they may be anything. A file the runtime
     * could not read rejects with `NotReadableError`. */
    open(options?: { accept?: readonly string[] }): Promise<{ name: string; bytes: Uint8Array } | null>;
    /** Since API_MINOR 20: reads several files the player picks in one
     * folder (`multiple: true`; natively each press of a file in the
     * runtime's picker selects or deselects it, then Open), or every file
     * of a folder the player picks (`folder: true`; natively the player
     * opens the folder and presses Share this folder, then sees what it
     * holds, how many files and their size, and presses Share; in a
     * browser the browser's own folder chooser, which may ask too). Each
     * is a `SharedFile`, sorted by path; null when they cancelled; an
     * empty array for a folder without files the game accepts. `accept`
     * lists and shares only those types (in a browser's chooser for
     * several files it offers them first, so check the bytes). Hidden
     * files and folders (a leading dot) are left out, a folder is read at
     * most 32 folders deep, and links to folders are not followed. A
     * share holds at most 4,096 files, each at most 64 MiB, and at most
     * half the game's script heap in all (128 MiB at the default
     * `heap_mib` of 256; between 64 MiB and 1 GiB), read whole: natively
     * the picker refuses a larger share, saying why, and in a browser the
     * promise rejects with a RangeError. Taking both options is a
     * TypeError. A file the runtime could not read rejects with
     * `NotReadableError`. */
    open(options: { accept?: readonly string[]; multiple: true }): Promise<readonly SharedFile[] | null>;
    open(options: { accept?: readonly string[]; folder: true }): Promise<readonly SharedFile[] | null>;
    /** Since API_MINOR 20: hears the files and folders the player drops
     * on the game's window from their file manager, a folder with every
     * file in it, as `files.open` with `folder` gives them (the same
     * `SharedFile`s and limits; a dropped file by itself has its name as
     * its path, a dropped folder's files their paths from the folder's
     * name down). Only while a listener is registered does the runtime
     * take drops; then each drop shows the runtime's summary of what it
     * shares (what was dropped, how many files and their size; or why it
     * is refused), and the listeners hear it once the player presses
     * Share, not at all when they cancel. No press is needed, and no
     * other dialog may be open. With `accept`, the runtime takes only
     * those types (others dropped are left out of the summary) and this
     * listener hears only those; a drop holding none shows nothing. The
     * listener runs with the frame's other events; unsubscribing the last
     * listener stops the drops. */
    onDrop(listener: (files: readonly SharedFile[]) => void, options?: { accept?: readonly string[] }): Unsubscribe;
  }
  /** A file the player shared (since API_MINOR 20; `files.open` with
   * `multiple` or `folder`, `files.onDrop`). */
  export interface SharedFile {
    /** The file's name (`e1m1.wad`). */
    readonly name: string;
    /** Its path in what the player shared, `/`-separated: the name for a
     * file shared by itself (picked with others, or dropped), else from
     * the shared folder's name down (`DOOM/base/e1m1.wad`). Never a path
     * on the player's machine. */
    readonly path: string;
    /** Its bytes, read whole. */
    readonly bytes: Uint8Array;
  }
  /** See `PackageFiles.status`. */
  export type FileStatus = "package" | "ready" | "cached" | "fetching" | "remote" | "failed";
  /** A `files.fetch`'s progress: bytes to download (a compressed remote
   * file counts its compressed size) and files, done and in all. */
  export interface FetchProgress {
    readonly loadedBytes: number;
    readonly totalBytes: number;
    readonly loadedFiles: number;
    readonly totalFiles: number;
  }
  export const files: PackageFiles;

  // -- Permissions and the clipboard -----------------------------------------
  /** `microphone` needs the `voice` capability, `clipboard-read` the
   * `clipboard` capability; without it the permission is `unavailable`. */
  export type PermissionKind = "microphone" | "clipboard-read";
  export type PermissionState = "granted" | "denied" | "prompt" | "unavailable";
  export function permission(kind: PermissionKind): PermissionState;
  /** Shows the runtime's prompt (above the game, which gets no input while
   * it shows) unless the player answered before; resolves with the answer.
   * An answer the player chose to remember holds until the package's
   * content changes. Rejects with `NotAllowedError` when `unavailable`. */
  export function requestPermission(kind: PermissionKind): Promise<PermissionState>;
  export interface Clipboard {
    /** Puts text (at most 1 MiB of UTF-8, else `RangeError`) on the
     * system clipboard, replacing what it held: a "copy invite code"
     * button. Only while handling one of the player's presses (an action,
     * key, pointer button or touch start, not an auto-repeat), or during
     * the `onUpdate` and `onRender` of a frame in which a `starhermit:ui`
     * widget was activated by a press; otherwise, or without the
     * `clipboard` capability, throws `NotAllowedError` (where a browser's
     * `navigator.clipboard.writeText` rejects with it). Returns at once;
     * the text reaches the clipboard after the frame (the frame's last
     * write wins): natively on Windows (line breaks as CR LF; it stays
     * after the game quits), X11 and Wayland (the game's window holds it
     * while it runs; on X11 a clipboard manager keeps it after), in
     * browsers through `navigator.clipboard` (a page in a frame needs
     * `allow="clipboard-write"`). A copy the system refuses (another
     * program holding the clipboard for 2 s, or copying since the press)
     * leaves the clipboard as it was, without an error. */
    writeText(text: string): void;
    /** Reads text after the `clipboard-read` permission is granted. */
    readText(): Promise<string>;
  }
  export const clipboard: Clipboard;

  // -- The player's preferences ------------------------------------------------
  /** What the player chose in the runtime's Options menu (or, for what they
   * left on "system", what the device says): nothing else about the device
   * is exposed. */
  export interface Preferences {
    /** Keep motion to a minimum (camera shake, parallax, flashing). */
    readonly reducedMotion: boolean;
    /** The interface language (BCP 47): the player's choice, else the
     * device's (a guest's too), else `"en"`. */
    readonly language: string;
    /** The player's text size multiplier (1 by default). `starhermit:ui`
     * applies it (and the player's interface size, which `ui.preferences()`
     * reports); text drawn with `starhermit:draw` is the game's to size. */
    readonly textScale: number;
    /** High-contrast colors asked for (`starhermit:ui` applies them). */
    readonly highContrast: boolean;
  }
  export function preferences(): Preferences;
  export function onPreferencesChange(listener: (preferences: Preferences) => void): Unsubscribe;
}

// ===========================================================================
declare module "starhermit:input" {
  import type { Unsubscribe } from "starhermit:engine";

  // -- Actions ----------------------------------------------------------------
  // The manifest's `control.<action>=` lines declare actions (at most 128)
  // with default keys; `engine.gamepad.<action>=` adds gamepad controls,
  // and `engine.group.<action>=Heading` (since API_MINOR 6) begins a group of actions (up to the
  // next group) that the Options menu shows under that heading (1 to 64
  // characters). The player rebinds them in the Options menu, so games read
  // actions, not keys, for gameplay. The platform's controls API keeps the
  // first 32 actions' keys with the player's account; the runtime keeps the
  // rest in the player's settings (synchronized as settings are). Up to 8
  // player slots share the keyboard (slot 0) and gamepads.
  //
  // An action's name (`control.<action>=KEYS | Label`) is 1 to 32
  // characters of lower-case ASCII letters, digits and `_` (`jump`,
  // `move_left`, `slot2`; no capitals, `-`, `.` or spaces), unique in the
  // manifest; its label (after `|`, the name when there is none) is 1 to
  // 128 bytes without `|` or control characters. Anything else refuses
  // the package: `starhermit.txt control.Jump: invalid input action
  // 'Jump'`. Games name actions exactly so (`isDown("move_left")`).

  /** Whether an action is held (its value is at least 0.5). An undeclared
   * action throws a TypeError. Nothing is held while the runtime's
   * interface is open. */
  export function isDown(action: string, slot?: number): boolean;
  /** An action's value, 0–1 (analog triggers and sticks give fractions). */
  export function value(action: string, slot?: number): number;
  /** Pressed or released since the last frame. */
  export function wasPressed(action: string, slot?: number): boolean;
  export function wasReleased(action: string, slot?: number): boolean;
  /** What produced an input: keys, a mouse or pen, a gamepad, a finger
   * (on-screen touch controls included). */
  export type InputSource = "keyboard" | "pointer" | "gamepad" | "touch";
  export interface ActionEvent {
    readonly action: string;
    readonly pressed: boolean;
    readonly slot: number;
    readonly source: InputSource;
  }
  /** Each press and release (a press is a user gesture). */
  export function onAction(listener: (event: ActionEvent) => void): Unsubscribe;
  /** The label of an action's first binding of a device (keyboard by
   * default), for on-screen prompts; `""` when it has none. A key whose
   * place in the player's layout prints one character is that character in
   * upper case (`"D"`, `"Z"` on a French layout's `KeyW`, `"1"`, `"Ö"`); any
   * other key, or any key where the layout is unknown (as in render-check
   * and browsers without the Keyboard API's layout map), is its code's name
   * with letters and digits as a US keyboard prints them (`KeyD` `"D"`,
   * `Digit1` `"1"`) and other names spaced into words (`"Space"`,
   * `"Enter"`, `"Arrow Up"`, `"Shift Left"`, `"Numpad 1"`, `"F1"`). The
   * same on every platform and in browsers, and what the Options menu's
   * controls show. A gamepad label is the control's name (`"South"`,
   * `"LeftStickUp"`). Answers from module scope and `onStart` on, in a
   * window, in browsers and in `starhermit check` and render checks alike
   * (before the window's keyboard layout is known, the layout-free label;
   * `onBindingsChange` follows when the layout's differs). Throws a
   * `TypeError` for an action the manifest does not declare. */
  export function bindingLabel(action: string, device?: "keyboard" | "gamepad"): string;
  export interface Binding {
    readonly device: "keyboard" | "mouse" | "gamepad";
    /** The `KeyboardEvent.code`, mouse button or gamepad control name. */
    readonly code: string;
    /** As `bindingLabel` labels it (a key `"D"`, `"Arrow Up"`); a mouse
     * button or gamepad control is its name. */
    readonly label: string;
  }
  /** Every binding of an action, in the player's order. */
  export function bindings(action: string): readonly Binding[];
  /** The player rebound something (in the runtime's Options menu), or the
   * labels changed as the window's keyboard layout became known after the
   * game started. */
  export function onBindingsChange(listener: () => void): Unsubscribe;
  /** Opens the runtime's Options menu at the controls, where the player
   * rebinds (the game cannot rebind by itself). */
  export function requestRebind(action?: string): void;
  /** The pointer the player mostly uses now: `"coarse"` after touch,
   * `"fine"` after a mouse or pen, `"none"` before either (gamepad or
   * keyboard play). Changes as the player switches. Since API_MINOR 20,
   * `"coarse"` from the first frame on a touch-first device (where the
   * touch controls show before any touch, `touchControlsVisible`); games
   * declaring an older minor read `"none"` there until the first touch. */
  export function primaryPointer(): "fine" | "coarse" | "none";
  /** Whether the runtime shows its on-screen touch controls
   * (`setTouchControls`) for the player's input: true from the first frame
   * on a touch-first device, else from the first touch, until keyboard,
   * mouse or gamepad use hides them (the next touch shows them again), as
   * `setTouchControls` describes; the same natively and in browsers. It
   * follows the player, not the set: a game that has set no controls (or
   * an empty set) reads it too, to choose its touch layout and prompts
   * before setting any, and the runtime's interface open over the game
   * does not change it. The frame's value, as `primaryPointer` (since
   * API_MINOR 20's runtime). */
  export function touchControlsVisible(): boolean;
  /** `touchControlsVisible` changed, before the frame that reads the new
   * value (at most once a frame; not called for the value at the start).
   * Since API_MINOR 20's runtime. */
  export function onTouchControlsChange(listener: (visible: boolean) => void): Unsubscribe;

  // -- Keys and text ----------------------------------------------------------
  /** `KeyboardEvent.code` names (`"KeyW"`, `"ArrowLeft"`, `"Space"`). F1 is
   * the runtime's and never reaches the game. In browsers the browser does
   * not act on keys the game has (Ctrl+S, Ctrl+F, zoom, with modifiers too),
   * except the player's ways out: F5, F11, F12, reload, developer tools and
   * the browser's tab and window keys. */
  export type KeyCode = string;
  export function isKeyDown(code: KeyCode): boolean;
  export interface KeyEvent {
    readonly code: KeyCode;
    readonly pressed: boolean;
    /** The system's auto-repeat of a held key (not a user gesture). */
    readonly repeat: boolean;
    /** Keeps the text this key press types from `onText` and the game's UI
     * (as `preventDefault` does on the web): for a key that opens a text
     * field. */
    consume(): void;
  }
  export function onKey(listener: (event: KeyEvent) => void): Unsubscribe;
  /** Typed text (after the keyboard layout and input methods). */
  export function onText(listener: (text: string) => void): Unsubscribe;

  // -- Pointer ----------------------------------------------------------------
  /** Where the pointer is in window pixels, or null (outside the window, or
   * the runtime's interface is open). */
  export function pointer(): { readonly x: number; readonly y: number } | null;
  /** Held buttons as a bit mask with web numbering: bit 0 primary, 1 middle,
   * 2 secondary, 3 back, 4 forward. */
  export function buttons(): number;
  export interface PointerButtonEvent {
    /** 0 primary, 1 middle, 2 secondary, 3 back, 4 forward. */
    readonly button: number;
    readonly pressed: boolean;
    readonly x: number;
    readonly y: number;
  }
  export function onPointerMove(listener: (x: number, y: number) => void): Unsubscribe;
  export function onPointerButton(listener: (event: PointerButtonEvent) => void): Unsubscribe;
  /** Wheel steps (one notch is about 1; positive y scrolls down). */
  export function onWheel(listener: (deltaX: number, deltaY: number) => void): Unsubscribe;
  /** Relative motion in pixels while the pointer is locked. */
  export function onPointerDelta(listener: (dx: number, dy: number) => void): Unsubscribe;
  /** Locks and hides the pointer. Only while handling the player's press,
   * never while the runtime's interface is open (which releases it), at
   * most once a second; otherwise throws `NotAllowedError`. */
  export function requestPointerLock(): void;
  export function exitPointerLock(): void;
  export function pointerLocked(): boolean;
  export function onPointerLockChange(listener: (locked: boolean) => void): Unsubscribe;
  /** The pointer's shapes, by their CSS `cursor` names (since API_MINOR 12). */
  export type CursorName =
    | "default" | "pointer" | "crosshair" | "move" | "grab" | "grabbing" | "text" | "wait" | "progress"
    | "help" | "not-allowed" | "ew-resize" | "ns-resize" | "nesw-resize" | "nwse-resize" | "none";
  /** Shows `name` while the pointer is over the game's window (the canvas
   * in browsers) until changed; `"none"` hides it. Any other value is a
   * TypeError. Only a change reaches the window, so calling it every frame
   * with the same name costs nothing. The runtime's own screens (its
   * Options menu, prompts and dialogs) show the arrow over themselves and
   * give the game's cursor back when they close; pointer lock hides it
   * whatever it is. Where the platform has no such shape it shows the
   * closest it has, else the arrow (Windows shows the link hand for
   * "grab" and "grabbing"). Each game starts with "default" (since
   * API_MINOR 12).
   *
   * Or the game's own image (a `CursorImage`): straight (not
   * premultiplied) sRGB RGBA, rows top first from the top-left, as
   * `getImageData` returns it (so `ctx.getImageData(...)` serves as
   * `image`), at most 64x64, in logical pixels as a CSS `url()` cursor is:
   * natively it is scaled by the window's scale factor by nearest pixels,
   * in browsers the page scales it as CSS pixels. Each platform converts
   * the alpha as it needs. Passing the object last set again is no change
   * (nothing is read or sent, even if its data changed since: pass a new
   * object for new pixels); another object is compared by content, so
   * building the same image each frame sends nothing. The runtime keeps
   * the cursors of the 16 images used last and makes others again when
   * they come back. Where a platform cannot show images (X11 without
   * libXcursor) the image's `fallback` shows. An image's form is a
   * TypeError (`data` not a Uint8Array or Uint8ClampedArray, `hotspot` not
   * two numbers, `fallback` not a cursor name); sides outside 1–64, `data`
   * not `width * height * 4` bytes, or a hotspot that is no whole pixel
   * inside the image are a RangeError. */
  export function setCursor(cursor: CursorName | CursorImage): void;
  /** A game's cursor image (since API_MINOR 12). */
  export interface CursorImage {
    readonly image: {
      readonly width: number;
      readonly height: number;
      /** RGBA, rows top first, `width * height * 4` bytes. */
      readonly data: Uint8Array | Uint8ClampedArray;
    };
    /** The pixel that points, [x, y] from the top-left; default [0, 0]. */
    readonly hotspot?: readonly [number, number];
    /** Shown where images cannot be; default "default". */
    readonly fallback?: CursorName;
  }
  /** The cursor `setCursor` last set: its name, or "image" ("default" at
   * first; since API_MINOR 12). */
  export function cursor(): CursorName | "image";

  // -- Touch ------------------------------------------------------------------
  export type TouchPhase = "start" | "move" | "end" | "cancel";
  export interface TouchEvent {
    readonly id: number;
    readonly phase: TouchPhase;
    readonly x: number;
    readonly y: number;
    /** The first finger down. */
    readonly primary: boolean;
    /** The finger went down on one of the `setTouchControls` controls
     * (for its whole touch, even once a new set or a menu lets go of it):
     * it plays the control, so a drag-to-look or tap handler skips it
     * (since API_MINOR 17). Such fingers are still delivered, for games
     * that track every finger; the game's UI never takes them. */
    readonly control: boolean;
  }
  export function onTouch(listener: (event: TouchEvent) => void): Unsubscribe;
  export type TouchAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** On-screen controls drawn by the runtime and fed into the actions
   * (sized and faded by the player's settings). Offsets and radii are
   * logical pixels from the anchor corner, as `starhermit:ui` lays out:
   * a control draws within a circle of `radius` x the UI's scale (the
   * window's scale factor times the player's interface size, as for
   * `ui.preferences().scale`) x the player's on-screen control size (1 by
   * default, 0.5 to 2), and its offset grows alike. A button and a stick
   * are discs of that radius, a D-pad a cross inside it; fingers reach a
   * control a quarter beyond it. */
  export type TouchControl =
    | {
        readonly kind: "stick" | "dpad";
        readonly up: string;
        readonly down: string;
        readonly left: string;
        readonly right: string;
        readonly anchor: TouchAnchor;
        readonly offset: readonly [number, number];
        readonly radius: number;
      }
    | {
        readonly kind: "button";
        readonly action: string;
        /** At most 16 characters (TypeError). */
        readonly label: string;
        readonly anchor: TouchAnchor;
        readonly offset: readonly [number, number];
        readonly radius: number;
      };
  /** Shows these controls on touch screens (null hides them); at most 16
   * and 16 KiB as JSON (RangeError). Actions they name must be declared
   * (TypeError). They show while the player is on touch: from the start on
   * a touch-first device (a coarse primary pointer and no mouse or pen; in
   * browsers `(pointer: coarse)` or touch points without
   * `(any-pointer: fine)`), and elsewhere from the first touch, until
   * keyboard, mouse or gamepad use hides them (the next touch shows them
   * again). Replacing the set (a menu's controls, then play's) keeps
   * whether they show. A button or D-pad direction tapped down and up
   * between two frames still presses once (`wasPressed`, `onAction` press
   * and release). */
  export function setTouchControls(controls: readonly TouchControl[] | null): void;

  // -- Gamepads ---------------------------------------------------------------
  /** The W3C standard mapping: 17 buttons (0 South/A, 1 East/B, 2 West/X,
   * 3 North/Y, 4–5 shoulders, 6–7 triggers, 8 Select, 9 Start, 10–11 stick
   * presses, 12–15 D-pad up/down/left/right, 16 Home) and 4 axes (left x,
   * left y, right x, right y; −1..1, y down). */
  export interface GamepadState {
    readonly index: number;
    /** The player slot it drives. */
    readonly slot: number;
    readonly connected: boolean;
    readonly mapping: "standard";
    readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
    readonly axes: readonly number[];
  }
  export function gamepads(): readonly GamepadState[];
  /** Rumbles a slot's gamepad (strength 0–1, at most 5,000 ms, RangeError
   * past it), unless the player turned vibration off. */
  export function rumble(strong: number, weak: number, durationMs: number, slot?: number): void;
  /** Vibrates the device itself (a phone), as `navigator.vibrate`, at most
   * 5,000 ms, unless the player turned vibration off; does nothing where
   * the device cannot, and (as browsers' user activation) until the player
   * has pressed something since the game started. */
  export function vibrate(durationMs: number): void;
}

// ===========================================================================
declare module "starhermit:storage" {
  import type { JsonValue, Unsubscribe } from "starhermit:engine";

  // Needs the manifest's `storage` capability: without it every call throws
  // `NotAllowedError`. Storage is the game's own (no other game or package
  // can read it), kept per game, player and environment.

  /** Game-private key/value storage on this device. A write is seen by
   * every read at once and reaches the disk atomically as the frame (or
   * lifecycle call) ends, so a key set many times a frame is written once.
   * Keys are 1–120 bytes of UTF-8 text; a value is at most
   * `engine.limits.storage_key_kib` (1 MiB); the game holds at most
   * `storage_mib` (64 MiB), each key counted in whole 4 KiB blocks, and at
   * most 4,096 keys; and it writes at most 16 MiB at once, refilled at
   * 4 MiB a second (keys counted in whole blocks, rewrites of a key in the
   * same frame free). Past any of these a write throws a RangeError and
   * changes nothing. */
  export interface KeyValueStorage {
    get(key: string): Uint8Array | null;
    getText(key: string): string | null;
    /** Parses what `setJson` wrote; other contents throw a SyntaxError. */
    getJson(key: string): JsonValue | null;
    set(key: string, value: string | Uint8Array | ArrayBuffer): void;
    setJson(key: string, value: JsonValue): void;
    /** Whether the key existed. */
    remove(key: string): boolean;
    keys(): string[];
    usage(): { readonly bytes: number; readonly keys: number; readonly quotaBytes: number; readonly maxKeys: number };
  }
  export const storage: KeyValueStorage;

  /** The game's own settings (difficulty, camera options), kept with the
   * player's engine settings: on this device, and in the player's account
   * when signed in (the platform's per-game settings, as `game.<key>`:
   * keys match `[A-Za-z0-9._:-]{1,128}`, those past 123 characters stay on
   * the device, within the platform's key and byte limits). The account is
   * read once as the session starts; its values arrive through `onChange`
   * for keys the game did not set since, and edits go up 800 ms after the
   * last. Engine settings
   * (audio, graphics, bindings) are the runtime's and not visible here. */
  export interface GameSettings {
    get(key: string): JsonValue | undefined;
    /** Throws a TypeError for an invalid key, RangeError past the limits. */
    set(key: string, value: JsonValue): void;
    delete(key: string): void;
    keys(): string[];
    /** Changes from another device or from the account arriving. */
    onChange(listener: (key: string, value: JsonValue | undefined) => void): Unsubscribe;
    /** Legacy settings (since API_MINOR 8): the account's settings for this
     * game under keys that are neither the game's (`game.`) nor the
     * engine's (`sh.`, `graphics.`), as a build of the game from before
     * the engine (the JS SDK's `setSetting`) wrote them. Their keys as the
     * session's read found them, or null until that read landed (signed
     * out, offline, or the read failed). Read only: the game migrates
     * them and removes them. */
    legacyKeys(): string[] | null;
    /** A legacy setting's value (undefined when absent or not read yet).
     * A `game.`, `sh.` or `graphics.` key, or one outside
     * `[A-Za-z0-9._:-]{1,128}`, throws a TypeError. */
    legacy(key: string): JsonValue | undefined;
    /** Removes a legacy setting from the account (it goes up with the
     * game's edits, 800 ms after the last); whether it was there. Keys as
     * `legacy`. */
    removeLegacy(key: string): boolean;
    /** The legacy settings were read (once a session, after sign-in). */
    onLegacy(listener: () => void): Unsubscribe;
  }
  export const settings: GameSettings;

  /** Where the save is now. */
  export type SaveStatus = "saved-to-account" | "saved-on-device" | "pending" | "unavailable" | "session-only";
  /** `"foreign"` since API_MINOR 8 (see `CloudSave.foreign`). */
  export type SyncState =
    | "signed-out"
    | "loading"
    | "ready"
    | "uploading"
    | "read-blocked"
    | "conflict"
    | "foreign"
    | "error";
  export interface Save {
    /** The game's own schema version (`save(data, { schema })`). */
    readonly schema: number;
    readonly savedAt: number;
    readonly data: JsonValue;
  }
  export type Resolution = "keep-local" | "take-remote" | { readonly merged: JsonValue };
  /** A save in the account's slot that the engine did not write (since
   * API_MINOR 8): a build of the game from before the engine saved it
   * (the JS SDK's `writeSave`, a ZIP archive with one `save.json`), or
   * anything else put there through the platform's API. */
  export interface ForeignSave {
    /** Its text: the archive's `save.json` (or its only file) as the JS
     * SDK's `loadSave` reads it, or else the slot's bytes, as UTF-8; null
     * when that is not UTF-8 text (a file expands to at most 16 MiB). */
    readonly text: string | null;
    /** The slot's bytes, byte for byte as the old build stored them (at
     * most 10 MiB): a build that kept raw gzip there (`text` is then null)
     * reads as `new TextDecoder().decode(decompress(bytes, "gzip"))`. */
    readonly bytes: Uint8Array;
  }
  /** The game's save: one per game and player, kept on the device and, when
   * signed in, synced to the account (the platform's cloud save slot of the
   * game: read once signed in, then uploads conditional on the version they
   * were based on, debounced 2 s, at most every 30 s, queued while offline;
   * a failed read blocks uploads, local play goes on). At most 10 MiB of
   * JSON (RangeError). The previous save is kept as a recovery checkpoint.
   * The account's save replacing the device's (another device saved last)
   * shows in `load()`; `onStatus` hears the change. */
  export interface CloudSave {
    /** The current save, or null when there is none (yet). */
    load(): Save | null;
    /** The save before the current one. */
    previous(): Save | null;
    /** Replaces the save; it is written to the device at once.
     * `replaceForeign` (since API_MINOR 8): this save also replaces the
     * account's foreign save the game was shown (`foreign()`), uploaded at
     * once and only if the slot still holds that version; otherwise (or
     * without one) it is an ordinary save. */
    save(data: JsonValue, options?: { schema?: number; replaceForeign?: boolean }): void;
    /** The account's slot holds a save the engine did not write (since
     * API_MINOR 8): it is never adopted or overwritten by itself. While it
     * is there `state()` is `"foreign"` and `status()` `"pending"`: saves
     * stay on the device and none is uploaded until the game migrates it
     * and saves with `replaceForeign`. Null when there is none, signed
     * out, offline, or until the slot was read (`onStatus` hears
     * `"foreign"` once this has it). If the old build saves again before
     * the replacement lands, the newer one is shown here instead (the
     * replacement stays on the device); if another device replaced it
     * first, `onConflict` hears both engine saves. The slot is read again
     * each session, never kept on the device. */
    foreign(): ForeignSave | null;
    status(): SaveStatus;
    state(): SyncState;
    /** Writes pending changes now (resolves when stored or queued). */
    flush(): Promise<SaveStatus>;
    /** The account holds a different save than this device: resolve it
     * (until then the account's copy is not overwritten). The first
     * listener that answers resolves; `local` is null when this device
     * had none. */
    onConflict(listener: (local: Save, remote: Save) => Resolution | Promise<Resolution>): Unsubscribe;
    onStatus(listener: (status: SaveStatus, state: SyncState) => void): Unsubscribe;
  }
  export const saves: CloudSave;
}

// ===========================================================================
declare module "starhermit:scene" {
  import type { ColorLike } from "starhermit:engine";
  import type { OffscreenCanvas } from "starhermit:canvas";

  // A retained 3D scene in the three.js model: what the game leaves in
  // `scene` draws again every frame. Names, constructor parameters and
  // defaults follow three.js (r16x) for the supported subset, so ports
  // mostly change imports. The math classes are plain script objects; the
  // runtime reads the scene graph once a frame after `onRender`. A game
  // holds at most 131,072 nodes, 65,536 objects (a Mesh counts 1, Points
  // their points), 262,144 instances (InstancedMeshes' capacities
  // together, since API_MINOR 9), 1,024 InstancedMeshes (each is drawn
  // from a GPU instance buffer of its own; `engine.limits.instanced_meshes`
  // raises it up to 4,096 since API_MINOR 14, counted as the scene syncs)
  // and 16,384 sprites, in the scene
  // or not, and 4,096 materials: creating past one throws a RangeError
  // (`engine.usage()` and `engine.budgets()` give each count and limit,
  // since API_MINOR 10). Lights past 16 besides ambient light and the first
  // directional light are left out of the frame (`engine.stats()` counts
  // them with the skipped objects). GPU memory
  // counts against `engine.limits.gpu_mib` within the game's mesh and image
  // budgets (`engine.budgets()`, which `engine.limits.meshes`,
  // `engine.limits.mesh_mib` and `engine.limits.image_mib` set): a geometry
  // past its budget (or the 1,009th mesh, unless raised) throws a
  // RangeError as it uploads (with the scene, or `renderer.render` into a
  // target) naming the key that raises it. A frame sends at most 96 MiB of
  // new meshes and image pixels to the GPU; since API_MINOR 15 what a frame
  // makes past that waits for the next frames instead of throwing a
  // RangeError, its objects left out until it is sent
  // (`engine.usage().waitingUploads`). One mesh larger than 96 MiB is
  // still a RangeError.
  //
  // three.js parity (API_MINOR 20; declare `engine.minor=20` for it): a
  // game declaring 20 or later gets three.js r185's defaults and
  // conventions where older games keep what they drew:
  // - every material writes depth unless `depthWrite` is false, transparent
  //   ones included (the glTF loader sets it false for `BLEND`, as
  //   three.js's GLTFLoader does);
  // - `transparent` alone puts a material in the transparent list: additive,
  //   multiply, subtractive and custom blending without it draw (blended)
  //   with the opaque ones, and `NoBlending` with it draws unblended with
  //   the transparent ones;
  // - the lists sort as three.js's `WebGLRenderList`: opaque by group order
  //   (a `Group`'s `renderOrder` orders everything under it), render
  //   order, material `id`, then nearest first by the projected depth of
  //   the bounds' centre, then object `id`; transparent by group order,
  //   render order, farthest first, then `id`; an InstancedMesh keeps its
  //   instances' order;
  // - the depth test passes on equal depth (three.js's `LessEqualDepth`), so
  //   of two coplanar surfaces the later drawn shows;
  // - cameras project from their own numbers, never the window's: a
  //   PerspectiveCamera from `aspect`, an OrthographicCamera from `left`,
  //   `right`, `top`, `bottom` and `zoom` (so a game sets `aspect`, or the
  //   edges, from `engine.frame()`'s size when the window changes, as a
  //   three.js page does on resize; nothing adjusts them for it);
  // - a Color background is never tone mapped, with post effects and
  //   multisampling too (unless a `renderer.post` program reads the scene);
  // - `scene.environment` lights a standard material by
  //   `scene.environmentIntensity` alone and a Lambert one not at all
  //   (three.js r163+'s WebGLRenderer);
  // - an object hidden by its material's `visible` still draws what is
  //   under it;
  // - `TextureLoader.load(url, onLoad, onProgress, onError)`.
  // Texture coordinates keep the engine's convention at every minor (v
  // from the image's first row, no `flipY`; three.js-built geometries and
  // glTF files map as in three.js).

  // -- Math -------------------------------------------------------------------
  // Since API_MINOR 18 the math classes are three.js r185's (src/math),
  // whole and transcribed so they give its numbers: every method of
  // Vector2, Vector3, Vector4, Quaternion, Euler, Matrix3, Matrix4 and
  // Color, and Box3, Sphere, Plane, Ray, Line3, Triangle, Frustum,
  // Spherical, Cylindrical and MathUtils. Members marked "18" are new
  // there; the classes are iterable as three.js's are (`[...v]`).

  /** An array-like a vector's `toArray` writes into. */
  export type WritableArrayLike = { [index: number]: number };
  /** What `fromBufferAttribute` reads (a BufferAttribute). */
  export interface AttributeReader {
    readonly count: number;
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
    getW(index: number): number;
  }

  /** three.js's MathUtils (since API_MINOR 18). `seededRandom` is
   * deterministic (Mulberry32; a seed restarts it). */
  export const MathUtils: {
    readonly DEG2RAD: number;
    readonly RAD2DEG: number;
    generateUUID(): string;
    clamp(value: number, min: number, max: number): number;
    euclideanModulo(n: number, m: number): number;
    mapLinear(x: number, a1: number, a2: number, b1: number, b2: number): number;
    inverseLerp(x: number, y: number, value: number): number;
    lerp(x: number, y: number, t: number): number;
    /** Frame-rate independent smoothing toward `y` (`lambda` per second). */
    damp(x: number, y: number, lambda: number, dt: number): number;
    pingpong(x: number, length?: number): number;
    smoothstep(x: number, min: number, max: number): number;
    smootherstep(x: number, min: number, max: number): number;
    randInt(low: number, high: number): number;
    randFloat(low: number, high: number): number;
    randFloatSpread(range: number): number;
    seededRandom(seed?: number): number;
    degToRad(degrees: number): number;
    radToDeg(radians: number): number;
    isPowerOfTwo(value: number): boolean;
    ceilPowerOfTwo(value: number): number;
    floorPowerOfTwo(value: number): number;
    setQuaternionFromProperEuler(q: Quaternion, a: number, b: number, c: number, order: "XYX" | "YZY" | "ZXZ" | "XZX" | "YXY" | "ZYZ"): void;
    normalize(value: number, array: Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array): number;
    denormalize(value: number, array: Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array): number;
  };

  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    readonly isVector2: true;
    set(x: number, y: number): this;
    copy(v: Vector2): this;
    clone(): Vector2;
    add(v: Vector2): this;
    sub(v: Vector2): this;
    multiplyScalar(s: number): this;
    length(): number;
    normalize(): this;
    dot(v: Vector2): number;
    lengthSq(): number;
    distanceTo(v: Vector2): number;
    lerp(v: Vector2, alpha: number): this;
    equals(v: Vector2): boolean;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 17.
    fromArray(array: ArrayLike<number>, offset?: number): this;
    addVectors(a: Vector2, b: Vector2): this;
    subVectors(a: Vector2, b: Vector2): this;
    distanceToSquared(v: Vector2): number;
    // Since API_MINOR 18.
    /** `x` and `y` by their size names. */
    width: number;
    height: number;
    setScalar(scalar: number): this;
    setX(x: number): this;
    setY(y: number): this;
    setComponent(index: number, value: number): this;
    getComponent(index: number): number;
    addScalar(s: number): this;
    addScaledVector(v: Vector2, s: number): this;
    subScalar(s: number): this;
    multiply(v: Vector2): this;
    divide(v: Vector2): this;
    divideScalar(scalar: number): this;
    /** As a point (the matrix's translation applies). */
    applyMatrix3(m: Matrix3): this;
    min(v: Vector2): this;
    max(v: Vector2): this;
    clamp(min: Vector2, max: Vector2): this;
    clampScalar(min: number, max: number): this;
    clampLength(min: number, max: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    roundToZero(): this;
    negate(): this;
    /** The 2D cross product (a number). */
    cross(v: Vector2): number;
    manhattanLength(): number;
    /** Its angle from +X, 0 to 2π. */
    angle(): number;
    angleTo(v: Vector2): number;
    manhattanDistanceTo(v: Vector2): number;
    setLength(length: number): this;
    lerpVectors(v1: Vector2, v2: Vector2, alpha: number): this;
    fromBufferAttribute(attribute: AttributeReader, index: number): this;
    rotateAround(center: Vector2, angle: number): this;
    random(): this;
    [Symbol.iterator](): IterableIterator<number>;
  }
  /** Four numbers (since API_MINOR 6): a custom material's `vec4f`
   * uniform, an instance's custom data. */
  export class Vector4 {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
    readonly isVector4: true;
    set(x: number, y: number, z: number, w: number): this;
    setScalar(s: number): this;
    /** A Vector3's w is 1 (three.js). */
    copy(v: Vector4 | Vector3): this;
    clone(): Vector4;
    add(v: Vector4): this;
    multiplyScalar(s: number): this;
    lerp(v: Vector4, alpha: number): this;
    equals(v: Vector4): boolean;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 18.
    /** `z` and `w` by their size names. */
    width: number;
    height: number;
    setX(x: number): this;
    setY(y: number): this;
    setZ(z: number): this;
    setW(w: number): this;
    setComponent(index: number, value: number): this;
    getComponent(index: number): number;
    addScalar(s: number): this;
    addVectors(a: Vector4, b: Vector4): this;
    addScaledVector(v: Vector4, s: number): this;
    sub(v: Vector4): this;
    subScalar(s: number): this;
    subVectors(a: Vector4, b: Vector4): this;
    multiply(v: Vector4): this;
    applyMatrix4(m: Matrix4): this;
    divide(v: Vector4): this;
    divideScalar(scalar: number): this;
    /** x, y, z the axis and w the angle. */
    setAxisAngleFromQuaternion(q: Quaternion): this;
    setAxisAngleFromRotationMatrix(m: Matrix4): this;
    setFromMatrixPosition(m: Matrix4): this;
    min(v: Vector4): this;
    max(v: Vector4): this;
    clamp(min: Vector4, max: Vector4): this;
    clampScalar(min: number, max: number): this;
    clampLength(min: number, max: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    roundToZero(): this;
    negate(): this;
    dot(v: Vector4): number;
    lengthSq(): number;
    length(): number;
    manhattanLength(): number;
    normalize(): this;
    setLength(length: number): this;
    lerpVectors(v1: Vector4, v2: Vector4, alpha: number): this;
    fromBufferAttribute(attribute: AttributeReader, index: number): this;
    random(): this;
    [Symbol.iterator](): IterableIterator<number>;
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    readonly isVector3: true;
    /** Without `z` (since API_MINOR 18) the vector keeps its own, as
     * three.js's does. */
    set(x: number, y: number, z?: number): this;
    setScalar(s: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    add(v: Vector3): this;
    addScaledVector(v: Vector3, s: number): this;
    addVectors(a: Vector3, b: Vector3): this;
    sub(v: Vector3): this;
    subVectors(a: Vector3, b: Vector3): this;
    multiply(v: Vector3): this;
    multiplyScalar(s: number): this;
    divideScalar(s: number): this;
    negate(): this;
    applyQuaternion(q: Quaternion): this;
    applyMatrix4(m: Matrix4): this;
    /** Rotates and scales by a matrix's upper 3×3, then normalizes. */
    transformDirection(m: Matrix4): this;
    setFromMatrixPosition(m: Matrix4): this;
    setFromMatrixColumn(m: Matrix4, index: number): this;
    dot(v: Vector3): number;
    cross(v: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    length(): number;
    lengthSq(): number;
    setLength(length: number): this;
    distanceTo(v: Vector3): number;
    distanceToSquared(v: Vector3): number;
    normalize(): this;
    lerp(v: Vector3, alpha: number): this;
    lerpVectors(a: Vector3, b: Vector3, alpha: number): this;
    equals(v: Vector3): boolean;
    min(v: Vector3): this;
    max(v: Vector3): this;
    /** World point to the camera's normalized device coordinates, as
     * three.js: x and y −1..1 on screen, z −1 (near) to 1 (far); z > 1 is
     * past the far plane or behind the camera. */
    project(camera: Camera): this;
    /** The inverse of `project`. */
    unproject(camera: Camera): this;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 18.
    setX(x: number): this;
    setY(y: number): this;
    setZ(z: number): this;
    setComponent(index: number, value: number): this;
    getComponent(index: number): number;
    addScalar(s: number): this;
    subScalar(s: number): this;
    multiplyVectors(a: Vector3, b: Vector3): this;
    applyEuler(euler: Euler): this;
    applyAxisAngle(axis: Vector3, angle: number): this;
    applyMatrix3(m: Matrix3): this;
    /** By a normal matrix (`Matrix3.getNormalMatrix`), then normalized. */
    applyNormalMatrix(m: Matrix3): this;
    divide(v: Vector3): this;
    clamp(min: Vector3, max: Vector3): this;
    clampScalar(min: number, max: number): this;
    clampLength(min: number, max: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    roundToZero(): this;
    manhattanLength(): number;
    projectOnVector(v: Vector3): this;
    projectOnPlane(planeNormal: Vector3): this;
    /** Reflected off a plane of unit `normal`. */
    reflect(normal: Vector3): this;
    /** The angle between the two, 0 to π (π/2 with a zero vector). */
    angleTo(v: Vector3): number;
    manhattanDistanceTo(v: Vector3): number;
    setFromSpherical(s: Spherical): this;
    setFromSphericalCoords(radius: number, phi: number, theta: number): this;
    setFromCylindrical(c: Cylindrical): this;
    setFromCylindricalCoords(radius: number, theta: number, y: number): this;
    setFromMatrixScale(m: Matrix4): this;
    setFromMatrix3Column(m: Matrix3, index: number): this;
    setFromEuler(e: Euler): this;
    setFromColor(c: Color): this;
    fromBufferAttribute(attribute: AttributeReader, index: number): this;
    /** Each component 0 to 1. */
    random(): this;
    /** A random unit vector. */
    randomDirection(): this;
    [Symbol.iterator](): IterableIterator<number>;
  }
  export type EulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";
  /** Rotation in radians about each axis, applied in `order`. An object's
   * `rotation` and `quaternion` are linked as in three.js: writing either,
   * by a method or a plain field write (`rotation.y = 1`), updates the
   * other at once. */
  export class Euler {
    constructor(x?: number, y?: number, z?: number, order?: EulerOrder);
    static readonly DEFAULT_ORDER: "XYZ";
    x: number;
    y: number;
    z: number;
    order: EulerOrder;
    readonly isEuler: true;
    set(x: number, y: number, z: number, order?: EulerOrder): this;
    copy(e: Euler): this;
    clone(): Euler;
    setFromQuaternion(q: Quaternion, order?: EulerOrder, update?: boolean): this;
    setFromRotationMatrix(m: Matrix4, order?: EulerOrder, update?: boolean): this;
    toArray(array?: unknown[], offset?: number): unknown[];
    // Since API_MINOR 18.
    setFromVector3(v: Vector3, order?: EulerOrder): this;
    /** The same rotation in another order. */
    reorder(newOrder: EulerOrder): this;
    equals(e: Euler): boolean;
    fromArray(array: ArrayLike<unknown>): this;
    [Symbol.iterator](): IterableIterator<number | EulerOrder>;
  }
  export class Quaternion {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
    readonly isQuaternion: true;
    set(x: number, y: number, z: number, w: number): this;
    copy(q: Quaternion): this;
    clone(): Quaternion;
    identity(): this;
    setFromAxisAngle(axis: Vector3, angle: number): this;
    setFromEuler(euler: Euler): this;
    setFromRotationMatrix(m: Matrix4): this;
    setFromUnitVectors(from: Vector3, to: Vector3): this;
    angleTo(q: Quaternion): number;
    dot(q: Quaternion): number;
    length(): number;
    multiply(q: Quaternion): this;
    premultiply(q: Quaternion): this;
    multiplyQuaternions(a: Quaternion, b: Quaternion): this;
    /** three.js r185's slerp (since API_MINOR 18 its numbers). */
    slerp(q: Quaternion, t: number): this;
    invert(): this;
    conjugate(): this;
    normalize(): this;
    equals(q: Quaternion): boolean;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 18.
    static slerpFlat(dst: WritableArrayLike, dstOffset: number, src0: ArrayLike<number>, srcOffset0: number, src1: ArrayLike<number>, srcOffset1: number, t: number): void;
    static multiplyQuaternionsFlat<T extends WritableArrayLike>(dst: T, dstOffset: number, src0: ArrayLike<number>, srcOffset0: number, src1: ArrayLike<number>, srcOffset1: number): T;
    /** Turns toward `q` by at most `step` radians. */
    rotateTowards(q: Quaternion, step: number): this;
    lengthSq(): number;
    slerpQuaternions(qa: Quaternion, qb: Quaternion, t: number): this;
    /** A uniformly random rotation. */
    random(): this;
    fromBufferAttribute(attribute: AttributeReader, index: number): this;
    toJSON(): number[];
    [Symbol.iterator](): IterableIterator<number>;
  }
  /** three.js's coordinate systems for projections and frustums (since
   * API_MINOR 18): depth −1 to 1 (WebGL, the default) or 0 to 1. */
  export const WebGLCoordinateSystem: 2000;
  export const WebGPUCoordinateSystem: 2001;
  /** Column-major 3×3, as three.js (since API_MINOR 18): normal matrices,
   * UV transforms. */
  export class Matrix3 {
    constructor();
    constructor(n11: number, n12: number, n13: number, n21: number, n22: number, n23: number, n31: number, n32: number, n33: number);
    elements: number[];
    readonly isMatrix3: true;
    set(n11: number, n12: number, n13: number, n21: number, n22: number, n23: number, n31: number, n32: number, n33: number): this;
    identity(): this;
    copy(m: Matrix3): this;
    extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
    setFromMatrix4(m: Matrix4): this;
    multiply(m: Matrix3): this;
    premultiply(m: Matrix3): this;
    multiplyMatrices(a: Matrix3, b: Matrix3): this;
    multiplyScalar(s: number): this;
    determinant(): number;
    invert(): this;
    transpose(): this;
    /** The inverse transpose of a matrix's upper 3×3 (for normals). */
    getNormalMatrix(matrix4: Matrix4): this;
    transposeIntoArray(r: WritableArrayLike): this;
    setUvTransform(tx: number, ty: number, sx: number, sy: number, rotation: number, cx: number, cy: number): this;
    /** @deprecated three.js r185: use makeScale. */
    scale(sx: number, sy: number): this;
    /** @deprecated three.js r185: use makeRotation. */
    rotate(theta: number): this;
    /** @deprecated three.js r185: use makeTranslation. */
    translate(tx: number, ty: number): this;
    makeTranslation(v: Vector2): this;
    makeTranslation(x: number, y: number): this;
    makeRotation(theta: number): this;
    makeScale(x: number, y: number): this;
    equals(m: Matrix3): boolean;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    clone(): Matrix3;
  }
  /** Column-major 4×4, as three.js. */
  export class Matrix4 {
    constructor();
    /** Row-major arguments (since API_MINOR 18), as `set`. */
    constructor(
      n11: number, n12: number, n13: number, n14: number,
      n21: number, n22: number, n23: number, n24: number,
      n31: number, n32: number, n33: number, n34: number,
      n41: number, n42: number, n43: number, n44: number,
    );
    elements: number[];
    readonly isMatrix4: true;
    /** Row-major arguments, as three.js. */
    set(
      n11: number, n12: number, n13: number, n14: number,
      n21: number, n22: number, n23: number, n24: number,
      n31: number, n32: number, n33: number, n34: number,
      n41: number, n42: number, n43: number, n44: number,
    ): this;
    identity(): this;
    clone(): Matrix4;
    copy(m: Matrix4): this;
    equals(m: Matrix4): boolean;
    compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    determinant(): number;
    multiply(m: Matrix4): this;
    premultiply(m: Matrix4): this;
    multiplyMatrices(a: Matrix4, b: Matrix4): this;
    makeTranslation(v: Vector3): this;
    makeTranslation(x: number, y: number, z: number): this;
    makeRotationFromEuler(euler: Euler): this;
    makeRotationFromQuaternion(q: Quaternion): this;
    makeScale(x: number, y: number, z: number): this;
    makeRotationX(angle: number): this;
    makeRotationY(angle: number): this;
    makeRotationZ(angle: number): this;
    makeRotationAxis(axis: Vector3, angle: number): this;
    setPosition(v: Vector3): this;
    setPosition(x: number, y: number, z: number): this;
    extractRotation(m: Matrix4): this;
    lookAt(eye: Vector3, target: Vector3, up: Vector3): this;
    invert(): this;
    transpose(): this;
    /** A `far` of Infinity is an infinite far plane (WebGL depth). */
    makePerspective(left: number, right: number, top: number, bottom: number, near: number, far: number, coordinateSystem?: number, reversedDepth?: boolean): this;
    makeOrthographic(left: number, right: number, top: number, bottom: number, near: number, far: number, coordinateSystem?: number, reversedDepth?: boolean): this;
    getMaxScaleOnAxis(): number;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 18.
    copyPosition(m: Matrix4): this;
    setFromMatrix3(m: Matrix3): this;
    extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
    makeBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): this;
    multiplyScalar(s: number): this;
    /** The upper 3×3's determinant. */
    determinantAffine(): number;
    /** Scales its columns by `v`. */
    scale(v: Vector3): this;
    makeShear(xy: number, xz: number, yx: number, yz: number, zx: number, zy: number): this;
  }
  /** An HSL color (`Color.getHSL`'s target; since API_MINOR 18). */
  export interface HSL {
    h: number;
    s: number;
    l: number;
  }
  /** Linear-light RGB, 0–1 (three.js color management): hex numbers and CSS
   * strings given to it are sRGB and converted. Since API_MINOR 18 the
   * methods that take or give a color space (`"srgb"`, `"srgb-linear"`,
   * `""`) take it last, as three.js's. */
  export class Color {
    constructor(color?: ColorLike | Color);
    constructor(r: number, g: number, b: number);
    r: number;
    g: number;
    b: number;
    readonly isColor: true;
    set(color: ColorLike | Color): this;
    setRGB(r: number, g: number, b: number, colorSpace?: string): this;
    setHex(hex: number, colorSpace?: string): this;
    setHSL(h: number, s: number, l: number, colorSpace?: string): this;
    /** Any CSS color the engine reads (names, hex, rgb(), hsl()...). */
    setStyle(style: string, colorSpace?: string): this;
    setScalar(s: number): this;
    getHex(colorSpace?: string): number;
    /** Six hex digits, sRGB. */
    getHexString(colorSpace?: string): string;
    /** `rgb(r,g,b)`, sRGB bytes. */
    getStyle(colorSpace?: string): string;
    copy(c: Color): this;
    clone(): Color;
    lerp(c: Color, alpha: number): this;
    lerpColors(a: Color, b: Color, alpha: number): this;
    multiply(c: Color): this;
    multiplyScalar(s: number): this;
    add(c: Color): this;
    equals(c: Color): boolean;
    toArray<T extends WritableArrayLike = number[]>(array?: T, offset?: number): T;
    // Since API_MINOR 18.
    /** Three numbers (linear), as `setRGB`. */
    set(r: number, g: number, b: number): this;
    setColorName(name: string, colorSpace?: string): this;
    copySRGBToLinear(c: Color): this;
    copyLinearToSRGB(c: Color): this;
    convertSRGBToLinear(): this;
    convertLinearToSRGB(): this;
    /** Hue 0–1, saturation and lightness (of the linear values unless a
     * color space is given). */
    getHSL<T extends HSL>(target: T, colorSpace?: string): T;
    getRGB<T extends { r: number; g: number; b: number }>(target: T, colorSpace?: string): T;
    offsetHSL(h: number, s: number, l: number): this;
    addColors(a: Color, b: Color): this;
    addScalar(s: number): this;
    /** Each channel at least 0. */
    sub(c: Color): this;
    lerpHSL(c: Color, alpha: number): this;
    setFromVector3(v: Vector3): this;
    applyMatrix3(m: Matrix3): this;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    fromBufferAttribute(attribute: AttributeReader, index: number): this;
    toJSON(): number;
    [Symbol.iterator](): IterableIterator<number>;
  }
  export type ColorInput = ColorLike | Color;
  /** Spherical coordinates (since API_MINOR 18): `phi` from +Y, `theta`
   * around Y from +Z. */
  export class Spherical {
    constructor(radius?: number, phi?: number, theta?: number);
    radius: number;
    phi: number;
    theta: number;
    set(radius: number, phi: number, theta: number): this;
    copy(other: Spherical): this;
    /** Keeps `phi` off the poles. */
    makeSafe(): this;
    setFromVector3(v: Vector3): this;
    setFromCartesianCoords(x: number, y: number, z: number): this;
    clone(): Spherical;
  }
  /** Cylindrical coordinates (since API_MINOR 18). */
  export class Cylindrical {
    constructor(radius?: number, theta?: number, y?: number);
    radius: number;
    theta: number;
    y: number;
    set(radius: number, theta: number, y: number): this;
    copy(other: Cylindrical): this;
    setFromVector3(v: Vector3): this;
    setFromCartesianCoords(x: number, y: number, z: number): this;
    clone(): Cylindrical;
  }
  /** An axis-aligned box (since API_MINOR 18); empty while `max` is below
   * `min` (a new one is). */
  export class Box3 {
    constructor(min?: Vector3, max?: Vector3);
    min: Vector3;
    max: Vector3;
    readonly isBox3: true;
    set(min: Vector3, max: Vector3): this;
    setFromArray(array: ArrayLike<number>): this;
    setFromBufferAttribute(attribute: AttributeReader): this;
    setFromPoints(points: readonly Vector3[]): this;
    setFromCenterAndSize(center: Vector3, size: Vector3): this;
    /** The world box around an object and its descendants' geometries:
     * their boxes moved to the world, or with `precise` their vertices. */
    setFromObject(object: Object3D, precise?: boolean): this;
    clone(): Box3;
    copy(box: Box3): this;
    makeEmpty(): this;
    isEmpty(): boolean;
    getCenter(target: Vector3): Vector3;
    getSize(target: Vector3): Vector3;
    expandByPoint(point: Vector3): this;
    expandByVector(vector: Vector3): this;
    expandByScalar(scalar: number): this;
    expandByObject(object: Object3D, precise?: boolean): this;
    containsPoint(point: Vector3): boolean;
    containsBox(box: Box3): boolean;
    getParameter(point: Vector3, target: Vector3): Vector3;
    intersectsBox(box: Box3): boolean;
    intersectsSphere(sphere: Sphere): boolean;
    intersectsPlane(plane: Plane): boolean;
    intersectsTriangle(triangle: Triangle): boolean;
    clampPoint(point: Vector3, target: Vector3): Vector3;
    distanceToPoint(point: Vector3): number;
    getBoundingSphere(target: Sphere): Sphere;
    intersect(box: Box3): this;
    union(box: Box3): this;
    applyMatrix4(matrix: Matrix4): this;
    translate(offset: Vector3): this;
    equals(box: Box3): boolean;
    toJSON(): { min: number[]; max: number[] };
    fromJSON(json: { min: ArrayLike<number>; max: ArrayLike<number> }): this;
  }
  /** A sphere (since API_MINOR 18); empty while its radius is below 0 (a
   * new one's is −1). */
  export class Sphere {
    constructor(center?: Vector3, radius?: number);
    center: Vector3;
    radius: number;
    readonly isSphere: true;
    set(center: Vector3, radius: number): this;
    setFromPoints(points: readonly Vector3[], optionalCenter?: Vector3): this;
    copy(sphere: { center: Vector3; radius: number }): this;
    isEmpty(): boolean;
    makeEmpty(): this;
    containsPoint(point: Vector3): boolean;
    distanceToPoint(point: Vector3): number;
    intersectsSphere(sphere: Sphere): boolean;
    intersectsBox(box: Box3): boolean;
    intersectsPlane(plane: Plane): boolean;
    clampPoint(point: Vector3, target: Vector3): Vector3;
    getBoundingBox(target: Box3): Box3;
    applyMatrix4(matrix: Matrix4): this;
    translate(offset: Vector3): this;
    expandByPoint(point: Vector3): this;
    union(sphere: Sphere): this;
    equals(sphere: Sphere): boolean;
    clone(): Sphere;
    toJSON(): { radius: number; center: number[] };
    fromJSON(json: { radius: number; center: ArrayLike<number> }): this;
  }
  /** The points p where `normal · p + constant` is 0 (since API_MINOR 18). */
  export class Plane {
    constructor(normal?: Vector3, constant?: number);
    normal: Vector3;
    constant: number;
    readonly isPlane: true;
    set(normal: Vector3, constant: number): this;
    setComponents(x: number, y: number, z: number, w: number): this;
    setFromNormalAndCoplanarPoint(normal: Vector3, point: Vector3): this;
    setFromCoplanarPoints(a: Vector3, b: Vector3, c: Vector3): this;
    copy(plane: Plane): this;
    normalize(): this;
    negate(): this;
    /** Signed: positive on the normal's side. */
    distanceToPoint(point: Vector3): number;
    distanceToSphere(sphere: Sphere): number;
    projectPoint(point: Vector3, target: Vector3): Vector3;
    intersectLine(line: Line3, target: Vector3, clampToLine?: boolean): Vector3 | null;
    intersectsLine(line: Line3): boolean;
    intersectsBox(box: Box3): boolean;
    intersectsSphere(sphere: Sphere): boolean;
    coplanarPoint(target: Vector3): Vector3;
    applyMatrix4(matrix: Matrix4, optionalNormalMatrix?: Matrix3): this;
    translate(offset: Vector3): this;
    equals(plane: Plane): boolean;
    clone(): Plane;
  }
  /** A ray from `origin` along `direction` (unit length; since
   * API_MINOR 18): `Raycaster.ray` is one. */
  export class Ray {
    constructor(origin?: Vector3, direction?: Vector3);
    origin: Vector3;
    direction: Vector3;
    set(origin: Vector3, direction: Vector3): this;
    copy(ray: Ray): this;
    at(t: number, target: Vector3): Vector3;
    lookAt(v: Vector3): this;
    recast(t: number): this;
    closestPointToPoint(point: Vector3, target: Vector3): Vector3;
    distanceToPoint(point: Vector3): number;
    distanceSqToPoint(point: Vector3): number;
    distanceSqToSegment(v0: Vector3, v1: Vector3, optionalPointOnRay?: Vector3, optionalPointOnSegment?: Vector3): number;
    intersectSphere(sphere: Sphere, target: Vector3): Vector3 | null;
    intersectsSphere(sphere: Sphere): boolean;
    distanceToPlane(plane: Plane): number | null;
    intersectPlane(plane: Plane, target: Vector3): Vector3 | null;
    intersectsPlane(plane: Plane): boolean;
    intersectBox(box: Box3, target: Vector3): Vector3 | null;
    intersectsBox(box: Box3): boolean;
    intersectTriangle(a: Vector3, b: Vector3, c: Vector3, backfaceCulling: boolean, target: Vector3): Vector3 | null;
    applyMatrix4(matrix: Matrix4): this;
    equals(ray: Ray): boolean;
    clone(): Ray;
  }
  /** A segment (since API_MINOR 18). */
  export class Line3 {
    constructor(start?: Vector3, end?: Vector3);
    start: Vector3;
    end: Vector3;
    set(start: Vector3, end: Vector3): this;
    copy(line: Line3): this;
    getCenter(target: Vector3): Vector3;
    delta(target: Vector3): Vector3;
    distanceSq(): number;
    distance(): number;
    at(t: number, target: Vector3): Vector3;
    closestPointToPointParameter(point: Vector3, clampToLine?: boolean): number;
    closestPointToPoint(point: Vector3, clampToLine: boolean, target: Vector3): Vector3;
    /** The squared distance between the two segments' closest points
     * (written to `c1` and `c2`). */
    distanceSqToLine3(line: Line3, c1?: Vector3, c2?: Vector3): number;
    applyMatrix4(matrix: Matrix4): this;
    equals(line: Line3): boolean;
    clone(): Line3;
  }
  /** A triangle (since API_MINOR 18). */
  export class Triangle {
    constructor(a?: Vector3, b?: Vector3, c?: Vector3);
    a: Vector3;
    b: Vector3;
    c: Vector3;
    static getNormal(a: Vector3, b: Vector3, c: Vector3, target: Vector3): Vector3;
    static getBarycoord(point: Vector3, a: Vector3, b: Vector3, c: Vector3, target: Vector3): Vector3 | null;
    static containsPoint(point: Vector3, a: Vector3, b: Vector3, c: Vector3): boolean;
    static getInterpolation<T extends Vector2 | Vector3 | Vector4>(point: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, v1: T, v2: T, v3: T, target: T): T | null;
    static getInterpolatedAttribute<T extends Vector2 | Vector3 | Vector4>(attribute: AttributeReader, i1: number, i2: number, i3: number, barycoord: Vector3, target: T): T;
    static isFrontFacing(a: Vector3, b: Vector3, c: Vector3, direction: Vector3): boolean;
    set(a: Vector3, b: Vector3, c: Vector3): this;
    setFromPointsAndIndices(points: readonly Vector3[], i0: number, i1: number, i2: number): this;
    setFromAttributeAndIndices(attribute: AttributeReader, i0: number, i1: number, i2: number): this;
    clone(): Triangle;
    copy(triangle: Triangle): this;
    getArea(): number;
    getMidpoint(target: Vector3): Vector3;
    getNormal(target: Vector3): Vector3;
    getPlane(target: Plane): Plane;
    getBarycoord(point: Vector3, target: Vector3): Vector3 | null;
    getInterpolation<T extends Vector2 | Vector3 | Vector4>(point: Vector3, v1: T, v2: T, v3: T, target: T): T | null;
    containsPoint(point: Vector3): boolean;
    isFrontFacing(direction: Vector3): boolean;
    intersectsBox(box: Box3): boolean;
    closestPointToPoint(point: Vector3, target: Vector3): Vector3;
    equals(triangle: Triangle): boolean;
  }
  /** Six planes bounding a view (since API_MINOR 18), for the game's own
   * culling: `setFromProjectionMatrix(new Matrix4().multiplyMatrices(
   * camera.projectionMatrix, camera.matrixWorldInverse))`. */
  export class Frustum {
    constructor(p0?: Plane, p1?: Plane, p2?: Plane, p3?: Plane, p4?: Plane, p5?: Plane);
    planes: Plane[];
    set(p0: Plane, p1: Plane, p2: Plane, p3: Plane, p4: Plane, p5: Plane): this;
    copy(frustum: Frustum): this;
    setFromProjectionMatrix(m: Matrix4, coordinateSystem?: number, reversedDepth?: boolean): this;
    /** By its (or its geometry's) bounding sphere in the world. */
    intersectsObject(object: Object3D): boolean;
    intersectsSprite(sprite: Sprite): boolean;
    intersectsSphere(sphere: Sphere): boolean;
    intersectsBox(box: Box3): boolean;
    containsPoint(point: Vector3): boolean;
    clone(): Frustum;
  }

  // -- Constants (three.js names) ----------------------------------------------
  export type Side = "front" | "back" | "double";
  export const FrontSide: "front";
  export const BackSide: "back";
  export const DoubleSide: "double";
  export type Blending = "none" | "normal" | "additive" | "multiply" | "subtractive" | "custom";
  /** No blending (three.js `NoBlending`; since API_MINOR 20): the
   * fragment replaces what is there, `transparent` or not; with
   * `transparent` it still draws in the transparent list (an alpha test
   * still applies). */
  export const NoBlending: "none";
  export const NormalBlending: "normal";
  export const AdditiveBlending: "additive";
  /** Earlier output's color times the material's, its alpha kept (three.js
   * `MultiplyBlending`; since API_MINOR 7). */
  export const MultiplyBlending: "multiply";
  /** Earlier output's color times one minus the material's, its alpha
   * kept (three.js `SubtractiveBlending`; since API_MINOR 10). */
  export const SubtractiveBlending: "subtractive";
  /** The material's `blendEquation`, `blendSrc` and `blendDst` (and their
   * alpha ones) as three.js's `CustomBlending` (since API_MINOR 10): the
   * fragment's color and alpha straight (not premultiplied), combined
   * with what the target or window holds as `equation(source × src,
   * destination × dst)`. Min and max take no factors. The same on every
   * backend (Vulkan, Direct3D 12, OpenGL ES, WebGL2, WebGPU). Before
   * API_MINOR 20 a custom blended material is drawn with the transparent
   * ones (sorted, no depth written unless `depthWrite` says so); from it,
   * as in three.js, only with `transparent` (otherwise with the opaque
   * ones, writing depth unless `depthWrite` is false). An
   * equation or factor not listed here is a TypeError at the frame's sync. */
  export const CustomBlending: "custom";
  /** Blend equations (three.js's numbers; since API_MINOR 10): `source +
   * destination`, `source − destination`, `destination − source`, the
   * lesser and the greater of the two (per channel; results below 0 are
   * clamped in RGBA8 targets). */
  export const AddEquation: 100;
  export const SubtractEquation: 101;
  export const ReverseSubtractEquation: 102;
  export const MinEquation: 103;
  export const MaxEquation: 104;
  /** Blend factors (three.js's numbers; since API_MINOR 10). Constant
   * colors are not supported. */
  export const ZeroFactor: 200;
  export const OneFactor: 201;
  export const SrcColorFactor: 202;
  export const OneMinusSrcColorFactor: 203;
  export const SrcAlphaFactor: 204;
  export const OneMinusSrcAlphaFactor: 205;
  export const DstAlphaFactor: 206;
  export const OneMinusDstAlphaFactor: 207;
  export const DstColorFactor: 208;
  export const OneMinusDstColorFactor: 209;
  export const SrcAlphaSaturateFactor: 210;
  export type Wrapping = "clamp" | "repeat" | "mirror";
  export const ClampToEdgeWrapping: "clamp";
  export const RepeatWrapping: "repeat";
  export const MirroredRepeatWrapping: "mirror";
  export type MagnificationFilter = "nearest" | "linear";
  export type MinificationFilter =
    | "nearest"
    | "linear"
    | "nearest-mipmap-nearest"
    | "linear-mipmap-nearest"
    | "nearest-mipmap-linear"
    | "linear-mipmap-linear";
  export const NearestFilter: "nearest";
  export const LinearFilter: "linear";
  export const NearestMipmapNearestFilter: "nearest-mipmap-nearest";
  export const LinearMipmapNearestFilter: "linear-mipmap-nearest";
  export const NearestMipmapLinearFilter: "nearest-mipmap-linear";
  export const LinearMipmapLinearFilter: "linear-mipmap-linear";
  /** `renderer.toneMapping` operators (three.js's numbers and formulas;
   * `CustomToneMapping` draws as `NoToneMapping`). */
  export const NoToneMapping: 0;
  export const LinearToneMapping: 1;
  export const ReinhardToneMapping: 2;
  export const CineonToneMapping: 3;
  export const ACESFilmicToneMapping: 4;
  export const CustomToneMapping: 5;
  export const AgXToneMapping: 6;
  export const NeutralToneMapping: 7;
  /** `Texture.mapping` (three.js's numbers). */
  export const UVMapping: 300;
  export const CubeReflectionMapping: 301;
  export const CubeRefractionMapping: 302;
  export const EquirectangularReflectionMapping: 303;
  export const EquirectangularRefractionMapping: 304;
  export const CubeUVReflectionMapping: 306;
  /** `DataTexture` types and format (three.js's numbers). */
  export const UnsignedByteType: 1009;
  export const FloatType: 1015;
  export const HalfFloatType: 1016;
  export const RGBAFormat: 1023;
  /** `RenderTargetOptions.format` of one and two half-float channels
   * (since API_MINOR 10) or, with `UnsignedByteType`, bytes (R8 and RG8;
   * since API_MINOR 11). */
  export const RedFormat: 1028;
  export const RGFormat: 1030;
  /** Color spaces, kept for ports: color maps are read as sRGB, data maps
   * (normal, roughness, metalness, occlusion) as plain values, output is
   * sRGB. */
  export const NoColorSpace: "";
  export const SRGBColorSpace: "srgb";
  export const LinearSRGBColorSpace: "srgb-linear";

  // -- Textures ---------------------------------------------------------------
  /** An RGBA8 image on the GPU (sRGB-encoded), at most 4,096 pixels on a
   * side (RangeError), counted against the game's image budget (56 MiB
   * unless the manifest's `engine.limits.image_mib` sets it, up to 512 MiB
   * since API_MINOR 9; mipmaps add a third): prefer repeating a small
   * image over one large one (see `starhermit:canvas`). UVs follow three.js: (0, 0) is the
   * image's bottom-left. Sampling settings take effect at the next frame. */
  export class Texture {
    #private;
    protected constructor();
    readonly width: number;
    readonly height: number;
    wrapS: Wrapping;
    wrapT: Wrapping;
    magFilter: MagnificationFilter;
    minFilter: MinificationFilter;
    generateMipmaps: boolean;
    /** UV transform, as three.js: `offset`, `repeat`, `rotation` (radians)
     * about `center`. */
    offset: Vector2;
    repeat: Vector2;
    rotation: number;
    center: Vector2;
    /** Anisotropic filtering, 1–16 samples along the slope (three.js;
     * default 1). */
    anisotropy: number;
    /** As an environment (`scene.environment`, `envMap`, `PMREMGenerator`):
     * `EquirectangularReflectionMapping` for latitude-longitude images;
     * any 2D texture is taken as one. */
    mapping: number;
    colorSpace: string;
    /** Set to re-upload a canvas or data texture's pixels this frame (the
     * upload counts against the frame's 96 MiB upload bound, past which it
     * waits for a later frame, since API_MINOR 15); each `true`
     * counts in `version`, and an environment made from the texture is
     * made again. */
    needsUpdate: boolean;
    readonly version: number;
    /** Called with the texture once the runtime took its pixels for the GPU
     * (three.js `onUpdate`; since API_MINOR 10; past a frame's upload
     * bound they reach it in a later frame): a DataTexture's at the first frame
     * that uses it and after each `needsUpdate` upload, a CanvasTexture's
     * after each refresh. `texture.image.data = null` there lets a
     * DataTexture's pixels go. */
    onUpdate: ((texture: Texture) => void) | null;
    /** Releases the GPU image; materials using it draw without it. Using a
     * disposed texture throws a TypeError. */
    dispose(): void;
    name: string;
    userData: Record<string, unknown>;
    /** A texture of the same image with its own settings (three.js; since
     * API_MINOR 18 its offset, repeat, wrapping and filters may differ
     * from this one's, as for a sprite sheet's frames): a CanvasTexture's
     * shows the same canvas, a DataTexture's the same data, a loaded
     * texture's the same package image (loaded again, a frame or so; this
     * one's image until then), each a GPU image of its own. A render
     * target's, a CubeTexture's and a PMREM texture's share the image (a
     * render target's its sampler and UV transform too). Before
     * API_MINOR 18 `clone` returned the texture itself. */
    clone(): Texture;
    /** `source`'s settings: wrapping, filters, offset, repeat, center,
     * rotation, anisotropy, mapping, color space, mipmaps, name, userData
     * by JSON (since API_MINOR 18). */
    copy(source: Texture): this;
  }
  /** A canvas's pixels; set `needsUpdate` after drawing to show changes. */
  export class CanvasTexture extends Texture {
    /** Makes the canvas's image (an empty canvas's once it has a size),
     * counted against the image budget at once: past it the constructor
     * throws a RangeError naming the budget and `engine.limits.image_mib`,
     * which the game may catch, and the game runs on. A canvas grown past
     * the budget since keeps showing its last image, with a warning, when
     * `needsUpdate` asks for the new one. */
    constructor(canvas: OffscreenCanvas);
    readonly canvas: OffscreenCanvas;
  }
  /** Straight-alpha RGBA pixels, rows top to bottom (`width × height × 4`
   * values, else TypeError): bytes (sRGB-encoded) or linear floats
   * (`FloatType`; shown sRGB-encoded and clamped as an image, kept linear
   * and above 1 as an environment). */
  export class DataTexture extends Texture {
    /** The pixels reach the GPU here. */
    constructor(data: Uint8Array | Uint8ClampedArray | Float32Array, width: number, height: number, format?: number, type?: number);
    /** The pixels the game holds, the same as `image.data` (null once
     * released). */
    get data(): Uint8Array | Float32Array;
    set data(value: Uint8Array | Uint8ClampedArray | Float32Array | null);
    readonly type: number;
    /** Since API_MINOR 10 `image.data` (or `data`) may be set (three.js):
     * null releases the pixels from the game's memory once uploaded (a
     * `needsUpdate` still due is uploaded first). The GPU keeps its copy,
     * which draws on, and the runtime keeps the copy it restores a lost
     * GPU device or WebGL context from, so a released texture survives
     * both. A released texture's `needsUpdate = true` throws a TypeError,
     * as does making an environment from it, until new data is set: a
     * typed array as the constructor takes (`width × height × 4` values,
     * else TypeError), uploaded at the next `needsUpdate`. A typical
     * release: `texture.onUpdate = () => { texture.image.data = null; }`,
     * or right after the constructor, which uploads. */
    readonly image: {
      readonly width: number;
      readonly height: number;
      get data(): Uint8Array | Float32Array;
      set data(value: Uint8Array | Uint8ClampedArray | Float32Array | null);
    };
  }
  /** Six images of an environment (three.js `CubeTexture`; faces +X, −X,
   * +Y, −Y, +Z, −Z, squares of one size): package paths or textures. Not
   * an image materials show: `scene.environment`, `envMap` and
   * `PMREMGenerator.fromCubemap` take it. */
  export class CubeTexture extends Texture {
    constructor(images?: readonly (string | Texture)[]);
    readonly images: readonly (string | Texture)[];
  }
  /** Package images as a CubeTexture; the faces decode as the environment
   * is made (`onLoad` is called at once). */
  export class CubeTextureLoader {
    constructor();
    setPath(path: string): this;
    load(urls: readonly string[], onLoad?: (texture: CubeTexture) => void, onProgress?: unknown, onError?: (error: Error) => void): CubeTexture;
    loadAsync(urls: readonly string[]): Promise<CubeTexture>;
  }
  /** Prefiltered environment lighting (three.js `PMREMGenerator`): image-based
   * diffuse and specular light for standard, physical and Lambert
   * materials, from a latitude-longitude texture (a DataTexture of linear
   * floats for light above white, a CanvasTexture or a package image), a
   * CubeTexture or (since API_MINOR 16) a `RoomEnvironment`. It is made off
   * the game's thread and lights the scene a few frames later (see
   * `environmentReady`); a game holds at most 8 (RangeError), each counting
   * about 1.4 MiB against the image budget, and images waiting for their
   * prefilters hold at most 256 MiB together (RangeError; cube faces are
   * squares of at most 2,048; a room counts 8 MiB while it is made). Since
   * API_MINOR 18 it is prefiltered as three.js r16x's PMREM is (its
   * Gaussian blurs for each roughness, the light weighed by solid angle);
   * before, light near the zenith or nadir (a ceiling's lamp, a high sun, a
   * cube's top face) lit rough and mid-rough surfaces up to three times too
   * brightly, which older minors keep. */
  export class PMREMGenerator {
    constructor(renderer?: Renderer);
    fromEquirectangular(texture: Texture): { readonly texture: Texture; readonly width: number; readonly height: number; dispose(): void };
    fromCubemap(cube: CubeTexture): { readonly texture: Texture; readonly width: number; readonly height: number; dispose(): void };
    /** three.js's `fromScene` for a `RoomEnvironment` (since API_MINOR 16;
     * before, it threw a TypeError for any scene):
     * `pmrem.fromScene(new RoomEnvironment(), 0.04).texture` is the room as
     * three.js renders it, seen from `options.position` (the origin by
     * default) less the room's `position`, blurred by `sigma` radians (0
     * or less, or NaN, none; above 0.1, as 0.1, about where three.js
     * truncates its blur). `near`, `far` and `options.size` are ignored.
     * Any other scene throws a TypeError: render a scene into a
     * `RenderTarget` instead (since API_MINOR 8). Natively and in browsers
     * alike. */
    fromScene(
      scene: RoomEnvironment,
      sigma?: number,
      near?: number,
      far?: number,
      options?: { size?: number; position?: Vector3 },
    ): { readonly texture: Texture; readonly width: number; readonly height: number; dispose(): void };
    compileEquirectangularShader(): void;
    compileCubemapShader(): void;
    dispose(): void;
  }
  /** three.js's `RoomEnvironment` (`three/addons/environments/
   * RoomEnvironment.js`; since API_MINOR 16), for
   * `PMREMGenerator.fromScene`: the studio-like room of model-viewer's
   * EnvironmentScene. A white box room (`MeshStandardMaterial`, roughness
   * 1) with six white boxes on its floor, lit by one point light
   * (distance 28, decay 2) and showing six emissive panels (intensities
   * 50, 50, 17, 43, 20 and 100), all at three.js's sizes and places. The
   * runtime makes the room's image itself (traced, shaded as three.js's
   * renderer shades it in `fromScene`'s cube camera, on the prefilter's
   * worker), so this is not an Object3D and holds nothing. The light's
   * intensity is three.js r155–r162's (since API_MINOR 18): 900 for
   * `new RoomEnvironment(renderer)`, 5 for `new RoomEnvironment()` (a
   * near-black room lit by its panels, about a third as bright on what it
   * lights, as three.js r16x games constructed it). A port of three.js
   * r163 or later, where the light is always 900, passes the renderer.
   * Before API_MINOR 18 the light is 900 either way. three.js r18x lowers the room by
   * setting `position.y = -3.5`; here `position` is (0, 0, 0), as in r16x,
   * and only moves the room. */
  export class RoomEnvironment {
    constructor(renderer?: unknown);
    name: string;
    /** Moves the room (its rotation and scale are three.js's, fixed). */
    readonly position: Vector3;
    /** Kept for ports: the room holds nothing. */
    dispose(): void;
  }
  /** Whether an environment value (a PMREM texture, or a texture or cube
   * texture given to `scene.environment` or `envMap`) has finished
   * prefiltering; false while its images decode or it prefilters, and for
   * null. */
  export function environmentReady(value: Texture | null): boolean;
  /** Since API_MINOR 8: `RenderTarget`'s options (three.js's; others are
   * ignored). */
  export interface RenderTargetOptions {
    /** `UnsignedByteType` (default): RGBA8 holding what the window would
     * show (tone mapped, sRGB-encoded). `HalfFloatType` (or `FloatType`,
     * taken as half floats): linear light, not tone mapped, past 1 where it
     * is; where the device cannot render half floats it holds RGBA8 (a
     * warning says so) and, since API_MINOR 10, counts RGBA8's 4 bytes a
     * pixel against the image budget (8 before). Built-in maps read either
     * as sRGB-encoded images;
     * custom materials' programs read the values as they are. */
    type?: number;
    /** The texture's sampling (default clamped and linear). */
    wrapS?: Wrapping;
    wrapT?: Wrapping;
    magFilter?: MagnificationFilter;
    minFilter?: MinificationFilter;
    /** Since API_MINOR 9: a full mip chain of the color (a third more of
     * the image budget), made again from the full-size image after each
     * pass into the target (a downsampling pass on Direct3D 12 and WebGPU,
     * `glGenerateMipmap` on OpenGL ES and WebGL2, blits on Vulkan, Metal's
     * mipmap generation on macOS), which
     * a mipmap `minFilter` samples (the default with it:
     * `"linear-mipmap-linear"`). Default false: before API_MINOR 9 it had
     * to be false, and without it a mipmap filter samples the full-size
     * image. */
    generateMipmaps?: boolean;
    /** Default true. Since API_MINOR 9 false makes a target without a
     * depth buffer (no depth counts against the image budget): its passes
     * draw in order without depth tests, as three.js's (2D work: decals,
     * scars, prints, minimaps of flat shapes). */
    depthBuffer?: boolean;
    /** Since API_MINOR 10, with `HalfFloatType`: `RGFormat` holds two
     * channels (red and green, RG16F: four bytes a pixel, half of RGBA16F's
     * budget) and `RedFormat` one (R16F: two bytes); materials sampling
     * them read blue 0 and alpha 1, and blending writes the channels the
     * target has. Neither takes `generateMipmaps` (TypeError). Since
     * API_MINOR 11, with `UnsignedByteType` (the default type), `RGFormat`
     * is RG8 (two bytes a pixel) and `RedFormat` R8 (one byte): marks and
     * masks (soil and burn in RG8 plus depth in R8 take 3 bytes a pixel
     * where RGBA8 takes 4). They hold what an RGBA8 target holds in those
     * channels (the output as the window would show it, so a value meant
     * as data is written sRGB-decoded, `srgb_to_linear`), clamped to 0–1
     * by every blend equation (additive past 1 stops at 1,
     * reverse subtract below 0 at 0), read with blue 0 (and green 0 for
     * R8) and alpha 1, take no mipmaps, render on every device and so
     * never fall back, counting 2 and 1 bytes a pixel against the image
     * budget from the start (before API_MINOR 11 `UnsignedByteType`
     * with these formats was a TypeError). Where half floats do not
     * render (WebGL2 without `EXT_color_buffer_float` or
     * `EXT_color_buffer_half_float`, OpenGL ES likewise) RG16F and R16F
     * hold RGBA8 with a warning, as RGBA16F targets do,
     * and count its 4 bytes a pixel. Targets made before the game's first
     * frame (the runtime may not know the device yet) count the larger of
     * the two (R16F 4 bytes), and are counted again at the first frame.
     * Other formats hold RGBA, as before. */
    format?: number;
    colorSpace?: string;
  }
  /** Since API_MINOR 8: an image the game draws scenes into (three.js
   * `RenderTarget`/`WebGLRenderTarget`), for build icons rendered once,
   * decals accumulated over time, mirrors and minimaps. `texture` is a
   * `Texture` like any other: a material's `map` (or any built-in map),
   * a custom material's texture uniform, `draw.image` and UI images; its
   * rows are the top of the rendered image first, so a plane's UVs show it
   * the right way up, as in three.js. It starts transparent black and keeps
   * what passes draw into it until they draw over it or the target is
   * resized (cleared again) or disposed; a lost and recovered GPU device
   * clears it too. Width and height are 1 to 4,096 (RangeError); a game
   * holds at most 16 (RangeError), each counting its color and depth
   * (four bytes a pixel each; half-float color eight, RG16F four and R16F
   * two where half floats render, else four) against the
   * image budget (`engine.budgets()`): a target of 4,096 pixels a side
   * takes 128 MiB, so one covering a whole map needs the budget raised
   * (`engine.limits.image_mib=300` in the manifest, since API_MINOR 9). A
   * target past the budget throws a RangeError saying so. Colors are premultiplied by alpha
   * where blending made them partly transparent, as three.js leaves them:
   * show a target with transparent edges with `premultipliedAlpha`
   * materials. The runtime never reads a target back to the game. */
  export class RenderTarget {
    constructor(width?: number, height?: number, options?: RenderTargetOptions);
    readonly isRenderTarget: true;
    readonly texture: Texture;
    readonly width: number;
    readonly height: number;
    /** Whether passes into it depth-test (`RenderTargetOptions`). */
    readonly depthBuffer: boolean;
    /** Where `renderer.render` draws once it is set as the render target
     * (three.js): x, y from the bottom left, width, height, in its pixels;
     * the whole target by default and after `setSize`. */
    readonly viewport: Vector4;
    /** Resizes it (its contents cleared; `texture` stays the same object). */
    setSize(width: number, height: number): void;
    /** Releases its image; `texture` is disposed with it. */
    dispose(): void;
  }
  /** Since API_MINOR 8: three.js's name for `RenderTarget`. */
  export class WebGLRenderTarget extends RenderTarget {
    readonly isWebGLRenderTarget: true;
  }
  /** Loads package images (PNG or WebP; an animated WebP's first frame)
   * through the engine's decoders. Loads requested at once read their
   * files side by side, each holding its file's size of the 64 MiB the
   * engine keeps for files being read; past that they wait for the ones
   * before them rather than fail. */
  export class TextureLoader {
    constructor();
    /** Rejects with a TypeError for a bad path, an Error named
     * `NotFoundError` for a missing file and `EncodingError` for an image it
     * cannot decode; RangeError past the texture budget or with 128 loads
     * already waiting. */
    loadAsync(path: string): Promise<Texture>;
    /** From API_MINOR 20 three.js's `load(url, onLoad, onProgress,
     * onError)` (`onProgress` is never called). Games declaring an older
     * minor pass `onError` third: `load(path, onLoad, onError)`. */
    load(path: string, onLoad?: (texture: Texture) => void, onProgress?: unknown, onError?: (error: Error) => void): Texture;
  }

  /** What `GLTFLoader` gives: the default scene and every scene, as groups
   * of the document's nodes. */
  export interface GLTF {
    scene: Group;
    scenes: Group[];
    /** Always empty (animations are not read). */
    animations: never[];
    /** What the file has that was not applied, each once (extensions,
     * texture transforms, maps on a second UV set, extra attributes,
     * animations and skins, morph targets, images that did not decode),
     * as the console warning names them. */
    ignored: string[];
  }
  /** three.js's GLTFLoader for package `.glb` and `.gltf` files, read off
   * the game's thread (since API_MINOR 5). Each node becomes an `Object3D` with the node's name
   * and transform: a `Mesh` for a mesh of one primitive, otherwise a
   * `Group` holding a `Mesh` per primitive (the mesh's name on each).
   * Materials are `MeshStandardMaterial` or `MeshBasicMaterial` for
   * `KHR_materials_unlit` (base color only), with glTF 2.0's core material
   * as three.js's GLTFLoader maps it: base color factor and `map`;
   * metalness and roughness factors and the metallic-roughness texture as
   * both `roughnessMap` and `metalnessMap`; `normalMap` with
   * `normalScale` (scale, scale) (three.js negates y for glTF's unflipped
   * UVs; the engine's are flipped, so it does not); `aoMap` with
   * `aoMapIntensity` from the occlusion strength; `emissive`,
   * `emissiveMap` and `emissiveIntensity` from `emissiveFactor` and
   * `KHR_materials_emissive_strength`; alpha mode and cutoff;
   * double-sided. Maps use UV set 0 only (the engine has no second UV
   * set): one on `texCoord` 1 is left out. A primitive with
   * `COLOR_0` gets its own copy with `vertexColors` (a four-component
   * `color` attribute). Geometries carry `position`, `normal`, `uv` (in
   * three.js's bottom-left convention) and 32-bit indices; a mesh used by
   * several nodes shares its geometries. Draco-compressed primitives
   * (`KHR_draco_mesh_compression`, as Blender and gltf-transform export
   * them) and quantized attributes (`KHR_mesh_quantization`: 8- and 16-bit
   * positions, normals and texture coordinates) are decoded in-house on
   * the same thread; decoded Draco data counts toward the 128 MiB of
   * binary data a document may hold. External buffers and images are
   * package files beside the document (`uri` relative to it). Textures
   * are made as three.js's GLTFLoader makes them: the glTF sampler's
   * `magFilter`, `minFilter`, `wrapS` and `wrapT` (WebGL's codes as
   * three.js's filter and wrapping constants; without a sampler, or for a
   * filter it leaves unset, repeat wrapping, `LinearFilter` and
   * `LinearMipmapLinearFilter`, with mipmaps for a mipmap minification
   * filter), `SRGBColorSpace` for base color, and the texture's or image's
   * name. glTF's top-left UVs are converted instead of setting three.js's
   * `flipY = false` (the engine's textures have no `flipY`; the result
   * looks the same). External and embedded PNG and WebP images (at most
   * 16 MiB encoded) decode off the game's thread as textures, not
   * canvases, so the canvas bounds do not apply: an image past 4,096
   * pixels on a side, or past what the game's image budget has left
   * (`engine.limits.image_mib`; a 4096 × 4096 image with mipmaps takes
   * 85 MiB of the default 56), is halved until it fits, as three.js and
   * browsers resize a texture past the GPU's largest, with a console
   * warning naming the image and the limit; one past the decoders' bounds
   * (16,384 pixels on a side, 16,777,216 in all) or with no image budget
   * left rejects the load with a RangeError naming the image and the
   * limit. JPEG images are not decoded (the engine decodes PNG and WebP
   * only); one, or an image that fails to decode or is missing, leaves its
   * maps out. `EXT_texture_webp`, required or optional, is read as
   * three.js reads it: the texture's WebP image first, its core `source`
   * when that fails (named in the warning). Not applied: JPEG and other
   * image formats (`KHR_texture_basisu`),
   * `KHR_texture_transform`, UV sets past 0, other material extensions
   * (clearcoat, transmission, sheen, …), cameras, lights, animations,
   * skins and morph targets. The rest of the model loads, and one console
   * warning per model names all that was not applied (also in `ignored`),
   * never silently. A file and its buffers are at most 64 MiB, and the
   * document within the reader's limits (1,048,576 vertices and 3,145,728
   * indices per primitive, 4,096 primitives, 16,384 nodes, 256 images,
   * 128 MiB of decoded buffers).
   * Remote files (the document and its external buffers) are fetched
   * first (since API_MINOR 7, see `files`).
   * Rejects with a TypeError for a bad path, `NotFoundError` for a missing
   * file, `SyntaxError` for a document it cannot read (or a required
   * extension it lacks), and a RangeError with 128 loads already waiting. */
  export class GLTFLoader {
    constructor();
    /** A prefix for the paths given to `load` and `loadAsync`. */
    setPath(path: string): this;
    loadAsync(path: string): Promise<GLTF>;
    load(path: string, onLoad?: (gltf: GLTF) => void, onProgress?: unknown, onError?: (error: Error) => void): void;
  }

  // -- Geometry ----------------------------------------------------------------
  /** Vertex data for meshes. Uploaded on first use; at most 1,048,576
   * vertices and 3,145,728 indices (RangeError); attributes are copied when
   * set. */
  export type AttributeArray = Float32Array | Uint32Array | Uint16Array | Int16Array | Uint8Array | Int8Array;
  export class BufferAttribute {
    /** Integer arrays with `normalized` read as -1..1 (signed:
     * `max(v / 127, -1)`, `max(v / 32767, -1)`) or 0..1 (unsigned: `v /
     * 255`, `v / 65535`), as three.js: compact positions (Int16, scaled by
     * the mesh), normals and colors (Int8, Uint8) stay compact in the
     * game's heap (Int8, Uint8, Int16 and normalized since API_MINOR 7).
     *
     * Before API_MINOR 15 the runtime converts every attribute to floats as
     * it uploads (32 bytes a vertex, 48 with colors, 64 with `custom`).
     * From API_MINOR 15 (`engine.minor=15`) the GPU keeps them as given,
     * each in whole 4 bytes, and the mesh budget counts that:
     * - Float32Array: floats (position and normal 12 bytes, uv 8, color
     *   and custom 16);
     * - normalized Int8Array, Uint8Array, Int16Array, Uint16Array: 8- or
     *   16-bit integers the GPU reads as above, exactly as three.js reads
     *   them: four components (4 or 8 bytes), uv two (4 bytes either way);
     * - positions only, not normalized: Int16Array, Uint16Array,
     *   Int8Array, Uint8Array as the whole numbers they are (8 or 4
     *   bytes), drawn within 0.01 of their value (scale them with the
     *   mesh, as before); hooks read them as given;
     * - anything else (Uint32Array, or integers not normalized outside
     *   positions) as floats, as before.
     * A three-value color's alpha is 1. Iron Curtain's models (Int16
     * positions, normalized Int8 normals and Uint8 colors) take 16 bytes a
     * vertex where floats took 48, 20 with normalized Uint16 UVs; a
     * geometry without `uv` stores none (it reads (0, 0), as before). */
    constructor(array: AttributeArray, itemSize: number, normalized?: boolean);
    /** The values. Setting null releases them (three.js's pattern, in
     * `onUpload`): the GPU keeps its copy, which draws on, `count` stays,
     * and reading or writing the values, or uploading the geometry again,
     * is a TypeError (change it with a new BufferAttribute). Setting an
     * array of the same type and length replaces them. Since API_MINOR 7. */
    get array(): AttributeArray;
    set array(value: AttributeArray | null);
    readonly itemSize: number;
    readonly normalized: boolean;
    readonly count: number;
    /** Called, with the attribute as `this`, once its values reached the GPU
     * (three.js `onUpload`; since API_MINOR 7): `attribute.onUpload(function
     * () { this.array = null; })` lets them go from the game's heap. Compute
     * bounding volumes first (`computeBoundingSphere`); picking keeps
     * working from the runtime's own copy. */
    onUpload(callback: (this: BufferAttribute) => void): this;
    /** Set after changing `array` to re-upload the geometry (or, for an
     * instanced mesh's `instanceMatrix` and `instanceColor`, the instances,
     * in one host call). */
    needsUpdate: boolean;
    /** Limits the next upload to `count` items from `offset` (three.js's
     * `updateRange`/`addUpdateRange`). */
    addUpdateRange(offset: number, count: number): void;
    clearUpdateRanges(): void;
    /** Item `index`'s components (normalized values as numbers, written
     * back as the array's integers), as three.js. */
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
    getW(index: number): number;
    setX(index: number, x: number): this;
    setY(index: number, y: number): this;
    setZ(index: number, z: number): this;
    setXY(index: number, x: number, y: number): this;
    setXYZ(index: number, x: number, y: number, z: number): this;
    setXYZW(index: number, x: number, y: number, z: number, w: number): this;
    /** A copy with its own values. */
    clone(): BufferAttribute;
    // Since API_MINOR 18.
    setW(index: number, w: number): this;
    getComponent(index: number, component: number): number;
    setComponent(index: number, component: number, value: number): this;
    /** Item `index2` of `attribute` into item `index1` (raw values). */
    copyAt(index1: number, attribute: BufferAttribute, index2: number): this;
    /** Raw values from an array (it must fit). */
    copyArray(array: ArrayLike<number>): this;
    /** Raw values from an array at `offset` (it must fit). */
    set(value: ArrayLike<number>, offset?: number): this;
    /** A copy of `source`'s values, item size, normalization, name and
     * usage (its count becomes `source`'s). */
    copy(source: BufferAttribute): this;
    /** Each item (two or three components) times the matrix. */
    applyMatrix3(m: Matrix3): this;
    /** Each item a point times the matrix. */
    applyMatrix4(m: Matrix4): this;
    /** Each item a normal times a normal matrix, normalized. */
    applyNormalMatrix(m: Matrix3): this;
    /** Each item a direction turned by the matrix, normalized. */
    transformDirection(m: Matrix4): this;
    name: string;
    /** three.js's usage hint (`StaticDrawUsage`, `DynamicDrawUsage`):
     * kept, the engine uploads what changed either way. */
    usage: number;
    setUsage(usage: number): this;
    toJSON(): { itemSize: number; type: string; array: number[]; normalized: boolean };
    dispose(): void;
  }
  export const StaticDrawUsage: 35044;
  export const DynamicDrawUsage: 35048;
  export const StreamDrawUsage: 35040;
  export class Float32BufferAttribute extends BufferAttribute {
    /** An array of numbers, or (since API_MINOR 18) a length, and
     * `normalized`. */
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  // three.js's other typed attributes (since API_MINOR 18): an array of
  // numbers or a length made into the type's array.
  export class Int8BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  export class Uint8BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  export class Int16BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  export class Uint16BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  export class Uint32BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number> | number, itemSize: number, normalized?: boolean);
  }
  export type AttributeName = "position" | "normal" | "uv" | "color" | "custom" | "tangent";
  export class BufferGeometry {
    constructor();
    /** three.js's: `"BufferGeometry"`, or the built geometry's class name
     * (since API_MINOR 20; before, only the shapes of API_MINOR 17 and
     * later had one). */
    readonly type: string;
    /** `position` (3), `normal` (3), `uv` (2), `color` (3 or 4, linear;
     * any finite values: shading clamps color to 0–65504 and alpha to 0–1,
     * custom materials read them as they are)
     * and `custom` (1 to 4 numbers a vertex, zeros after them; read only by
     * custom materials as `Vertex.custom`, since API_MINOR 6); `tangent`
     * (4, what `computeTangents` makes; since API_MINOR 20) is kept and not
     * drawn; other names throw a TypeError. */
    setAttribute(name: AttributeName, attribute: BufferAttribute): this;
    getAttribute(name: AttributeName): BufferAttribute | undefined;
    /** A float `position` attribute of the points (z 0 for Vector2s), or,
     * when there is one, its first vertices set to them (as many as it
     * holds; a warning past it), as three.js (since API_MINOR 20):
     * `new BufferGeometry().setFromPoints(curve.getPoints(50))` for a
     * `Line`. */
    setFromPoints(points: readonly (Vector2 | Vector3)[]): this;
    /** Turns the positions (and normals) to face `vector` from the origin,
     * as an Object3D's `lookAt` (since API_MINOR 20). */
    lookAt(vector: Vector3): this;
    /** Each normal made unit length (since API_MINOR 20). */
    normalizeNormals(): void;
    /** A `tangent` attribute (x, y, z and the handedness w) from the
     * index, positions, normals and UVs over the groups, as three.js
     * computes it (since API_MINOR 20); without them it logs an error and
     * does nothing. */
    computeTangents(): void;
    /** Without an index the vertices draw in order, three a triangle; from
     * API_MINOR 15 the GPU holds no index list for them (before, the
     * runtime made one, 4 bytes a vertex). */
    setIndex(index: BufferAttribute | readonly number[] | null): this;
    getIndex(): BufferAttribute | null;
    /** The index (`getIndex()`) and the attributes by name, as three.js
     * has them. */
    readonly index: BufferAttribute | null;
    readonly attributes: Readonly<Record<string, BufferAttribute>>;
    computeVertexNormals(): void;
    /** Model-space bounding sphere (for culling, picking and shadows): a
     * Sphere since API_MINOR 18. */
    computeBoundingSphere(): void;
    /** The box around the positions (since API_MINOR 18; null until
     * `computeBoundingBox`, which `Box3.setFromObject` calls). */
    boundingBox: Box3 | null;
    computeBoundingBox(): void;
    /** Culls the geometry's meshes when set (since API_MINOR 7), in place
     * of a sphere around its vertices: set or inflate it when a custom
     * material's vertex hook moves vertices past them (skinning, wind).
     * Null (the default) culls by the vertices. One with NaN or infinite
     * values, or an empty one (a negative radius), culls nothing, as
     * three.js draws such meshes (earlier engines threw). Changing it
     * uploads the geometry again. A geometry without attributes (see
     * `drawRange`) culls by it alone: without it, it is never culled. */
    boundingSphere: Sphere | { center: Vector3; radius: number } | null;
    translate(x: number, y: number, z: number): this;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    scale(x: number, y: number, z: number): this;
    /** Transforms positions (and normals by its normal matrix,
     * normalized), then recomputes the bounds it has (three.js). */
    applyMatrix4(matrix: Matrix4): this;
    applyQuaternion(quaternion: Quaternion): this;
    /** Moves the positions so the bounding box's center is the origin
     * (three.js; it computes `boundingBox`). */
    center(): this;
    /** Each triangle its own three vertices (no index). */
    toNonIndexed(): BufferGeometry;
    /** A BufferGeometry with copies of the attributes, index, groups,
     * bounds and (since API_MINOR 18) draw range and name. */
    clone(): BufferGeometry;
    /** Copies of `source`'s attributes, index, groups, bounds and draw
     * range, its name, and its userData shared (three.js). */
    copy(source: BufferGeometry): this;
    name: string;
    userData: Record<string, unknown>;
    /** Releases the GPU mesh (it is made again if drawn). */
    dispose(): void;
    /** Which elements draw, as three.js draws them: `count` from `start`
     * (`count` Infinity, the default, to the end), of the index when the
     * geometry has one, else of its vertices in order (three a
     * triangle). `Points` draw the range's vertices, `Line`,
     * `LineSegments` and `LineLoop` its vertices or indices, and since
     * API_MINOR 18 a `Mesh` (an `InstancedMesh`'s every instance, and a
     * material array's groups within it) draws the range too, natively and
     * in browsers (before, meshes with attributes drew all). Changing it
     * only changes the draw: nothing is uploaded again, so a ribbon or a
     * trail can fill a buffer ahead and extend its range each frame. A
     * range past the geometry draws what lies within it; rays hit only
     * the range's triangles.
     *
     * A geometry with no `position` (and no other attribute or index)
     * draws `count` vertices, three a triangle, for a custom material's
     * vertex hook to place from `vertex_index()` (0 to `count - 1`) and
     * the instance's data (since API_MINOR 15, as three.js draws such a
     * geometry; before, it drew nothing): `geometry.setDrawRange(0,
     * 405504)`. It costs no mesh bytes (it counts as a mesh), its vertices
     * read position (0, 0, 0), normal (0, 1, 0) and uv (0, 0) until the
     * hook sets them (the built-in materials draw nothing), raycasts pass
     * through it, and it culls by `boundingSphere` alone. `start` must be
     * 0 and `count` a whole multiple of 3 of at most 1,048,576 (TypeError,
     * RangeError). */
    readonly drawRange: { start: number; count: number };
    setDrawRange(start: number, count: number): void;
    /** Ranges of the index (of the vertices without one), each drawn with
     * the `materialIndex`th material of a mesh's material array (three.js;
     * since API_MINOR 17). A mesh with one material draws the whole
     * geometry whatever its groups. Copied by `clone`, `copy` and
     * `toNonIndexed`. */
    groups: { start: number; count: number; materialIndex: number }[];
    addGroup(start: number, count: number, materialIndex?: number): void;
    clearGroups(): void;
  }
  /** One geometry from several (three.js's `BufferGeometryUtils.
   * mergeGeometries`): they must share their attributes (all indexed or
   * none); null when they do not. Bounded as any geometry (RangeError).
   * `useGroups` (since API_MINOR 17) adds a group for each geometry, its
   * place in the list its material index. */
  export function mergeGeometries(geometries: readonly BufferGeometry[], useGroups?: boolean): BufferGeometry | null;
  // three.js's built-in shapes with its parameters, defaults and vertex
  // layout; their `position`, `normal` and `uv` attributes and index are
  // readable (and writable) like any geometry's. Segment counts are at most
  // 1,024 (RangeError). Since API_MINOR 17 boxes, cylinders and cones have
  // three.js's groups (a box's faces +x, -x, +y, -y, +z, -z as materials 0
  // to 5; a cylinder's side 0, top 1 and bottom 2), so material arrays
  // work.
  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number, widthSegments?: number, heightSegments?: number, depthSegments?: number);
  }
  /** In the XY plane, facing +Z. */
  export class PlaneGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, widthSegments?: number, heightSegments?: number);
  }
  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number, phiStart?: number, phiLength?: number, thetaStart?: number, thetaLength?: number);
  }
  export class CylinderGeometry extends BufferGeometry {
    constructor(radiusTop?: number, radiusBottom?: number, height?: number, radialSegments?: number, heightSegments?: number, openEnded?: boolean, thetaStart?: number, thetaLength?: number);
  }
  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number, heightSegments?: number, openEnded?: boolean, thetaStart?: number, thetaLength?: number);
  }
  export class CapsuleGeometry extends BufferGeometry {
    constructor(radius?: number, length?: number, capSegments?: number, radialSegments?: number, heightSegments?: number);
  }
  export class TorusGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, radialSegments?: number, tubularSegments?: number, arc?: number);
  }
  export class RingGeometry extends BufferGeometry {
    constructor(innerRadius?: number, outerRadius?: number, thetaSegments?: number, phiSegments?: number, thetaStart?: number, thetaLength?: number);
  }
  export class CircleGeometry extends BufferGeometry {
    constructor(radius?: number, segments?: number, thetaStart?: number, thetaLength?: number);
  }

  // -- Curves, paths and shapes (since API_MINOR 17) -----------------------------
  // three.js r185's curves, paths, shapes and ShapeUtils, statement by
  // statement: the points they give are three.js's, natively and in
  // browsers. Since API_MINOR 20 the 3D curves too (`LineCurve3`,
  // `QuadraticBezierCurve3`, `CubicBezierCurve3`, `CatmullRomCurve3`), each
  // curve's `computeFrenetFrames`, `toJSON` and `fromJSON`, and paths of 3D
  // curves.
  /** What a curve's `toJSON` gives (three.js's): its `type`,
   * `arcLengthDivisions` and each kind's own fields (vectors as arrays). */
  export interface CurveJSON {
    metadata?: { version: number; type: string; generator: string };
    type: string;
    arcLengthDivisions: number;
    [key: string]: any;
  }
  /** Frenet frames along a curve: a tangent, normal and binormal at each
   * of `segments + 1` points spaced by arc length. */
  export interface FrenetFrames {
    tangents: Vector3[];
    normals: Vector3[];
    binormals: Vector3[];
  }
  /** A curve, 2D (`T` Vector2, the default) or 3D (Vector3, since
   * API_MINOR 20): `getPoint(t)` for t from 0 to 1 (each kind its own),
   * and from it points spaced by arc length (`arcLengthDivisions`
   * samples), lengths and tangents. A subclass of your own overrides
   * `getPoint`. */
  export class Curve<T extends Vector2 | Vector3 = Vector2> {
    type: string;
    arcLengthDivisions: number;
    needsUpdate: boolean;
    getPoint(t: number, optionalTarget?: T): T;
    getPointAt(u: number, optionalTarget?: T): T;
    getPoints(divisions?: number): T[];
    getSpacedPoints(divisions?: number): T[];
    getLength(): number;
    getLengths(divisions?: number): number[];
    updateArcLengths(): void;
    getUtoTmapping(u: number, distance?: number | null): number;
    /** The unit tangent at `t`, from points 0.0001 either side (a
     * Vector2 or Vector3 as the curve's points are; a line's exactly). */
    getTangent(t: number, optionalTarget?: T): T;
    getTangentAt(u: number, optionalTarget?: T): T;
    /** Tangents, normals and binormals at `segments + 1` points spaced by
     * arc length (since API_MINOR 20), as three.js computes them: the
     * first normal across the first tangent's smallest axis, carried
     * along by the turn between tangents; `closed` twists them evenly so
     * the last meets the first. What TubeGeometry and ExtrudeGeometry's
     * `extrudePath` follow. */
    computeFrenetFrames(segments: number, closed?: boolean): FrenetFrames;
    clone(): this;
    copy(source: Curve<any>): this;
    /** Since API_MINOR 20. */
    toJSON(): CurveJSON;
    /** Since API_MINOR 20: the curve set from `toJSON`'s data. */
    fromJSON(json: CurveJSON): this;
  }
  export class EllipseCurve extends Curve {
    constructor(aX?: number, aY?: number, xRadius?: number, yRadius?: number, aStartAngle?: number, aEndAngle?: number, aClockwise?: boolean, aRotation?: number);
    readonly isEllipseCurve: true;
    aX: number;
    aY: number;
    xRadius: number;
    yRadius: number;
    aStartAngle: number;
    aEndAngle: number;
    aClockwise: boolean;
    aRotation: number;
  }
  export class ArcCurve extends EllipseCurve {
    constructor(aX?: number, aY?: number, aRadius?: number, aStartAngle?: number, aEndAngle?: number, aClockwise?: boolean);
    readonly isArcCurve: true;
  }
  export class LineCurve extends Curve {
    constructor(v1?: Vector2, v2?: Vector2);
    readonly isLineCurve: true;
    v1: Vector2;
    v2: Vector2;
  }
  export class QuadraticBezierCurve extends Curve {
    constructor(v0?: Vector2, v1?: Vector2, v2?: Vector2);
    readonly isQuadraticBezierCurve: true;
    v0: Vector2;
    v1: Vector2;
    v2: Vector2;
  }
  export class CubicBezierCurve extends Curve {
    constructor(v0?: Vector2, v1?: Vector2, v2?: Vector2, v3?: Vector2);
    readonly isCubicBezierCurve: true;
    v0: Vector2;
    v1: Vector2;
    v2: Vector2;
    v3: Vector2;
  }
  /** A Catmull-Rom spline through points. */
  export class SplineCurve extends Curve {
    constructor(points?: Vector2[]);
    readonly isSplineCurve: true;
    points: Vector2[];
  }
  /** A straight segment in 3D (since API_MINOR 20). */
  export class LineCurve3 extends Curve<Vector3> {
    constructor(v1?: Vector3, v2?: Vector3);
    readonly isLineCurve3: true;
    v1: Vector3;
    v2: Vector3;
  }
  /** A quadratic Bézier curve in 3D (since API_MINOR 20). */
  export class QuadraticBezierCurve3 extends Curve<Vector3> {
    constructor(v0?: Vector3, v1?: Vector3, v2?: Vector3);
    readonly isQuadraticBezierCurve3: true;
    v0: Vector3;
    v1: Vector3;
    v2: Vector3;
  }
  /** A cubic Bézier curve in 3D (since API_MINOR 20). */
  export class CubicBezierCurve3 extends Curve<Vector3> {
    constructor(v0?: Vector3, v1?: Vector3, v2?: Vector3, v3?: Vector3);
    readonly isCubicBezierCurve3: true;
    v0: Vector3;
    v1: Vector3;
    v2: Vector3;
    v3: Vector3;
  }
  /** `CatmullRomCurve3`'s kinds: centripetal (the default; no cusps or
   * loops within a span), chordal, and uniform (`"catmullrom"`, shaped by
   * `tension`). */
  export type CatmullRomCurveType = "centripetal" | "chordal" | "catmullrom";
  /** A Catmull-Rom spline through 3D points (since API_MINOR 20), open
   * (its ends extended by mirroring the end spans) or `closed` (a loop),
   * of `curveType` (default centripetal) and, for `"catmullrom"`,
   * `tension` (default 0.5). `getPoint` outside 0 to 1 is three.js's too
   * (a closed curve wraps; an open one below 0 throws). The path to give
   * TubeGeometry for a trail or pipe through points. */
  export class CatmullRomCurve3 extends Curve<Vector3> {
    constructor(points?: Vector3[], closed?: boolean, curveType?: CatmullRomCurveType, tension?: number);
    readonly isCatmullRomCurve3: true;
    points: Vector3[];
    closed: boolean;
    curveType: CatmullRomCurveType;
    tension: number;
  }
  /** Curves end to end, 2D or (since API_MINOR 20) 3D.
   * `getPoints(divisions)` (default 12) divides each curve by `divisions`
   * (an ellipse or arc by twice it, a line not at all, a spline by it
   * times its points), leaving out a point equal to the one before; past
   * 1,048,576 points it is a RangeError. `fromJSON` makes each curve of
   * its type (one of the curve classes above; another is a TypeError). */
  export class CurvePath<T extends Vector2 | Vector3 = Vector2> extends Curve<T> {
    curves: Curve<T>[];
    autoClose: boolean;
    add(curve: Curve<T>): void;
    /** Joins the end back to the start with a line (a LineCurve, or a
     * LineCurve3 for 3D points), if they differ. */
    closePath(): this;
    getCurveLengths(): number[];
  }
  /** A path drawn as on a canvas: each call adds a curve from the current
   * point. `arc` and `ellipse` take their center relative to the current
   * point, `absarc` and `absellipse` absolutely (angles in radians,
   * counter-clockwise unless `aClockwise`); either joins the current point
   * to the arc's start with a line when they differ. */
  export class Path extends CurvePath {
    constructor(points?: Vector2[]);
    currentPoint: Vector2;
    setFromPoints(points: Vector2[]): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(aCPx: number, aCPy: number, aX: number, aY: number): this;
    bezierCurveTo(aCP1x: number, aCP1y: number, aCP2x: number, aCP2y: number, aX: number, aY: number): this;
    splineThru(pts: Vector2[]): this;
    arc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise?: boolean): this;
    absarc(aX: number, aY: number, aRadius: number, aStartAngle: number, aEndAngle: number, aClockwise?: boolean): this;
    ellipse(aX: number, aY: number, xRadius: number, yRadius: number, aStartAngle: number, aEndAngle: number, aClockwise?: boolean, aRotation?: number): this;
    absellipse(aX: number, aY: number, xRadius: number, yRadius: number, aStartAngle: number, aEndAngle: number, aClockwise?: boolean, aRotation?: number): this;
  }
  /** A path with holes, what ShapeGeometry and ExtrudeGeometry fill. */
  export class Shape extends Path {
    constructor(points?: Vector2[]);
    readonly uuid: string;
    holes: Path[];
    getPointsHoles(divisions?: number): Vector2[][];
    /** The outline's points and its holes', as `getPoints(divisions)`. */
    extractPoints(divisions?: number): { shape: Vector2[]; holes: Vector2[][] };
  }
  /** Sub-paths that make shapes with holes (as SVG and font loaders give
   * them). */
  export class ShapePath {
    constructor();
    readonly type: "ShapePath";
    color: Color;
    subPaths: Path[];
    currentPath: Path | null;
    userData: Record<string, any>;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    quadraticCurveTo(aCPx: number, aCPy: number, aX: number, aY: number): this;
    bezierCurveTo(aCP1x: number, aCP1y: number, aCP2x: number, aCP2y: number, aX: number, aY: number): this;
    splineThru(pts: Vector2[]): this;
    /** The shapes the sub-paths fill, by three.js r185's rule: each nested
     * in the smallest larger sub-path containing it, filled by
     * `userData.style.fillRule` (`"nonzero"`, the default, or
     * `"evenodd"`). Older three.js's `isCCW` is taken and not needed. */
    toShapes(isCCW?: boolean): Shape[];
  }
  export class ShapeUtils {
    /** The signed area (negative for clockwise points). */
    static area(contour: Vector2[]): number;
    static isClockWise(pts: Vector2[]): boolean;
    /** Triangles filling the contour less its holes (mapbox earcut, as
     * three.js triangulates), three indices each into the contour's points
     * then the holes' in order. A last point equal to the first is removed
     * from the contour and each hole first (the arrays change), as three.js
     * does. */
    static triangulateShape(contour: Vector2[], holes: Vector2[][]): number[][];
  }
  export class Earcut {
    /** Triangles over flat x, y pairs whose holes start at `holeIndices`
     * (points); `dim` must be 2. */
    static triangulate(data: ArrayLike<number>, holeIndices?: ArrayLike<number> | null, dim?: number): number[];
  }
  /** Shapes' flat faces in the XY plane facing +Z (three.js
   * `ShapeGeometry`): each shape's curves divided by `curveSegments`
   * (default 12), its holes left open, UVs its x and y; indexed, with a
   * group a shape (material i) for an array of shapes. Default: a
   * triangle. */
  export class ShapeGeometry extends BufferGeometry {
    constructor(shapes?: Shape | Shape[], curveSegments?: number);
    readonly type: "ShapeGeometry";
    readonly parameters: { shapes: Shape | Shape[]; curveSegments: number };
  }
  /** `ExtrudeGeometry`'s settings, three.js's defaults: `depth` 1,
   * `bevelEnabled` true, `bevelThickness` 0.2, `bevelSize`
   * `bevelThickness - 0.1`, `bevelOffset` 0, `bevelSegments` 3,
   * `curveSegments` 12, `steps` 1 (`steps` at least 1 and `bevelSegments`
   * whole numbers up to 1,024: fractions are dropped). Since
   * API_MINOR 20, `extrudePath` extrudes along a 3D curve instead of +Z
   * (`steps` layers at its `getSpacedPoints(steps)`, each shape point
   * (x, y) placed along the frame's normal and binormal of
   * `computeFrenetFrames(steps, closed)`, closed for a closed
   * CatmullRomCurve3; no bevel and `depth` unused, as three.js), and a
   * custom `UVGenerator` gives the UVs (before, either was a TypeError). */
  export interface ExtrudeGeometryOptions {
    curveSegments?: number;
    steps?: number;
    depth?: number;
    bevelEnabled?: boolean;
    bevelThickness?: number;
    bevelSize?: number;
    bevelOffset?: number;
    bevelSegments?: number;
    extrudePath?: Curve<Vector3>;
    UVGenerator?: UVGenerator;
  }
  /** An ExtrudeGeometry's UVs of your own (three.js's `UVGenerator`;
   * since API_MINOR 20): called for each cap triangle and side quad in
   * three.js's order with the positions (x, y, z a vertex, as three.js
   * holds them before rounding to 32-bit floats: the whole geometry's,
   * where three.js passes those made so far) and the vertices' numbers;
   * three UVs a triangle and four a quad (a, b, c, d). */
  export interface UVGenerator {
    generateTopUV(geometry: ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number): Vector2[];
    generateSideWallUV(geometry: ExtrudeGeometry, vertices: number[], indexA: number, indexB: number, indexC: number, indexD: number): Vector2[];
  }
  /** Shapes extruded from z = 0 to `depth` along +Z, their edges bevelled
   * outward (three.js `ExtrudeGeometry`): triangles not indexed, flat
   * normals, UVs as three.js's `WorldUVGenerator`, and for each shape a
   * group of its front and back caps (material 0) and one of its sides
   * (material 1), so `new Mesh(geometry, [face, side])` works. Default: a
   * unit square. Past 1,048,576 vertices it is a RangeError. */
  export class ExtrudeGeometry extends BufferGeometry {
    constructor(shapes?: Shape | Shape[], options?: ExtrudeGeometryOptions);
    readonly type: "ExtrudeGeometry";
    readonly parameters: { shapes: Shape | Shape[]; options: ExtrudeGeometryOptions };
  }
  /** A geometry's edges where its faces meet at more than `thresholdAngle`
   * degrees (default 1), and its open edges, as three.js computes them
   * (points within 1e-4 one point; edges in three.js's order): `position`
   * holds two vertices an edge, for `LineSegments`. A box gives its 12
   * edges. */
  export class EdgesGeometry extends BufferGeometry {
    constructor(geometry?: BufferGeometry | null, thresholdAngle?: number);
    readonly type: "EdgesGeometry";
    readonly parameters: { geometry: BufferGeometry | null; thresholdAngle: number };
  }
  /** Every triangle's edges, each once whichever way round (three.js
   * `WireframeGeometry`, since API_MINOR 18): `position` holds two
   * vertices an edge, for `LineSegments`. An indexed geometry's groups
   * are read in turn (its whole index without groups). */
  export class WireframeGeometry extends BufferGeometry {
    constructor(geometry?: BufferGeometry | null);
    readonly type: "WireframeGeometry";
    readonly parameters: { geometry: BufferGeometry | null };
  }

  // -- Polyhedra, lathe, torus knot and rounded box (since API_MINOR 18) ---------
  // three.js r185's, built as it builds them: positions, normals, UVs, index
  // and groups are three.js's, bit for bit. Segment counts are whole
  // numbers (fractions dropped) of 1 to 1,024, and a geometry past
  // 1,048,576 vertices is refused before it is made (RangeError).
  /** `vertices` (x, y, z each) and `indices` (three a face) pushed out to
   * a sphere of `radius`, each face divided `detail` times (a whole number
   * from 0, else RangeError), as three.js `PolyhedronGeometry`: not
   * indexed, UVs by longitude and latitude, flat normals at detail 0 and
   * smooth above. */
  export class PolyhedronGeometry extends BufferGeometry {
    constructor(vertices?: number[], indices?: number[], radius?: number, detail?: number);
    readonly type: "PolyhedronGeometry" | "IcosahedronGeometry" | "OctahedronGeometry" | "DodecahedronGeometry" | "TetrahedronGeometry";
    /** The subclasses' hold only `radius` and `detail`. */
    readonly parameters: { vertices?: number[]; indices?: number[]; radius: number; detail: number };
  }
  /** 20 faces (radius 1, detail 0 by default; detail 1 or more is a
   * geodesic sphere). */
  export class IcosahedronGeometry extends PolyhedronGeometry {
    constructor(radius?: number, detail?: number);
    readonly type: "IcosahedronGeometry";
  }
  /** 8 faces. */
  export class OctahedronGeometry extends PolyhedronGeometry {
    constructor(radius?: number, detail?: number);
    readonly type: "OctahedronGeometry";
  }
  /** 12 pentagons, three triangles each. */
  export class DodecahedronGeometry extends PolyhedronGeometry {
    constructor(radius?: number, detail?: number);
    readonly type: "DodecahedronGeometry";
  }
  /** 4 faces. */
  export class TetrahedronGeometry extends PolyhedronGeometry {
    constructor(radius?: number, detail?: number);
    readonly type: "TetrahedronGeometry";
  }
  /** `points` (x the distance from the Y axis, y the height) turned about
   * the Y axis in `segments` steps (default 12) over `phiLength` (default
   * a full turn, at most one) from `phiStart` (three.js `LatheGeometry`):
   * indexed. Default: a diamond of three points; one point is a
   * TypeError. */
  export class LatheGeometry extends BufferGeometry {
    constructor(points?: Vector2[], segments?: number, phiStart?: number, phiLength?: number);
    readonly type: "LatheGeometry";
    readonly parameters: { points: Vector2[]; segments: number; phiStart: number; phiLength: number };
  }
  /** A tube of radius `tube` (default 0.4) along a (`p`, `q`) torus knot
   * (default 2, 3) of `radius` (default 1), `tubularSegments` (default 64)
   * along and `radialSegments` (default 8) around (three.js
   * `TorusKnotGeometry`): indexed. */
  export class TorusKnotGeometry extends BufferGeometry {
    constructor(radius?: number, tube?: number, tubularSegments?: number, radialSegments?: number, p?: number, q?: number);
    readonly type: "TorusKnotGeometry";
    readonly parameters: { radius: number; tube: number; tubularSegments: number; radialSegments: number; p: number; q: number };
  }
  /** A tube of `radius` (default 1) round a 3D curve (three.js
   * `TubeGeometry`; since API_MINOR 20): `tubularSegments` (default 64)
   * rings spaced along `path` by arc length, each of `radialSegments`
   * (default 8) round the curve's Frenet frame there
   * (`path.computeFrenetFrames(tubularSegments, closed)`, kept as
   * `tangents`, `normals` and `binormals`); a `closed` tube's last ring is
   * its first again. Indexed; UVs along (u) then round (v). Default: a
   * quadratic Bézier from (-1, -1, 0) through (-1, 1, 0) to (1, 1, 0).
   * Segment counts are whole numbers of 1 to 1,024 (else RangeError);
   * built from a new curve or new segments, as three.js (a trail that
   * grows makes a new one, or draws a range of one made long enough). */
  export class TubeGeometry extends BufferGeometry {
    constructor(path?: Curve<Vector3>, tubularSegments?: number, radius?: number, radialSegments?: number, closed?: boolean);
    readonly type: "TubeGeometry";
    readonly parameters: { path: Curve<Vector3>; tubularSegments: number; radius: number; radialSegments: number; closed: boolean };
    tangents: Vector3[];
    normals: Vector3[];
    binormals: Vector3[];
  }
  /** A box (default 1 × 1 × 1) with edges and corners rounded to `radius`
   * (default 0.1, at most half the shortest side) in `segments` (default 2,
   * from 0) steps: three.js's addon `RoundedBoxGeometry`
   * (examples/jsm/geometries/RoundedBoxGeometry.js), exported here as the
   * engine has no addons path; there it extends BoxGeometry, here
   * BufferGeometry. Not indexed, a group a face as a box's (+x, -x, +y,
   * -y, +z, -z); at `segments` 0 three.js's unit box, whatever the
   * size. */
  export class RoundedBoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number, segments?: number, radius?: number);
    readonly type: "RoundedBoxGeometry";
    readonly parameters: { width: number; height: number; depth: number; segments: number; radius: number };
  }

  // -- Materials ----------------------------------------------------------------
  export interface MaterialParameters {
    /** Base color (default white), linear; components above 1 (three.js
     * HDR colors, up to 65504) light brighter than white, which tone mapping
     * and bloom take. */
    color?: ColorInput;
    /** Base color texture, multiplied by `color`. */
    map?: Texture | null;
    /** 0–1 (default 1). Below 1 needs `transparent` to blend. */
    opacity?: number;
    /** Draws after opaque objects, sorted farthest first, blending as
     * `blending` says (normal by default). Before API_MINOR 20 blending
     * other than normal draws there whatever this says; from it, as in
     * three.js, this alone decides. */
    transparent?: boolean;
    /** Above 0, pixels whose alpha is below it are discarded (masked). */
    alphaTest?: number;
    blending?: Blending;
    /** With `CustomBlending` (since API_MINOR 10): the color's equation
     * (default `AddEquation`) and factors (default `SrcAlphaFactor` and
     * `OneMinusSrcAlphaFactor`), and the alpha's (null, the default: the
     * color's). */
    blendEquation?: number;
    blendSrc?: number;
    blendDst?: number;
    blendEquationAlpha?: number | null;
    blendSrcAlpha?: number | null;
    blendDstAlpha?: number | null;
    side?: Side;
    /** Default from API_MINOR 20: true, as three.js's for every material,
     * transparent ones included. Before it: written unless blended, so a
     * port declaring an older minor that relied on a transparent mesh's
     * depth writes sets `depthWrite: true` (grid lines drawn before a
     * glass top under them stay visible only where they wrote depth, as
     * blended meshes draw farthest first). */
    depthWrite?: boolean;
    /** Depth tests pass on nearer depth, and from API_MINOR 20 on equal
     * depth too (three.js's default `LessEqualDepth`; `depthFunc` itself
     * is not offered). */
    depthTest?: boolean;
    /** Whether the scene's fog applies (default true). */
    fog?: boolean;
    /** Multiply by the geometry's `color` attribute. */
    vertexColors?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
    visible?: boolean;
    /** With `transparent` and normal blending: the output's color times its
     * alpha over earlier output times one minus the alpha (three.js
     * `premultipliedAlpha`; since API_MINOR 7). A built-in material's color
     * is premultiplied for it; a ShaderMaterial's fragment gives its color
     * premultiplied, so alpha 0 adds light (glows and smoke in one
     * material). */
    premultipliedAlpha?: boolean;
    /** Whether the output is tone mapped (default true; post effects tone
     * map everything). Since API_MINOR 6. */
    toneMapped?: boolean;
    /** Hooks into the material's shading (since API_MINOR 6). */
    hooks?: MaterialHooks | null;
  }
  /** Common to all materials; changes apply from the next frame. */
  export abstract class Material {
    #private;
    /** three.js's (since API_MINOR 20): a number of its own, in the order
     * materials are made; from API_MINOR 20 it orders the opaque list
     * after render order. */
    readonly id: number;
    name: string;
    userData: Record<string, unknown>;
    color: Color;
    map: Texture | null;
    opacity: number;
    transparent: boolean;
    alphaTest: number;
    blending: Blending;
    /** Since API_MINOR 10: see `MaterialParameters.blendEquation`. */
    blendEquation: number;
    blendSrc: number;
    blendDst: number;
    blendEquationAlpha: number | null;
    blendSrcAlpha: number | null;
    blendDstAlpha: number | null;
    side: Side;
    depthWrite: boolean;
    depthTest: boolean;
    fog: boolean;
    vertexColors: boolean;
    polygonOffset: boolean;
    polygonOffsetFactor: number;
    polygonOffsetUnits: number;
    visible: boolean;
    /** An environment this material reflects instead of
     * `scene.environment` (standard, physical and Lambert materials; see
     * `PMREMGenerator`). */
    envMap: Texture | null;
    /** Since API_MINOR 6: whether the output is tone mapped (three.js
     * `toneMapped`, default true; without post effects only). */
    toneMapped: boolean;
    /** Since API_MINOR 7: see `MaterialParameters.premultipliedAlpha`. */
    premultipliedAlpha: boolean;
    /** Since API_MINOR 6: the game's WGSL hooked into this material's
     * shading (standard, physical, Lambert and basic materials; see
     * `MaterialHooks`), or null. Assign a new object, or change its
     * sources or uniforms' types, and the material's program follows from
     * the next frame; uniform values are read every frame. */
    hooks: MaterialHooks | null;
    /** Since API_MINOR 6: why the material's program was refused, as
     * `part:line:column: message` (the part being `vertex`, `surface`,
     * `vertexShader`, `fragmentShader`, `uniforms` or `engine`), or null.
     * A refused program leaves the material drawing without it (a
     * `ShaderMaterial` draws nothing) and is logged once. The engine checks
     * the code by the rules browsers' WebGPU enforces, but a browser's
     * WebGPU compiles the program again as the game draws on and may still
     * refuse it some frames later: the game's log then says so once (with
     * WebGPU's message at the part, line and column), and `shaderError`
     * reports it from then on. */
    readonly shaderError: string | null;
    /** Since API_MINOR 6: compiles the material's program now (otherwise
     * it compiles when first drawn), throwing a SyntaxError with
     * `shaderError`'s message if it is refused. */
    compile(): void;
    /** A material of the same class with this one's settings: colors and
     * vectors copied, textures shared (three.js); since API_MINOR 18 its
     * userData copied by JSON and a ShaderMaterial's uniforms cloned. */
    clone(): this;
    /** `source`'s settings, as `clone` takes them (since API_MINOR 18). */
    copy(source: Material): this;
    dispose(): void;
  }

  // -- Custom materials (since API_MINOR 6) -------------------------------------
  // A game's WGSL (the WebGPU shading language; the subset starhermit-shader
  // compiles: no switch, while, pointers or atomics) joined with the
  // engine's mesh stages and compiled for every backend (SPIR-V, HLSL, GLSL
  // ES 3.00, WGSL), so the same code draws on Vulkan, Direct3D 12, OpenGL
  // ES, WebGPU and WebGL2. It is sandboxed: a part declares structs,
  // constants and functions only (no variables, bindings, entry points or
  // attributes, no names the engine declares, nothing starting with `_`),
  // reads no engine globals but `uniforms` and its textures, and loops only
  // with `for (var i = A; i < B; i++)` over constant bounds and step (any of
  // <, <=, >, >=, ++, --, += k, -= k; at most 65,536 iterations, nested
  // loops together); WGSL has no recursion. Derivatives (dpdx, dpdy,
  // fwidth), textureSample and textureSampleBias stay in uniform control
  // flow (outside branches and loops on per-pixel values; branching on
  // `uniforms` and constants is fine), as WebGPU requires; vertex code
  // samples with textureSampleLevel or textureSampleGrad and cannot
  // discard. textureSampleBias, textureSampleGrad (explicit gradients, so
  // anywhere) and textureDimensions (a texture's size, or a mip level's)
  // work on every backend since API_MINOR 8. Each part is at most 64 KiB.
  // Errors name the part and its own line and column.
  //
  // What the engine declares for a game's code:
  //   struct Vertex { position: vec3f, normal: vec3f, uv: vec2f,
  //     color: vec4f, custom: vec4f, instance: vec4f, clip: vec4f,
  //     v0: vec4f, v1: vec4f, v2: vec4f, v3: vec4f,
  //     instance_color: vec4f, vertex_color: vec4f,
  //     instance1: vec4f, instance2: vec4f, instance3: vec4f }
  //     position and normal in object space; color the instance color times
  //     the vertex color (when the material has vertexColors; white
  //     otherwise), each also given alone (instance_color, which includes
  //     the InstancedMesh's color, 0..65504, and vertex_color: a game may
  //     carry data in them and set color itself); custom the
  //     geometry's `custom` attribute (zeros without one); instance the
  //     InstancedMesh's `instanceCustom` slot 0 and instance1..3 its slots
  //     1 to 3 (zeros otherwise); clip zero, or
  //     set by the hook (w not 0) to place the vertex in clip space itself
  //     (depth -1..1 as view_projection() gives; the shadow pass ignores
  //     it); v0..v3 four varyings for the fragment stage.
  //   struct Surface { base_color: vec4f, emissive: vec3f, metalness: f32,
  //     roughness: f32, normal: vec3f, occlusion: f32, world: vec3f,
  //     uv: vec2f, color: vec4f, v0..v3: vec4f, front: bool }
  //     base_color linear after the map, color, opacity and vertex colors;
  //     emissive linear after its intensity and map; normal in world space
  //     after the normal map; occlusion 0..1 (1 none). The rest describe the
  //     fragment (read-only).
  //   struct Fragment { world: vec3f, normal: vec3f, uv: vec2f, color: vec4f,
  //     v0..v3: vec4f, front: bool, coord: vec4f }
  //     coord the fragment's window position (WGSL @builtin(position);
  //     rows from the top on every backend since API_MINOR 8, where OpenGL
  //     ES and WebGL2 windows had counted them from the bottom).
  //   struct Light { sun: vec3f, shadow: f32, direct: vec3f,
  //     indirect: vec3f, emissive: vec3f, sun_direction: vec3f,
  //     sun_color: vec3f, ambient: vec3f, world: vec3f, normal: vec3f,
  //     uv: vec2f, base_color: vec4f, v0..v3: vec4f }   (since API_MINOR 9)
  //     sun the primary light's reflected light without its shadow and
  //     shadow that shadow (1 lit, 0 shadowed); direct the other lights'
  //     (their shadows applied); indirect ambient, hemisphere and
  //     environment light (ambient occlusion applied); emissive the
  //     surface's. The rest read-only: sun_direction toward the primary
  //     light, its color, the ambient color, and the fragment (normal the
  //     shading normal facing the viewer, the surface's base color and
  //     varyings).
  //   struct Fog { color: vec3f, amount: f32, world: vec3f, depth: f32,
  //     coord: vec4f, camera: vec3f }               (since API_MINOR 9)
  //     color linear and amount 0 (none) to 1 (full): the scene's fog
  //     (black and 0 without one); fogged in display color as the scene's
  //     fog is (or in linear light before the post effects' tone mapping).
  //     Read-only: the fragment's world position, view depth and window
  //     position (rows from the top, for screen_uv and renderer.sceneDepth)
  //     and the camera's position.
  //   fn model_matrix() -> mat4x4f       object to world, instance included
  //   fn vertex_index() -> u32           (both vertex stage only)
  //   fn view_projection() -> mat4x4f    world to clip (depth -1..1)
  //   fn camera_position() -> vec3f
  //   fn viewport_size() -> vec2f        in pixels
  //   fn srgb_to_linear(c: vec3f) -> vec3f, fn linear_to_srgb(c: vec3f) -> vec3f
  //   fn view_depth(world: vec3f) -> f32  distance along the camera's
  //                                      forward axis (since API_MINOR 8)
  //   fn screen_uv(coord: vec4f) -> vec2f a window position as texture
  //                                      coordinates, 0..1 from the top
  //                                      left (since API_MINOR 8)
  // Textures are RGBA8 as uploaded (a Uint8Array DataTexture's bytes as
  // they are, read as 0..1): for exact texels (data, animation frames),
  // use NearestFilter and sample texel centers, (i + 0.5) / size, with
  // textureSampleLevel, which vertex code also uses; or, since API_MINOR
  // 10, read one exactly, whatever the filter, with
  //   textureLoad(NAME, vec2i(x, y), 0) -> vec4f   (vec2u too)
  // level 0 only (the literal 0); x and y are clamped into the texture on
  // every runtime (WebGPU included), so outside it they read the texel at
  // its edge.
  // Texture coordinates are WGSL's: (0, 0) is the image's first row as
  // uploaded (an image file's top, a DataTexture's first row of data) and v
  // grows down it. The geometry's uv arrives turned to that convention
  // (Vertex.uv, Surface.uv and Fragment.uv are three.js's uv with v
  // replaced by 1 - v), so sampling with them shows a texture as a
  // built-in map does; coordinates a hook computes itself (an atlas cell, a
  // texel of data) count rows from the first. Ported three.js GLSL that
  // computes v upward from the bottom (or reads vUv.y) uses 1 - v.
  // Porting three.js GLSL, two differences to watch:
  //   - vUv.y is 1.0 - uv.y here (uv.x is the same): a gradient, stripe or
  //     mask over vUv.y reads `let v = 1.0 - f.uv.y;` (Vertex, Surface and
  //     Fragment alike); texture sampling takes uv as it is.
  //   - smoothstep(e0, e1, x) with e0 > e1 is undefined in WGSL (WebGPU
  //     may return anything; three's GLSL ports rely on the reversed ramp,
  //     which GLSL also leaves undefined but GPUs happen to compute):
  //     write `1.0 - smoothstep(e1, e0, x)` instead of
  //     `smoothstep(e0, e1, x)` when e0 > e1.
  //   var<uniform> uniforms: Uniforms    the material's uniforms by name
  //   NAME: texture_2d<f32>, NAME_sampler: sampler   each texture uniform
  //   const NAME                          each define
  // The hooks, each optional:
  //   fn vertex(v: Vertex) -> Vertex     every pass: the shadows and the
  //                                      occlusion prepass see the same shape
  //   fn surface(s: Surface) -> Surface  before light, shadows and fog (and
  //                                      the alpha test); may discard, in the
  //                                      shadow pass too
  //                                      On an unlit MeshBasicMaterial the
  //                                      color is base_color plus emissive
  //                                      (a glow), its alpha base_color's
  //                                      (vertex alpha included), blended
  //                                      as the material says (additive
  //                                      for glows).
  //   fn light(l: Light) -> Light       (since API_MINOR 9) lit materials:
  //                                      the light the surface reflects, by
  //                                      kind, before it is added up as
  //                                      sun × shadow + direct + indirect +
  //                                      emissive (under a clearcoat): tinted
  //                                      shadows (add a tint where shadow < 1),
  //                                      cloud shadows (shadow times a cloud
  //                                      texture sampled at world.xz)
  //   fn fog(f: Fog) -> Fog             (since API_MINOR 9; both kinds) the
  //                                      fog on the fragment: height fog or
  //                                      mist from world.y and depth, with or
  //                                      without the scene's fog; not run for
  //                                      materials with `fog` false
  // A ShaderMaterial's instead of surface (required):
  //   fn fragment(f: Fragment) -> vec4f  linear color and alpha, then fog
  //                                      (with `fog`) and tone mapping (with
  //                                      `toneMapped`) as other materials
  // Programs with identical sources, defines and uniform types share one; a
  // game holds at most 256 (RangeError). Points and sprites take no hooks.

  /** A uniform: `value` is read every frame. Its type follows the value:
   * a number is `f32`; Vector2, Vector3 (or Color, linear) and Vector4 (or
   * Quaternion) are `vec2f`, `vec3f`, `vec4f`; a Matrix4 `mat4x4f`; an
   * array of Vector4 or Matrix4, or a Float32Array of 4n numbers, an
   * `array<vec4f, n>` or `array<mat4x4f, n>`; a Texture (or null, the
   * white texture) a texture and sampler (at most 5 a material since
   * API_MINOR 9, 4 before: with the material's own maps and the shadow
   * maps that is the 16 a WebGL2 fragment stage is sure to sample). Each
   * member takes whole vec4 slots, 16,384 bytes in all since API_MINOR 10
   * (4,096 before; 1,024 vec4s, 256 matrices: WebGL2's least uniform block):
   * a larger block is refused (`compile()` throws a SyntaxError, the
   * material draws without its program). */
  export interface ShaderUniform {
    value: number | Vector2 | Vector3 | Vector4 | Color | Quaternion | Matrix4 | Texture | null | readonly Vector4[] | readonly Matrix4[] | Float32Array;
  }
  /** The game's WGSL hooked into a built-in material (three.js
   * `onBeforeCompile`, cleanly). */
  export interface MaterialHooks {
    uniforms?: Record<string, ShaderUniform>;
    /** WGSL constants (three.js `defines`): whole numbers become abstract
     * integers, other numbers f32, booleans bool. At most 64. */
    defines?: Record<string, number | boolean>;
    /** Declares `fn vertex(v: Vertex) -> Vertex`. */
    vertex?: string;
    /** Declares `fn surface(s: Surface) -> Surface`. */
    surface?: string;
    /** Declares `fn light(l: Light) -> Light` (since API_MINOR 9; lit
     * materials). */
    light?: string;
    /** Declares `fn fog(f: Fog) -> Fog` (since API_MINOR 9). */
    fog?: string;
  }
  export interface ShaderMaterialParameters extends MaterialParameters {
    uniforms?: Record<string, ShaderUniform>;
    defines?: Record<string, number | boolean>;
    /** WGSL declaring `fn vertex(v: Vertex) -> Vertex` (optional). */
    vertexShader?: string;
    /** WGSL declaring `fn fragment(f: Fragment) -> vec4f`. */
    fragmentShader?: string;
    /** WGSL declaring `fn fog(f: Fog) -> Fog` (since API_MINOR 9; with
     * `fog: true`). */
    fogShader?: string;
  }
  /** The game's own surface and light (three.js `ShaderMaterial`, in
   * WGSL; since API_MINOR 6): `fragmentShader` gives each fragment's linear
   * color. Blending, sides, depth, render order, shadows (cast without
   * discard) and `alphaTest` work as for other materials; `fog` defaults to
   * false. A refused program draws nothing. */
  export class ShaderMaterial extends Material {
    constructor(parameters?: ShaderMaterialParameters);
    uniforms: Record<string, ShaderUniform>;
    defines: Record<string, number | boolean>;
    vertexShader: string;
    fragmentShader: string;
    /** Since API_MINOR 9 (see `ShaderMaterialParameters`). */
    fogShader: string;
  }
  export interface MeshStandardMaterialParameters extends MaterialParameters {
    /** 0–1 (default 0). */
    metalness?: number;
    /** 0–1 (default 1). */
    roughness?: number;
    /** Light the surface gives off whatever lights it (default black). */
    emissive?: ColorInput;
    emissiveMap?: Texture | null;
    /** Default 1; above 1 drives bloom. */
    emissiveIntensity?: number;
    normalMap?: Texture | null;
    normalScale?: Vector2;
    roughnessMap?: Texture | null;
    metalnessMap?: Texture | null;
    aoMap?: Texture | null;
    aoMapIntensity?: number;
    envMap?: Texture | null;
    envMapIntensity?: number;
    /** Since API_MINOR 18: a height map (red channel) whose slope tilts
     * the normal, read only without a `normalMap` (three.js). */
    bumpMap?: Texture | null;
    /** Default 1; within ±16. */
    bumpScale?: number;
    /** Since API_MINOR 18: faceted shading (default false). */
    flatShading?: boolean;
    /** Since API_MINOR 18: draw the triangles' edges (default false). */
    wireframe?: boolean;
    /** Kept, and always 1 (WebGL draws one-pixel lines). */
    wireframeLinewidth?: number;
  }
  /** Metallic/roughness (glTF-style) shading with three.js's maps. */
  export class MeshStandardMaterial extends Material {
    constructor(parameters?: MeshStandardMaterialParameters);
    metalness: number;
    roughness: number;
    emissive: Color;
    emissiveMap: Texture | null;
    emissiveIntensity: number;
    /** Tangent-space normals (OpenGL convention: green up), x and y scaled
     * by `normalScale` (default (1, 1); flip y for maps with green down);
     * the tangent frame comes from screen-space derivatives. */
    normalMap: Texture | null;
    normalScale: Vector2;
    /** Roughness times the map's green, metalness times its blue (glTF;
     * one image may hold both). */
    roughnessMap: Texture | null;
    metalnessMap: Texture | null;
    /** Ambient occlusion from the red channel, scaled by `aoMapIntensity`
     * (default 1). */
    aoMap: Texture | null;
    aoMapIntensity: number;
    /** Scales the environment's light (default 1): its `envMap`'s, or the
     * scene's (`scene.environment`) times `scene.environmentIntensity`.
     * Until host API 1.18, and again from API_MINOR 20, the scene's
     * environment takes only `environmentIntensity`, as three.js r163 and
     * later's WebGLRenderer does (it overrides the material's with it);
     * three.js r162 and earlier, and its WebGPURenderer, take the
     * material's, as API_MINOR 18 and 19 do. */
    envMapIntensity: number;
    /** Since API_MINOR 18: a height map whose red channel's screen-space
     * slope tilts the normal (three.js's derivative bump mapping,
     * `perturbNormalArb`), scaled by `bumpScale` (default 1, within ±16);
     * three.js reads it only without a `normalMap`, and so does the
     * runtime. It takes the normal map's UVs and its own transform. */
    bumpMap: Texture | null;
    bumpScale: number;
    /** Since API_MINOR 18: faceted shading, each fragment its triangle's
     * normal from the screen-space derivatives of its position (facing
     * the viewer, as three.js's shader makes it), the geometry's normals
     * unused and unchanged. */
    flatShading: boolean;
    /** Since API_MINOR 18: draws each triangle's three edges as lines one
     * pixel wide (three.js's renderer's wireframe index: an edge two
     * triangles share is drawn twice), shaded per pixel as the material
     * shades its surface (lit materials light them with the geometry's
     * normals). A wireframe casts no shadow (three.js's casts its lines'),
     * is left out of ambient occlusion, runs no custom hooks, and rays hit
     * its triangles as three.js's do. Meshes, material arrays' groups and
     * instanced meshes draw it; other meshes (a glTF's, skinned ones)
     * draw filled. */
    wireframe: boolean;
    /** Kept, and always 1 (WebGL draws one-pixel lines). */
    wireframeLinewidth: number;
    wireframeLinecap: string;
    wireframeLinejoin: string;
  }
  export interface MeshPhysicalMaterialParameters extends MeshStandardMaterialParameters {
    /** 0–1 (default 0). */
    clearcoat?: number;
    /** 0–1 (default 0). */
    clearcoatRoughness?: number;
  }
  /** A standard material with a clear coat over it (three.js
   * `MeshPhysicalMaterial`: `clearcoat`, `clearcoatRoughness`; its other
   * physical properties are kept but not drawn: sheen, iridescence,
   * transmission, thickness, specular and anisotropy are not supported,
   * so `sheen`, `iridescence` and their colors, maps and ranges change
   * nothing). */
  export class MeshPhysicalMaterial extends MeshStandardMaterial {
    constructor(parameters?: MeshPhysicalMaterialParameters);
    clearcoat: number;
    clearcoatRoughness: number;
  }
  export interface MeshLambertMaterialParameters extends MaterialParameters {
    emissive?: ColorInput;
    emissiveMap?: Texture | null;
    emissiveIntensity?: number;
    normalMap?: Texture | null;
    normalScale?: Vector2;
    aoMap?: Texture | null;
    aoMapIntensity?: number;
    envMap?: Texture | null;
    /** Since API_MINOR 18: a height map (red channel) whose slope tilts
     * the normal, read only without a `normalMap` (three.js). */
    bumpMap?: Texture | null;
    /** Default 1; within ±16. */
    bumpScale?: number;
    /** Since API_MINOR 18: faceted shading (default false). */
    flatShading?: boolean;
    /** Since API_MINOR 18: draw the triangles' edges (default false). */
    wireframe?: boolean;
    /** Kept, and always 1 (WebGL draws one-pixel lines). */
    wireframeLinewidth?: number;
  }
  /** Diffuse light only (three.js `MeshLambertMaterial`), cheaper than
   * standard shading. Its `envMap`, else (before API_MINOR 20)
   * `scene.environment`, gives it the environment's diffuse light
   * (irradiance along the normal; before API_MINOR 8 environments lit it
   * not at all, despite this file). From API_MINOR 20, as in three.js,
   * `scene.environment` does not light it. */
  export class MeshLambertMaterial extends Material {
    constructor(parameters?: MeshLambertMaterialParameters);
    emissive: Color;
    emissiveMap: Texture | null;
    emissiveIntensity: number;
    normalMap: Texture | null;
    normalScale: Vector2;
    aoMap: Texture | null;
    aoMapIntensity: number;
    /** As MeshStandardMaterial's (since API_MINOR 18). */
    bumpMap: Texture | null;
    bumpScale: number;
    flatShading: boolean;
    wireframe: boolean;
    wireframeLinewidth: number;
    wireframeLinecap: string;
    wireframeLinejoin: string;
  }
  export interface PointsMaterialParameters extends MaterialParameters {
    /** Pixels (default 1), times the display's pixel ratio, at most 1,024. */
    size?: number;
    /** Shrinks with distance (default true): `size` × half the view's height
     * over the view depth, as three.js. */
    sizeAttenuation?: boolean;
  }
  /** Points' material (three.js `PointsMaterial`): unlit, double-sided,
   * squares facing the view; `map` covers each square, `vertexColors` takes
   * the geometry's colors. */
  export class PointsMaterial extends Material {
    constructor(parameters?: PointsMaterialParameters);
    size: number;
    sizeAttenuation: boolean;
  }
  export interface LineBasicMaterialParameters extends MaterialParameters {
    /** Kept, and always 1: lines are one pixel wide, as WebGL draws them
     * (three.js's `linewidth` has no effect there either). */
    linewidth?: number;
    linecap?: string;
    linejoin?: string;
  }
  /** Lines' material (three.js `LineBasicMaterial`, since API_MINOR 17):
   * unlit `color` (× the geometry's colors with `vertexColors`), `opacity`
   * with `transparent`, blending, depth and fog as other materials. Lines
   * are one pixel wide whatever `linewidth` says; polygon offsets do not
   * apply to them; `map` is not read (lines carry no texture coordinates)
   * and custom hooks are not run. Only `Line`, `LineSegments` and
   * `LineLoop` draw with it (a mesh with it draws nothing). */
  export class LineBasicMaterial extends Material {
    constructor(parameters?: LineBasicMaterialParameters);
    readonly isLineBasicMaterial: true;
    linewidth: number;
    linecap: string;
    linejoin: string;
  }
  export interface MeshBasicMaterialParameters extends MaterialParameters {
    /** Since API_MINOR 18: draw the triangles' edges (default false). */
    wireframe?: boolean;
    /** Kept, and always 1 (WebGL draws one-pixel lines). */
    wireframeLinewidth?: number;
  }
  /** Unlit: shows `color` × `map` whatever lights the scene. */
  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MeshBasicMaterialParameters);
    /** Since API_MINOR 18: draws each triangle's three edges as lines one
     * pixel wide (three.js's renderer's wireframe index: an edge two
     * triangles share is drawn twice), shaded per pixel as the material
     * shades its surface (lit materials light them with the geometry's
     * normals). A wireframe casts no shadow (three.js's casts its lines'),
     * is left out of ambient occlusion, runs no custom hooks, and rays hit
     * its triangles as three.js's do. Meshes, material arrays' groups and
     * instanced meshes draw it; other meshes (a glTF's, skinned ones)
     * draw filled. */
    wireframe: boolean;
    /** Kept, and always 1 (WebGL draws one-pixel lines). */
    wireframeLinewidth: number;
    wireframeLinecap: string;
    wireframeLinejoin: string;
  }
  /** Since API_MINOR 18: three.js `ShadowMaterial`, for shadow-catcher
   * floors: draws only the shadows its mesh receives (`receiveShadow`),
   * `color` (default black) at `opacity` times how shadowed each point is
   * (every shadow-casting light's shadow multiplied), transparent elsewhere
   * and where it receives none; not otherwise lit. `transparent` is true by
   * default; fog applies (`fog`). Not with `hooks` (they are ignored). */
  export class ShadowMaterial extends Material {
    constructor(parameters?: MaterialParameters);
    readonly isShadowMaterial: true;
  }
  export interface SpriteMaterialParameters extends MaterialParameters {
    /** Radians, counter-clockwise in the view plane. */
    rotation?: number;
    /** Shrinks with distance (default true); without it the sprite's scale
     * is world units per unit of view depth, constant on screen. */
    sizeAttenuation?: boolean;
  }
  /** Unlit and blended (transparent by default), as three.js. */
  export class SpriteMaterial extends Material {
    constructor(parameters?: SpriteMaterialParameters);
    rotation: number;
    sizeAttenuation: boolean;
  }

  // -- The scene graph ------------------------------------------------------------
  export class Object3D {
    constructor();
    name: string;
    readonly position: Vector3;
    /** Linked with `quaternion` (see `Euler`); the runtime reads the
     * quaternion once a frame after `onRender`. */
    readonly rotation: Euler;
    readonly quaternion: Quaternion;
    readonly scale: Vector3;
    /** Local and world transforms, kept up to date as three.js's
     * `updateMatrixWorld` would (reading them is always current). */
    readonly matrix: Matrix4;
    readonly matrixWorld: Matrix4;
    visible: boolean;
    /** Lower draws first among opaque objects, and among blended ones before
     * they sort farthest first (three.js `renderOrder`). From API_MINOR 20
     * a `Group`'s orders everything under it first (three.js's
     * `groupOrder`, up to the next Group). */
    renderOrder: number;
    /** Since API_MINOR 18 a mesh with a transparent (blended) material
     * casts too, its depth whole as an opaque one's, whatever its opacity
     * (three.js); games declaring older minors' cast none. */
    castShadow: boolean;
    receiveShadow: boolean;
    /** Whether a mesh out of view (by its geometry's bounds, or for an
     * InstancedMesh each run of instances by theirs) is left out (default
     * true; three.js; since API_MINOR 7). False draws it wherever it is, as
     * a custom material's vertex hook may place it (positions all zero, set
     * from `vertex_index()`, need no bounds): its bounds then decide nothing,
     * in the view or in shadow maps; an InstancedMesh then
     * keeps its instances exactly as given, as three.js draws them: in
     * order, singular matrices kept (data a hook reads through
     * `model_matrix()`, composed with the mesh's own transform: keep the
     * mesh at the origin), mirrored ones drawn with the mesh's winding.
     * Culled (the default), instances are arranged by place, a singular
     * one's columns zeroed (it draws nothing) and mirrored ones drawn
     * with their faces turned the right way. */
    frustumCulled: boolean;
    /** Leaves the object and its descendants out of `renderer.ao` (default
     * false; since API_MINOR 4): they cast no ambient occlusion, and where
     * they are drawn the occlusion of what lies behind them applies (sky
     * domes, light cones, nets). Sprites and points never take part. */
    noAO: boolean;
    readonly parent: Object3D | null;
    readonly children: readonly Object3D[];
    /** The game's own data (never read by the runtime). */
    userData: Record<string, unknown>;
    /** Moves objects here from wherever they were. A cycle throws a
     * TypeError; past the scene's bounds, a RangeError. */
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    removeFromParent(): this;
    clear(): this;
    /** Turns -Z (cameras, lights) or +Z (other objects) toward a world point. */
    lookAt(target: Vector3): void;
    lookAt(x: number, y: number, z: number): void;
    getWorldPosition(target: Vector3): Vector3;
    getWorldQuaternion(target: Quaternion): Quaternion;
    getWorldDirection(target: Vector3): Vector3;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    rotateOnAxis(axis: Vector3, angle: number): this;
    translateX(distance: number): this;
    translateY(distance: number): this;
    translateZ(distance: number): this;
    /** Kept for ports; matrices are always current. */
    updateMatrixWorld(force?: boolean): void;
    localToWorld(vector: Vector3): Vector3;
    worldToLocal(vector: Vector3): Vector3;
    traverse(callback: (object: Object3D) => void): void;
    getObjectByName(name: string): Object3D | undefined;
    // Since API_MINOR 18.
    /** The layers a Raycaster tests it on (layer 0 by default). The
     * renderer draws every visible object whatever its layers. */
    readonly layers: Layers;
    /** three.js's (kept, not played). */
    animations: unknown[];
    /** An object of the same class with this one's settings and, unless
     * `recursive` is false, clones of its children, as three.js's: meshes,
     * points, lines and sprites share their geometry and material (an
     * array copied), an InstancedMesh copies its instances' matrices,
     * colors and custom values, cameras and lights copy their settings (a
     * light's target is cloned), userData is copied by JSON. A glTF
     * model's `gltf.scene.clone()` is a copy to add as often as wanted,
     * sharing the model's geometry and materials. A class of the game's
     * own is made with no constructor arguments, as in three.js. The
     * scene cannot be cloned (TypeError). */
    clone(recursive?: boolean): this;
    /** `source`'s settings (name, up, position, rotation, quaternion,
     * scale, matrixAutoUpdate, layers, visible, castShadow, receiveShadow,
     * noAO, frustumCulled, renderOrder, animations, userData by JSON) and,
     * unless `recursive` is false, clones of its children added here. */
    copy(source: Object3D, recursive?: boolean): this;
    readonly up: Vector3;
    matrixAutoUpdate: boolean;
    getObjectById(id: number): Object3D | undefined;
    getObjectByProperty(name: string, value: unknown): Object3D | undefined;
    getObjectsByProperty(name: string, value: unknown, result?: Object3D[]): Object3D[];
    traverseVisible(callback: (object: Object3D) => void): void;
    traverseAncestors(callback: (object: Object3D) => void): void;
    getWorldScale(target: Vector3): Vector3;
    rotateOnWorldAxis(axis: Vector3, angle: number): this;
    translateOnAxis(axis: Vector3, distance: number): this;
    attach(object: Object3D): this;
    /** Its transform becomes `matrix` times it. */
    applyMatrix4(matrix: Matrix4): this;
    applyQuaternion(q: Quaternion): this;
    setRotationFromAxisAngle(axis: Vector3, angle: number): void;
    setRotationFromEuler(euler: Euler): void;
    setRotationFromMatrix(m: Matrix4): void;
    setRotationFromQuaternion(q: Quaternion): void;
    updateMatrix(): void;
    updateWorldMatrix(updateParents?: boolean, updateChildren?: boolean): void;
  }
  /** Which of 32 layers an object is on (three.js `Layers`; since
   * API_MINOR 18). */
  export class Layers {
    /** One bit a layer (layer 0 by default). */
    mask: number;
    set(layer: number): void;
    enable(layer: number): void;
    enableAll(): void;
    toggle(layer: number): void;
    disable(layer: number): void;
    disableAll(): void;
    /** Whether the two share a layer. */
    test(layers: Layers): boolean;
    isEnabled(layer: number): boolean;
  }
  /** From API_MINOR 20 its `renderOrder` orders everything under it first
   * (three.js's `groupOrder`, up to the next Group). */
  export class Group extends Object3D {
    constructor();
  }
  export class Mesh<TMaterial extends Material | Material[] = Material> extends Object3D {
    constructor(geometry?: BufferGeometry, material?: TMaterial);
    geometry: BufferGeometry;
    /** Since API_MINOR 17 also an array of materials (three.js's
     * multi-material meshes): each of the geometry's groups drawn with the
     * material at its `materialIndex` (a group whose material is missing
     * or not `visible` draws nothing, and without groups nothing draws).
     * Each group draws as an object of its own, an indexed geometry's
     * groups each uploading the geometry's vertices (keep the attributes'
     * arrays: one released after upload cannot make the groups again).
     * Rays hit the groups' triangles. An InstancedMesh takes one
     * material. (`Mesh<Material[]>`, as `new Mesh(geometry, [a, b])`
     * infers, types it as an array; three.js's own typings say `Material |
     * Material[]`.) */
    material: TMaterial;
    /** Vertex `index`'s model-space position (since API_MINOR 18). */
    getVertexPosition(index: number, target: Vector3): Vector3;
  }
  /** One geometry and material drawn `count` times with per-instance
   * transforms and colors. A game's instanced meshes hold at most 262,144
   * instances together (their capacities), and a frame draws what their
   * `count`s say; since API_MINOR 9 they no longer count toward the
   * 65,536 meshes and points a game holds (before, each instance of the
   * capacity did, and the bound was 65,536 for everything). */
  export class InstancedMesh extends Mesh<Material> {
    constructor(geometry: BufferGeometry, material: Material, count: number);
    /** Instances drawn, at most the constructor's count. */
    count: number;
    /** 16 floats an instance (column-major matrices), as three.js: write
     * the array and set `needsUpdate` (optionally with an update range) to
     * send the changed instances in one host call. */
    readonly instanceMatrix: BufferAttribute;
    /** 3 floats an instance (linear RGB, default white), as
     * `instanceMatrix`; null until `setColorAt` is first called. */
    readonly instanceColor: BufferAttribute | null;
    /** 4, 8, 12 or 16 floats an instance (up to four vec4s, default
     * zeros) that custom materials read as `Vertex.instance` and
     * `instance1` to `instance3`, as `instanceMatrix`; null until
     * `setCustomAt` is first called (since API_MINOR 7).
     *
     * THE STRIDE: instance i's slot k starts at `i * itemSize + k * 4`.
     * `setCustomAt` makes it `customSlots` vec4s an instance, and without
     * `customSlots` FOUR: 16 floats an instance even when only slot 0 is
     * used (it says so once in the console). Code that writes the array
     * itself must use `itemSize`, or declare `customSlots` first (1 for 4
     * floats an instance). Since API_MINOR 9 an array of another stride
     * than the declared slots', or whose length is not the capacity times
     * its stride, is a TypeError at `setCustomAt` and at the frame's sync,
     * where it used to draw garbage. Culled, the engine draws instances in an order
     * of its own: to tell them apart, keep an index here (or set
     * `frustumCulled` false). */
    instanceCustom: BufferAttribute | null;
    /** Since API_MINOR 9: the custom vec4 slots each instance keeps (1 to
     * 4; a RangeError at `setCustomAt` otherwise), so `instanceCustom` is
     * `customSlots × 4` floats an instance: 1 keeps 4 where `setCustomAt`
     * would make 16. Set it before the first `setCustomAt`; a slot past it
     * is a RangeError, slots past it read as zeros, and an
     * `instanceCustom` of another stride is a TypeError. Undefined (the
     * default) keeps API_MINOR 7's four slots. */
    customSlots: number | undefined;
    setMatrixAt(index: number, matrix: Matrix4): void;
    getMatrixAt(index: number, target: Matrix4): void;
    /** Multiplies the material color (default white). */
    setColorAt(index: number, color: Color): void;
    getColorAt(index: number, target: Color): void;
    /** Custom vec4 `slot` (0 to 3, default 0) of an instance (since
     * API_MINOR 7). */
    setCustomAt(index: number, value: Vector4, slot?: number): void;
    getCustomAt(index: number, target: Vector4, slot?: number): void;
    /** The box and sphere around its first `count` instances (three.js;
     * since API_MINOR 18; null until computed). */
    boundingBox: Box3 | null;
    boundingSphere: Sphere | null;
    computeBoundingBox(): void;
    computeBoundingSphere(): void;
  }
  /** Points (three.js `Points`): a square per vertex of the geometry's
   * `position` in its draw range, colored by its `color` attribute when the
   * material has `vertexColors`. Each point counts as a mesh instance (a
   * scene draws at most 65,536 points in 1,024 Points objects); points cast
   * no shadows. */
  export class Points extends Object3D {
    constructor(geometry?: BufferGeometry, material?: PointsMaterial);
    geometry: BufferGeometry;
    material: PointsMaterial;
  }
  /** A line through the geometry's `position` vertices (three.js `Line`,
   * since API_MINOR 17), by its index when it has one, within its draw
   * range, drawn one pixel wide with a `LineBasicMaterial` (another
   * material is a TypeError as the scene syncs). Lines cast no shadows,
   * take no part in ambient occlusion or the scene-depth texture
   * (`renderer.sceneDepth`), are culled by their vertices' bounds, and
   * rays pass through them (three.js's line picking and
   * `raycaster.params.Line` are not supported). A geometry a line draws
   * makes a line mesh, counted against the mesh budget, which lines
   * drawing that geometry alike (the same kind, with or without its
   * colors) share; changing its positions, colors, index or draw range
   * makes it again. */
  export class Line extends Object3D {
    constructor(geometry?: BufferGeometry, material?: LineBasicMaterial);
    readonly isLine: true;
    geometry: BufferGeometry;
    material: LineBasicMaterial;
  }
  /** Separate segments between vertices 0 and 1, 2 and 3… (three.js
   * `LineSegments`): what `EdgesGeometry` gives draws so. */
  export class LineSegments extends Line {
    readonly isLineSegments: true;
  }
  /** A line closed back to its first vertex (three.js `LineLoop`). */
  export class LineLoop extends Line {
    readonly isLineLoop: true;
  }
  /** A quad facing the view; `scale.x`/`scale.y` are its size (world units)
   * and `center` the point placed at its position (0–1 from bottom-left).
   * Sprites cast no shadows. */
  export class Sprite extends Object3D {
    constructor(material?: SpriteMaterial);
    material: SpriteMaterial;
    readonly center: Vector2;
  }

  // -- Cameras ------------------------------------------------------------------
  /** Objects and lights parented to a camera (a held item, a headlamp) draw
   * only once the camera itself is added to the scene, as in three.js. */
  export abstract class Camera extends Object3D {
    near: number;
    far: number;
    /** As three.js: from API_MINOR 20 from the camera's own aspect or
     * edges; before it for the window's current aspect (or the camera's
     * view offset, when one is set). */
    readonly projectionMatrix: Matrix4;
    readonly projectionMatrixInverse: Matrix4;
    readonly matrixWorldInverse: Matrix4;
  }
  /** A camera's view offset (three.js `camera.view`, since API_MINOR 16):
   * what `setViewOffset` sets. Its fields may be changed in place, as in
   * three.js; the scene's sync reads them. */
  export interface CameraView {
    enabled: boolean;
    fullWidth: number;
    fullHeight: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }
  /** Looks down its -Z. `fov` is the vertical field of view in degrees
   * (three.js). From API_MINOR 20 the projection takes `aspect` as three.js
   * does (a game keeps it at the window's, `engine.frame()`'s width over
   * height, or the image stretches); before it the aspect follows the
   * window. `far` may be Infinity. */
  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    /** From API_MINOR 20 always the projection's, as three.js's. Before it
     * ignored without a view offset (the window's aspect is used); with
     * one, the projection uses it as three.js does (`setViewOffset` sets
     * it to `fullWidth / fullHeight`). */
    aspect: number;
    /** three.js's view offset (since API_MINOR 16): null until
     * `setViewOffset`; `enabled` false after `clearViewOffset`. */
    view: CameraView | null;
    /** three.js `setViewOffset` (since API_MINOR 16): the window shows the
     * `width` × `height` part at `x`, `y` (from the top-left corner, y down)
     * of a `fullWidth` × `fullHeight` image the camera would fill, in any
     * units, and `aspect` becomes `fullWidth / fullHeight`. The projection
     * is then three.js's own, which moves its centre: say,
     * `setViewOffset(w, h, -panel, 0, w + panel, h)` keeps what the camera
     * looks at centred in the window's right `w` beside a `panel` on the
     * left. A size of 0 or a value that is not finite draws nothing, as in
     * three.js. Natively and in browsers alike. */
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
    /** three.js `clearViewOffset` (since API_MINOR 16): the projection is
     * centered on the window's aspect again. */
    clearViewOffset(): void;
    /** Kept for ports; projection changes apply without it. */
    updateProjectionMatrix(): void;
  }
  /** From API_MINOR 20 three.js's projection: `left`, `right`, `top`,
   * `bottom` (asymmetric ones too) and `zoom` as given, whatever the
   * window's aspect (a game keeps `right - left` at the window's aspect
   * times `top - bottom`, or the image stretches, as in three.js; nothing
   * changes them when the window does). Before it the view is centered:
   * `top - bottom` sets its height in world units and the width follows
   * the window's aspect (`left`/`right` are kept but not used for the
   * extent, unless a view offset is set). */
  export class OrthographicCamera extends Camera {
    constructor(left?: number, right?: number, top?: number, bottom?: number, near?: number, far?: number);
    left: number;
    right: number;
    top: number;
    bottom: number;
    zoom: number;
    /** three.js's view offset (since API_MINOR 16), as
     * `PerspectiveCamera.view`. */
    view: CameraView | null;
    /** three.js `setViewOffset` (since API_MINOR 16): while it is set the
     * projection is three.js's from `left`, `right`, `top`, `bottom` and
     * `zoom` (so `right - left` should keep the window's aspect), showing
     * the `width` × `height` part at `x`, `y` of the `fullWidth` ×
     * `fullHeight` image they span. */
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
    /** three.js `clearViewOffset` (since API_MINOR 16). */
    clearViewOffset(): void;
    updateProjectionMatrix(): void;
  }

  // -- Lights ---------------------------------------------------------------------
  // Intensities are in the engine's convention (top of file). At most 16
  // lights besides ambient light draw, and four shadow-casting lights: the
  // first four directional or spot lights (in scene order) with
  // `castShadow` cast, each with its own shadow map; other lights' shadows
  // are ignored.
  export abstract class Light extends Object3D {
    color: Color;
    intensity: number;
  }
  /** Adds to every surface's base color (ambient lights add up). */
  export class AmbientLight extends Light {
    constructor(color?: ColorInput, intensity?: number);
  }
  /** Shadow settings of a casting light. */
  export interface LightShadow {
    /** The shadow map's size, 64–4096: a number, or three.js's vector (its
     * larger side). Since API_MINOR 14 the graphics level holds it to its
     * `shadowMapSize` (512 at quantum, 1024 atomic and molecular, 2048
     * cellular and terrestrial, 4096 above) for games declaring
     * `engine.minor=14` or later. */
    mapSize: number | Vector2;
    /** Directional: how far along the view shadows reach (default 40 m);
     * spot: how far from the light. */
    distance: number;
    /** Depth bias with three.js's sign: negative values (default −0.0005)
     * offset depths toward the light against shadow acne; positive values
     * act as 0. */
    bias: number;
    /** Normal offset in shadow-map texels (default 1.5). */
    normalBias: number;
    /** Spot: the shadow camera's near plane (default 0.5 m). */
    near: number;
    /** Spot: the part of the cone the shadow map covers, 0 < focus ≤ 1
     * (three.js `shadow.focus`, default 1). */
    focus: number;
    /** Since API_MINOR 9: the softness of the shadow's edge, the spacing
     * of its filter's nine samples in shadow-map texels, 0–16 (three.js
     * `shadow.radius` with `PCFShadowMap`; default 1, as before; 0 a hard
     * edge). Outside 0–16 the light's sync throws. */
    radius: number;
    /** three.js's shadow camera: its `near` and `far` are `near` and
     * `distance`. */
    readonly camera: { near: number; far: number };
  }
  /** Light from `position` toward `target`'s position (three.js); both may
   * be anywhere in the graph. */
  export class DirectionalLight extends Light {
    constructor(color?: ColorInput, intensity?: number);
    target: Object3D;
    readonly shadow: LightShadow;
  }
  /** `distance` is where its light ends (0: no limit); falls off with the
   * distance to the power `decay` (2, the inverse square, as glTF). */
  export class PointLight extends Light {
    constructor(color?: ColorInput, intensity?: number, distance?: number, decay?: number);
    distance: number;
    decay: number;
  }
  /** A cone toward `target`: `angle` (radians, at most π/2) is its edge and
   * `penumbra` (0–1) the fraction of it that fades out. Point lights cast no
   * shadows; spot lights can. */
  export class SpotLight extends Light {
    constructor(color?: ColorInput, intensity?: number, distance?: number, angle?: number, penumbra?: number, decay?: number);
    target: Object3D;
    distance: number;
    angle: number;
    penumbra: number;
    decay: number;
    readonly shadow: LightShadow;
  }
  /** Sky color from above blending to the ground color from below, by the
   * surface normal; it multiplies the whole base color (three.js only the
   * diffuse part). */
  export class HemisphereLight extends Light {
    constructor(skyColor?: ColorInput, groundColor?: ColorInput, intensity?: number);
    groundColor: Color;
  }

  // -- Fog and the scene ----------------------------------------------------------
  /** None before `near`, rising smoothly to full at `far` (beyond `near`).
   * Since API_MINOR 9 `near` may be below 0: the camera already in fog,
   * the smoothstep starting behind it. */
  export class Fog {
    constructor(color: ColorInput, near?: number, far?: number);
    color: Color;
    near: number;
    far: number;
  }
  /** `1 - exp(-(density × depth)²)`. */
  export class FogExp2 {
    constructor(color: ColorInput, density?: number);
    color: Color;
    density: number;
  }
  /** The scene the runtime draws (there is one: `scene`). */
  export class Scene extends Object3D {
    #private;
    private constructor();
    /** What is behind everything (three.js), in the window and in
     * `renderer.render(scene, camera)` passes into a render target (which
     * once took only `renderer.setClearColor`): a Color clears
     * to it (a pass of the scene clears to it whatever `autoClear` says,
     * as three.js's does), never tone mapped; before API_MINOR 20 the
     * window's was tone mapped with the scene when post effects or
     * multisampling drew it (from API_MINOR 20 only when a `renderer.post`
     * program reads the scene); null keeps black (a pass the renderer's clear
     * color). Since API_MINOR 18 a texture too, drawn over the clear
     * behind everything, unfogged, tone mapped unless its `colorSpace` is
     * `SRGBColorSpace` (three.js r16x's `WebGLBackground`):
     * - a Texture or CanvasTexture of `UVMapping` (the default) stretched
     *   over the view, its UVs from the view's bottom left as a plane's
     *   through its `offset`, `repeat`, `rotation` and `center` (three.js
     *   leaves the aspect to them: `repeat.x = viewAspect / imageAspect`
     *   and `offset.x = (1 - repeat.x) / 2` cover a wider view);
     * - a sky in every direction: a CubeTexture (its images at full
     *   detail: package paths load through `TextureLoader` once, counted
     *   against the image budget like any texture; nothing shows until all
     *   six have; one that cannot load shows the environment instead), a
     *   texture whose `mapping` is `EquirectangularReflectionMapping` (or
     *   `EquirectangularRefractionMapping`), or a PMREM texture
     *   (`PMREMGenerator`'s, which shows its prefiltered 512 × 256 image).
     *   `backgroundBlurriness` above 0 shows the sky's prefiltered
     *   environment at that roughness (made as `scene.environment` makes
     *   one, and shared with it for the same texture: it shows a few frames
     *   later); a `FloatType` DataTexture's light past 1 comes from it too.
     *   Other values draw nothing. */
    background: Color | Texture | null;
    /** Since API_MINOR 18: a sky background's blur, 0 (sharp, the
     * default) to 1 (three.js `backgroundBlurriness`; clamped). */
    backgroundBlurriness: number;
    /** Since API_MINOR 18: a texture or sky background's light is its
     * image's times this (three.js `backgroundIntensity`; default 1). */
    backgroundIntensity: number;
    /** Since API_MINOR 18: turns a sky background (three.js
     * `backgroundRotation`, as `environmentRotation` turns the
     * environment). */
    readonly backgroundRotation: Euler;
    fog: Fog | FogExp2 | null;
    /** Lights standard, physical and Lambert materials without an `envMap`
     * (three.js): a PMREM texture, a latitude-longitude texture or a
     * CubeTexture (made into a prefiltered environment once per texture
     * version; one that cannot be lights nothing, with a warning). */
    environment: Texture | null;
    /** Default 1. */
    environmentIntensity: number;
    /** Turns the environment (three.js `environmentRotation`). */
    readonly environmentRotation: Euler;
  }
  export const scene: Scene;

  /** Bloom, three.js `UnrealBloomPass(resolution, strength, radius,
   * threshold)` as it computes it: linear light whose luminance passes
   * `threshold` is taken at half of `resolution` (the fraction of the frame
   * the pass renders at, as a pass sized by its own `setSize`), blurred into
   * five halved levels and added back, weighted by `strength` and `radius`
   * (tight 0 to wide 1). As three.js adds the sum with additive blending
   * by its alpha, the light added is 3 × strength² times the weighted
   * levels. Fields left out take the defaults. */
  export interface BloomSettings {
    /** 0–65504, default 1 (`intensity`, accepted too, is its earlier name). */
    strength?: number;
    /** 0–1, default 0. */
    radius?: number;
    /** 0–65504, default 0: above 1 only over-bright light (emissive
     * surfaces driven past 1) blooms. */
    threshold?: number;
    /** 0.125–1, default 1. */
    resolution?: number;
    /** @deprecated The strength's earlier name. */
    intensity?: number;
  }
  /** Ground-truth ambient occlusion, three.js r176's `GTAOPass` with
   * `OUTPUT.Default` (its `updateGtaoMaterial` and `updatePdMaterial`
   * settings, `blendIntensity` and the fraction of the frame it renders
   * at): the scene's meshes (not sprites, points or `noAO` objects) are
   * drawn again as view-space normals and depth, front faces only; each
   * pixel's occlusion comes from horizons searched within `radius` over
   * `samples` steps, denoised, and multiplied into the light as
   * `mix(1, occlusion, blendIntensity)` before bloom and tone mapping.
   * Fields left out take three.js's defaults. */
  export interface AmbientOcclusionSettings {
    /** 0–1, default 1. */
    blendIntensity?: number;
    /** View units, above 0 up to 1000, default 0.25. */
    radius?: number;
    /** 0–16, default 1. */
    distanceExponent?: number;
    /** View units, 0–1000, default 1. */
    thickness?: number;
    /** The occlusion raised to this power, 0–16, default 1. */
    scale?: number;
    /** Whole, 1–64, default 16. */
    samples?: number;
    /** 0–1, default 1. */
    distanceFallOff?: number;
    /** 0.125–1, default 1. */
    resolution?: number;
    /** The Poisson denoise (`PoissonDenoiseShader`). three.js r176 keeps
     * its disk's radius exponent at 1 until `updatePdMaterial` changes the
     * samples, rings or exponent, and then uses 2 unless told otherwise:
     * to match a call such as `updatePdMaterial({ samples: 8 })`, pass
     * `radiusExponent: 2`. */
    denoise?: {
      /** Above 0 up to 10000, default 10. */
      lumaPhi?: number;
      /** Above 0 up to 10000, default 2. */
      depthPhi?: number;
      /** 0–16, default 3. */
      normalPhi?: number;
      /** Pixels, 0–64, default 8. */
      radius?: number;
      /** 0–16, default 2. */
      rings?: number;
      /** Whole, 1–64, default 16. */
      samples?: number;
      /** 0–16, default 1. */
      radiusExponent?: number;
    };
  }
  /** A color grade with a vignette. In `space` "linear" (the default) it
   * comes after bloom and before the output's tone mapping (as a three.js
   * `ShaderPass` before `OutputPass` sees the light), on linear light
   * clamped to 0–1: an S-curve (`c²(3 − 2c)`) blended in by `contrast`,
   * saturation around Rec. 601 luma, the result times `shadows`' tint
   * turning into `highlights'` by a smoothstep of that luma from
   * `split[0]` to `split[1]`, clamped, all blended with the ungraded light
   * by `amount`; then light times `1 − vignette.amount × smoothstep(inner,
   * outer, d)`, `d` the length of the offset from the frame's center in
   * texture coordinates (0–1 across) with each axis times
   * `vignette.scale`. Fields left out change nothing (the clamp aside).
   *
   * In `space` "display" (since API_MINOR 11) it works per channel on the
   * tone-mapped, sRGB-encoded color `c` (clamped to 0–1), as a web page's
   * canvas grade, in the same pass at no extra cost on every tier:
   *   l = 0.2126 c.r + 0.7152 c.g + 0.0722 c.b      (Rec. 709 luma)
   *   k = night.brightScale > 0
   *       ? min(1, night.amount × night.brightScale) : 1
   *   spare = max(smoothstep(night.warm[0], night.warm[1], c.r − c.b),
   *               smoothstep(night.bright[0], night.bright[1], l) × k)
   *   n = night.amount × (1 − spare)
   *   g = mix(l, c, saturation
   *                 × (1 + night.spareSaturation × night.amount × spare)
   *                 × (1 − night.desaturate × n))
   *   g = (g − 0.5) × (1 + contrast) + 0.5
   *   g ×= mix(shadows, highlights, smoothstep(split[0], split[1], l))
   *   g ×= mix(1, night.tint, n)
   *   g ×= 1 + lift.amount × smoothstep(lift.range[0], lift.range[1], l)
   *   g += flash                       (flashSpace "display" only)
   *   result = mix(c, clamp(g, 0, 1), amount) × the vignette's factor
   * (`mix(a, b, t) = a + (b − a)t`). Defaults leave each term out, so
   * "display" with defaults is the plain saturation and contrast grade.
   * The night desaturates before the split tints, so it does not grey
   * them. `flash` is linear light added before tone mapping unless
   * `flashSpace` is "display". Where post effects use 8-bit color the
   * display grade still runs, without a linear flash (a display-space
   * flash stays). */
  export interface GradeSettings {
    /** Since API_MINOR 11, default "linear". */
    space?: "linear" | "display";
    /** Linear: the S-curve's weight, 0–1. Display: the slope about 0.5
     * less one, −1–3. Default 0. */
    contrast?: number;
    /** 0–4, default 1. */
    saturation?: number;
    /** RGB multipliers (linear light, or encoded values in display space),
     * each 0–4, default [1, 1, 1]. */
    shadows?: readonly [number, number, number];
    highlights?: readonly [number, number, number];
    /** Rising, each 0–1; default [0, 1] linear, [0.2, 0.8] display. */
    split?: readonly [number, number];
    /** 0–1, default 1. */
    amount?: number;
    vignette?: {
      /** 0–1, default 0. */
      amount?: number;
      /** 0–2 with `outer` beyond `inner`; defaults 0.5 and 1. */
      inner?: number;
      outer?: number;
      /** Each 0–4, default [1, 1]; [aspect ratio, 1] makes it round. */
      scale?: readonly [number, number];
    };
    /** Since API_MINOR 9: linear light added to the whole frame before the
     * grade and the tone mapping (a lightning flash), each 0–65504,
     * default [0, 0, 0]. Like the grade, it needs the post effects' half
     * floats (it is left out where they do not render). */
    flash?: readonly [number, number, number];
    /** Since API_MINOR 11, display space only (a RangeError in linear
     * space), default "linear": "display" adds `flash` to the graded
     * display color after the night and the lift (so moonlight neither
     * tints nor greys a lightning flash; values past 1 just reach white)
     * instead of to the light before tone mapping. */
    flashSpace?: "linear" | "display";
    /** Since API_MINOR 11, display space only (a RangeError in linear
     * space): a night look that desaturates and tints all but warm or
     * bright pixels (fire, lamplight). */
    night?: {
      /** 0–1, default 0 (no night). */
      amount?: number;
      /** How far toward gray at full night, 0–1, default 1. */
      desaturate?: number;
      /** Moonlight multiplier, each 0–4, default [1, 1, 1]. */
      tint?: readonly [number, number, number];
      /** Red minus blue over which pixels are spared, rising, each −1–2;
       * default [1, 2] (none). */
      warm?: readonly [number, number];
      /** Luma over which pixels are spared, rising, each −1–2; default
       * [1, 2] (none). */
      bright?: readonly [number, number];
      /** Since API_MINOR 11: extra saturation of spared pixels at night
       * (fire and lamplight glow richer in the dark): their saturation
       * times `1 + spareSaturation × amount × spare`, 0–4, default 0. */
      spareSaturation?: number;
      /** Since API_MINOR 11: 0 (the default) spares bright pixels whatever
       * the night; above 0 (0–4) their spare is scaled by
       * `min(1, amount × brightScale)`, so near-white keeps its color only
       * as the night deepens (the warm spare is unchanged). */
      brightScale?: number;
    };
    /** Since API_MINOR 11, display space only: highlights times
     * `1 + amount` (0–4, default 0) as luma rises through `range` (rising,
     * each 0–1, default [0.5, 1]). */
    lift?: { amount?: number; range?: readonly [number, number] };
  }
  /** `renderer.post`'s program (since API_MINOR 9), in the custom
   * materials' WGSL and sandbox. `pixel` declares
   * `fn pixel(p: Pixel) -> vec4f`, each pixel's linear light (its alpha
   * the coverage: keep `scene_color(p.uv).a`), given
   *   struct Pixel { uv: vec2f, coord: vec4f }  uv 0..1 from the top left,
   *                                             coord the pixel's position
   *   fn scene_color(uv: vec2f) -> vec4f   the scene's linear light
   *   fn scene_depth(uv: vec2f) -> f32     view depth of the nearest
   *                                        opaque surface (65504: none)
   *   fn world_position(uv: vec2f, depth: f32) -> vec3f
   *   fn camera_position() -> vec3f, fn screen_size() -> vec2f
   *   fn srgb_to_linear, fn linear_to_srgb
   *   uniforms (numbers, vectors, matrices and vec4/matrix arrays; no
   *   textures), 64 floats in whole vec4 slots; defines as constants. */
  export interface PostShader {
    pixel: string;
    uniforms?: Record<string, ShaderUniform>;
    defines?: Record<string, number | boolean>;
  }
  /** Anti-aliasing: none, three.js's `FXAAShader` or `SMAAPass` (SMAA 1x)
   * after the output, or 4× multisampling resolved before the other
   * effects. */
  export type AntialiasMode = "off" | "fxaa" | "smaa" | "msaa";

  /** How the scene is drawn. The game decides the camera, lights, shadows
   * on or off, fog, tone mapping, materials and the post effects, in
   * three.js r176's `EffectComposer` order (since API_MINOR 4): the scene
   * in linear half-float color (multisampled with `antialias: "msaa"`),
   * `ao`, `bloom`, `grade`, the output (`toneMapping`, exposure, sRGB) and
   * FXAA or SMAA; the player's graphics settings decide the shadow maps'
   * largest size and multisampling's samples (since API_MINOR 14, by the
   * graphics level) and the frame rate, and a game usually picks its
   * effects by `frame().quality` or `levelSettings()`. Light is linear and may exceed
   * 1 (half-float range); `toneMapping` maps it to the display (none:
   * clamped at 1). Effects that are off cost nothing; ones the device
   * cannot run or that pass the GPU budget are left out with a note in
   * Options (ambient occlusion first, then bloom, SMAA falling back to
   * FXAA). Assigning a setting checks it: a TypeError for a value of the
   * wrong type, a RangeError for one out of range (and the same, at the
   * end of the frame, for an object changed afterwards). */
  export interface Renderer {
    /** The camera the scene is seen through; nothing 3D draws without one.
     * It need not be in the scene graph. */
    camera: Camera | null;
    readonly shadowMap: { enabled: boolean };
    /** Null (the default) for none. */
    bloom: BloomSettings | null;
    /** Null (the default) for none. */
    ao: AmbientOcclusionSettings | null;
    /** Null (the default) for none. */
    grade: GradeSettings | null;
    /** Since API_MINOR 9: the game's own full-screen pass over the scene's
     * light and depth (a thermal or night-vision view, height fog over
     * everything, a screen-space curve), or null (the default). It runs
     * after the scene is drawn and its ambient occlusion, before bloom,
     * the grade and the tone mapping, on the post effects' half floats
     * (setting it brings them along; where they do not render it is left
     * out with a note in Options), in window frames (not render-target
     * passes). The scene's depth is drawn first, as for `sceneDepth`
     * (opaque objects only). Refused code is logged once and the scene
     * draws without it. */
    post: PostShader | null;
    /** Default "off". "msaa" takes 4 samples; since API_MINOR 14 the
     * graphics level's `msaaSamples` (8 at cosmic and infinite, lowered to
     * what the device supports) for games declaring `engine.minor=14` or
     * later. */
    antialias: AntialiasMode;
    /** three.js `toneMapping` (`NoToneMapping`, `LinearToneMapping`,
     * `ReinhardToneMapping`, `CineonToneMapping`, `ACESFilmicToneMapping`,
     * `AgXToneMapping`, `NeutralToneMapping`) with `toneMappingExposure`
     * (default 1), applied to everything the scene draws. */
    toneMapping: number;
    toneMappingExposure: number;
    /** Kept for ports; output is sRGB. */
    outputColorSpace: string;

    // Render targets (since API_MINOR 8). The scene draws itself every
    // frame; `render` draws into a render target.
    /** The target `render` and `clear` draw into, or null (the default). */
    setRenderTarget(target: RenderTarget | null): void;
    getRenderTarget(): RenderTarget | null;
    /** Whether `render` clears the target to the clear color first
     * (default true, as three.js). Set it false to draw over what the
     * target holds: decals added over many frames, drawing only the new
     * ones. */
    autoClear: boolean;
    /** The area of the render target `render` and `clear` draw into, from
     * its bottom left, in its pixels (three.js); `setRenderTarget` sets it
     * to the target's `viewport`. A pass into an area clears and draws only
     * there (the area also scissors), the rest of the target kept: icons
     * rendered into the cells of one atlas target. The camera's aspect is
     * the game's (three.js's `camera.aspect`); a perspective camera here
     * takes the area's. A RangeError at `render` for an area that does not
     * lie within the target. */
    setViewport(x: number, y: number, width: number, height: number): void;
    setViewport(viewport: Vector4): void;
    getViewport(target: Vector4): Vector4;
    /** The color (and alpha, default 1) targets clear to (default black). */
    setClearColor(color: ColorInput, alpha?: number): void;
    getClearColor(target: Color): Color;
    setClearAlpha(alpha: number): void;
    getClearAlpha(): number;
    /** Draws `object` and everything under it, as they are when it is
     * called, through `camera` into the render target (three.js `render`):
     * a `Group` kept out of the scene (an icon stage with its own lights, a
     * batch of new decals) or the scene itself. Several calls in one frame
     * draw in order, each with the objects as they were then (one stage
     * gives many icons in a frame), before the frame's scene, so a material
     * showing the target shows this frame's drawing. Materials are taken
     * as they are at the call too, as three.js draws at once: color,
     * opacity, blending and a custom material's `uniforms` values. One
     * material stamped several times a frame with different uniforms
     * between the calls draws each pass with that call's values (on every
     * backend; since API_MINOR 8). The window's scene, drawn at the
     * frame's end, takes the values they have then. The object is placed
     * by its parents, and only the lights under it light it; drawing the
     * scene brings its fog, environment and background (a background
     * color clears the area even without `autoClear`). Target passes draw
     * without shadows and post effects (`bloom`, `ao`, `grade`, `antialias`), with
     * `toneMapping`. A target's own texture cannot show in its pass (the
     * pass is left out with a warning). Without a render target set, it
     * does nothing (three.js ports calling it every frame keep working). A
     * TypeError for an object that is not an Object3D, a camera that is not
     * a Camera, or a disposed target; a RangeError past 256 passes a frame,
     * or past 65,536 objects drawn by a frame's passes together. */
    render(object?: Object3D, camera?: Camera): void;
    /** Clears the render target to the clear color (nothing without one). */
    clear(): void;
    /** Since API_MINOR 8: the scene's depth as a texture for custom
     * materials (soft particles, shorelines): give it as a texture uniform
     * and read red, the view depth (world units along the camera's forward
     * axis) of the nearest opaque surface behind the fragment, at its
     * window position:
     * `textureSampleLevel(depth, depth_sampler, screen_uv(f.coord), 0.0).r`,
     * compared with `view_depth(f.world)`. It holds the opaque objects
     * (not blended, writing depth, not points, past alpha tests and vertex
     * hooks) of the frame's scene, and 65504 where there are none. When a
     * frame's objects sample it, the renderer first draws those opaque
     * objects' depth (a prepass without shadows: their vertex work again,
     * plus 12 bytes a pixel of the window); objects that sample it are not
     * in it. Half floats keep about a two-thousandth of the distance.
     * Render-target passes read the last frame's; where the device cannot
     * render half floats it stays 65504. Nearest filtering by default (one
     * object a game; disposing it does nothing). */
    readonly sceneDepth: Texture;
    /** Since API_MINOR 9: the frame this call makes, as the PNG bytes of a
     * screenshot (a photo mode): the scene, and with `ui: true` the game's
     * 2D overlay (`starhermit:draw`, `starhermit:ui`) over it, as drawn,
     * opaque, at the window's drawable size. Never the runtime's own
     * interface (Options, prompts, the not-responding screen, the
     * on-screen touch controls), which is drawn after the capture is read:
     * nothing the game could not draw. A frame larger than 3840 × 2160 is
     * halved until it fits. The frame is read back as the runtime draws it
     * and encoded off the drawing (natively on a thread, in browsers by
     * the browser), so it settles a frame or more later and the game's
     * frames go on meanwhile. Captures asked for in one frame all hold that
     * frame (the same PNG for the same `ui`), and one asked for while
     * earlier ones encode holds its own; at most 4 wait at once (a fifth
     * rejects with `InvalidStateError`). One that could not be read, or
     * was not encoded within 60 s, rejects with `EncodingError`: every
     * capture settles. It needs no press; saving it does:
     * `files.saveAs("photo.png", await renderer.capture(), { type:
     * "image/png" })` in the press's handler. Since API_MINOR 15 a capture
     * asked for while uploads wait past a frame's upload bound
     * (`engine.usage().waitingUploads`) holds the first frame that has sent
     * every mesh and image made before it. */
    capture(options?: { ui?: boolean }): Promise<Uint8Array>;
  }
  export const renderer: Renderer;

  // -- Picking ----------------------------------------------------------------------
  export interface Intersection {
    readonly distance: number;
    readonly point: Vector3;
    readonly object: Object3D;
    /** The face's world-space normal. */
    readonly normal: Vector3;
    /** Which instance of an InstancedMesh. */
    readonly instanceId?: number;
    readonly uv?: Vector2;
  }
  /** Rays against meshes' triangles (sprites by their quads), nearest first.
   * Only objects in the scene and visible are hit (as drawn: a raycast
   * sends the frame's changes first). Tests at most 1,000,000 triangles a
   * call (RangeError). */
  export class Raycaster {
    constructor(origin?: Vector3, direction?: Vector3, near?: number, far?: number);
    near: number;
    far: number;
    /** A Ray since API_MINOR 18. */
    readonly ray: Ray;
    /** three.js's per-kind settings, kept for ports (since API_MINOR 17);
     * not read: rays pass through lines and points. */
    params: Record<string, Record<string, unknown>>;
    /** The layers objects are tested on (since API_MINOR 18): an object is
     * hit when its `layers` share one with these (layer 0 by default). As
     * three.js tests layers and not visibility, from API_MINOR 18
     * (`engine.minor=18`) invisible objects, and objects under invisible
     * parents, are hit when their layers match (ports pick with invisible
     * proxy meshes; the ray's sync then sends invisible subtrees too).
     * Games declaring an older minor keep invisible objects unhit. Only
     * objects in the scene are hit, as before. */
    layers: Layers;
    /** The camera of the last `setFromCamera` (since API_MINOR 18). */
    camera: Camera | null;
    set(origin: Vector3, direction: Vector3): void;
    /** From normalized device coordinates (−1..1, y up) through a camera. */
    setFromCamera(coords: Vector2, camera: Camera): void;
    /** Hits nearest first; since API_MINOR 18 appended to `intersects`
     * (sorted with what it held), as three.js. */
    intersectObject(object: Object3D, recursive?: boolean, intersects?: Intersection[]): Intersection[];
    intersectObjects(objects: readonly Object3D[], recursive?: boolean, intersects?: Intersection[]): Intersection[];
  }
  /** Window pixels to normalized device coordinates for `setFromCamera`. */
  export function pointerToNdc(x: number, y: number, target?: Vector2): Vector2;
}

// ===========================================================================
declare module "starhermit:canvas" {
  import type { DOMExceptionName } from "starhermit:engine";

  // Offscreen 2D canvases in the HTML Canvas 2D model, rasterized by the
  // engine (`starhermit-canvas`), usable as scene textures and overlay
  // images. Supported members keep the web's names and semantics; invalid
  // string settings (colors, fonts, enum values) are ignored as on the web,
  // and non-finite path or drawing arguments do nothing. Bounds: 4,096
  // pixels on a side and 8,388,608 pixels per canvas, 100,000 path segments
  // and 524,288 points per draw, 4,096 characters per text call, 1,024
  // gradient stops, 256 dash entries, 1,024 nested saves, 32 MiB of clip
  // masks, shadow blur at most 512, and about 0.2 s of drawing work per
  // call (each text character counts); past one a call throws a RangeError
  // ("canvas work budget spent" for the work). All canvases and image
  // bitmaps of a game together hold at most 256 MiB (RangeError).
  //
  // Large textures: a canvas is at most 8,388,608 pixels (4096 × 2048) and
  // a game's images share 56 MiB of GPU memory unless its manifest raises
  // the budget (`engine.limits.image_mib`, up to 512 MiB since
  // API_MINOR 9), mipmaps adding a third; a 4096 × 4096 image with mipmaps
  // alone would take 85 MiB. Draw
  // repeating detail (line markings, grass, tiles) once on a small canvas
  // and repeat it (`texture.wrapS = wrapT = RepeatWrapping` with
  // `texture.repeat`), or split a large surface into several meshes, each
  // with its own canvas of at most 2048 pixels a side.
  // Not supported: `filter`, `imageSmoothingQuality` above "low" (it is
  // recorded only), `fontStretch`, `fontVariantCaps`, `textRendering`,
  // `lab()`/`lch()`/`oklab()`/`oklch()`/`color()` colors, `currentcolor`
  // (black), focus rings, `isContextLost`, blobs and transfers.

  /** A drawable image: `drawImage`, patterns and `ImageBitmap` sources. */
  export type CanvasImageSource = OffscreenCanvas | ImageBitmap;

  export class OffscreenCanvas {
    /** At most 4,096 pixels on a side and 8,388,608 pixels in all (4096 ×
     * 2048, or 2896 × 2896), natively and in browsers alike (the engine
     * draws canvases itself, not the browser): a RangeError past either,
     * also when `width` or `height` is set; 0 is allowed (draws nothing). */
    constructor(width: number, height: number);
    /** Setting either clears the canvas and resets its context's state. */
    width: number;
    height: number;
    /** The one 2D context of this canvas (other types return null). */
    getContext(contextId: "2d", options?: { alpha?: boolean; willReadFrequently?: boolean }): OffscreenCanvasRenderingContext2D;
    getContext(contextId: string): null;
    /** A copy of the current pixels as an image. */
    transferToImageBitmap(): ImageBitmap;
  }
  /** A decoded image (package PNG and WebP images, a canvas copy). */
  export class ImageBitmap {
    #private;
    private constructor();
    readonly width: number;
    readonly height: number;
    /** Releases it; drawing it afterwards throws `InvalidStateError`. */
    close(): void;
  }
  /** Decodes a package image or image bytes, PNG or WebP (an animated
   * WebP's first frame; rejects with an Error named `EncodingError` for
   * data it cannot decode, a RangeError past 4,096 pixels on a side). Images
   * decode off the game's thread, two at a time, and settle as a frame
   * begins; at most 128 wait at once, an image's bytes are at most 16 MiB
   * and those waiting at most 64 MiB together (RangeError, before they are
   * copied). A package image is read without waiting for it (see
   * `PackageFiles`). ImageData and canvases are copied at once. */
  export function createImageBitmap(source: string | Uint8Array | ArrayBuffer | ImageData | OffscreenCanvas): Promise<ImageBitmap>;

  /** Straight-alpha RGBA8 pixels, as the web's. */
  export class ImageData {
    /** `IndexSizeError` for a zero size; RangeError past the pixel bound. */
    constructor(width: number, height: number);
    /** `data.length` must be `width × height × 4` (`IndexSizeError`). */
    constructor(data: Uint8ClampedArray, width: number, height?: number);
    readonly width: number;
    readonly height: number;
    readonly data: Uint8ClampedArray;
    readonly colorSpace: "srgb";
  }

  /** The web's `DOMMatrix2DInit` subset. */
  export interface DOMMatrix2DInit {
    a?: number;
    b?: number;
    c?: number;
    d?: number;
    e?: number;
    f?: number;
  }
  export interface DOMMatrix2D {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
    readonly is2D: true;
    readonly isIdentity: boolean;
  }

  /** Path data reusable across draws (and SVG path strings: the path up to
   * the first error is kept, as browsers do). */
  export class Path2D {
    constructor(path?: Path2D | string);
    addPath(path: Path2D, transform?: DOMMatrix2DInit): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    /** `IndexSizeError` for a negative radius. */
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    /** 1–4 radii (numbers or `{x, y}`); a negative radius throws a
     * RangeError, as on the web. */
    roundRect(x: number, y: number, w: number, h: number, radii?: number | { x: number; y: number } | readonly (number | { x: number; y: number })[]): void;
  }

  export class CanvasGradient {
    #private;
    private constructor();
    /** Offset 0–1 (`IndexSizeError` outside; TypeError non-finite); a bad
     * color is a `SyntaxError`; past 1,024 stops a RangeError. */
    addColorStop(offset: number, color: string): void;
  }
  export class CanvasPattern {
    #private;
    private constructor();
    setTransform(transform?: DOMMatrix2DInit): void;
  }

  export type GlobalCompositeOperation =
    | "source-over" | "source-in" | "source-out" | "source-atop"
    | "destination-over" | "destination-in" | "destination-out" | "destination-atop"
    | "lighter" | "copy" | "xor" | "multiply" | "screen" | "overlay" | "darken" | "lighten"
    | "color-dodge" | "color-burn" | "hard-light" | "soft-light" | "difference" | "exclusion"
    | "hue" | "saturation" | "color" | "luminosity";
  export type CanvasFillRule = "nonzero" | "evenodd";
  export type CanvasLineCap = "butt" | "round" | "square";
  export type CanvasLineJoin = "round" | "bevel" | "miter";
  export type CanvasTextAlign = "start" | "end" | "left" | "right" | "center";
  export type CanvasTextBaseline = "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  export type CanvasDirection = "ltr" | "rtl" | "inherit";
  export type CanvasFontKerning = "auto" | "normal" | "none";
  export type PatternRepetition = "repeat" | "repeat-x" | "repeat-y" | "no-repeat" | "";

  export interface TextMetrics {
    readonly width: number;
    readonly actualBoundingBoxLeft: number;
    readonly actualBoundingBoxRight: number;
    readonly actualBoundingBoxAscent: number;
    readonly actualBoundingBoxDescent: number;
    readonly fontBoundingBoxAscent: number;
    readonly fontBoundingBoxDescent: number;
    readonly emHeightAscent: number;
    readonly emHeightDescent: number;
    readonly hangingBaseline: number;
    readonly alphabeticBaseline: number;
    readonly ideographicBaseline: number;
  }

  /** The web's context for the supported subset. Errors are the web's: see
   * each member; a DOMException case throws an Error with that name. */
  export class OffscreenCanvasRenderingContext2D {
    #private;
    private constructor();
    readonly canvas: OffscreenCanvas;
    // state
    /** RangeError past 1,024 nested saves. */
    save(): void;
    restore(): void;
    /** Clears the canvas and resets every setting. */
    reset(): void;
    // transforms
    translate(x: number, y: number): void;
    scale(x: number, y: number): void;
    rotate(angle: number): void;
    transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
    setTransform(transform?: DOMMatrix2DInit): void;
    resetTransform(): void;
    getTransform(): DOMMatrix2D;
    // compositing
    /** 0–1; other values are ignored. */
    globalAlpha: number;
    globalCompositeOperation: GlobalCompositeOperation;
    // styles
    /** CSS colors (hex, `rgb()`, `hsl()`, `hwb()`, named), gradients or
     * patterns; reading a color gives `#rrggbb` or `rgba(…)`. */
    fillStyle: string | CanvasGradient | CanvasPattern;
    strokeStyle: string | CanvasGradient | CanvasPattern;
    /** TypeError for non-finite arguments. */
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
    /** `IndexSizeError` for a negative radius. */
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
    /** `startAngle` in radians, clockwise from +x. */
    createConicGradient(startAngle: number, x: number, y: number): CanvasGradient;
    /** Null for an empty image; `SyntaxError` for another repetition;
     * `InvalidStateError` for an empty canvas. */
    createPattern(image: CanvasImageSource, repetition: PatternRepetition | null): CanvasPattern | null;
    // line styles
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    miterLimit: number;
    /** Negative or non-finite entries ignore the call; odd lists repeat;
     * RangeError past 256 entries. */
    setLineDash(segments: readonly number[]): void;
    getLineDash(): number[];
    lineDashOffset: number;
    // shadows
    shadowColor: string;
    /** 0–512. */
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    // rectangles
    clearRect(x: number, y: number, w: number, h: number): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    strokeRect(x: number, y: number, w: number, h: number): void;
    // paths
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
    arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
    ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    roundRect(x: number, y: number, w: number, h: number, radii?: number | { x: number; y: number } | readonly (number | { x: number; y: number })[]): void;
    fill(fillRule?: CanvasFillRule): void;
    fill(path: Path2D, fillRule?: CanvasFillRule): void;
    stroke(path?: Path2D): void;
    clip(fillRule?: CanvasFillRule): void;
    clip(path: Path2D, fillRule?: CanvasFillRule): void;
    isPointInPath(x: number, y: number, fillRule?: CanvasFillRule): boolean;
    isPointInPath(path: Path2D, x: number, y: number, fillRule?: CanvasFillRule): boolean;
    isPointInStroke(x: number, y: number): boolean;
    isPointInStroke(path: Path2D, x: number, y: number): boolean;
    // text
    /** CSS font shorthand (style, small-caps, weight, stretch, size in any
     * CSS unit, line height, families); families are the fonts added with
     * `fonts.add` and the generic families (`sans-serif`, `serif`,
     * `monospace`, `system-ui`, `cursive`, `fantasy`), which map to the
     * operating system's fonts as browsers map them (see `starhermit:draw`;
     * the system's families have no names of their own here) with the
     * engine's emoji font and pixel font (`starhermit pixel`) last.
     * Characters a face lacks draw with the next face that has them; emoji
     * draw in colour (see "Emoji" in `starhermit:draw`). Default
     * `10px sans-serif`. */
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
    direction: CanvasDirection;
    /** CSS lengths (`px`, `em`, `rem`, `pt`, or `0`). */
    letterSpacing: string;
    wordSpacing: string;
    fontKerning: CanvasFontKerning;
    fillText(text: string, x: number, y: number, maxWidth?: number): void;
    strokeText(text: string, x: number, y: number, maxWidth?: number): void;
    measureText(text: string): TextMetrics;
    // images
    /** `InvalidStateError` for an empty canvas or a closed bitmap. */
    drawImage(image: CanvasImageSource, dx: number, dy: number): void;
    drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
    drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: "low" | "medium" | "high";
    // pixels
    /** `IndexSizeError` for a zero size. */
    createImageData(width: number, height: number): ImageData;
    createImageData(imageData: ImageData): ImageData;
    getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
    putImageData(imageData: ImageData, dx: number, dy: number): void;
    putImageData(imageData: ImageData, dx: number, dy: number, dirtyX: number, dirtyY: number, dirtyWidth: number, dirtyHeight: number): void;
  }

  /** The web's name for the same context. */
  export type CanvasRenderingContext2D = OffscreenCanvasRenderingContext2D;

  /** A font from the package (TTF, OTF, TTC or OTC), as the web's FontFace. */
  export class FontFace {
    constructor(family: string, source: string | Uint8Array | ArrayBuffer, descriptors?: { style?: string; weight?: string; stretch?: string });
    readonly family: string;
    readonly status: "unloaded" | "loading" | "loaded" | "error";
    /** Reads the file without waiting for it (in browsers fetched first
     * when the page has not; see `PackageFiles`). Rejects with an Error
     * named `NetworkError` for a missing file and `SyntaxError` for data it
     * cannot read. */
    load(): Promise<FontFace>;
  }
  /** The fonts canvases (and `draw.text`) can use, as `document.fonts`. At
   * most 64 faces and 64 MiB of font data (RangeError); a face deleted and
   * added again counts once. */
  export interface FontFaceSet {
    add(font: FontFace): this;
    delete(font: FontFace): boolean;
    has(font: FontFace): boolean;
    readonly ready: Promise<FontFaceSet>;
  }
  export const fonts: FontFaceSet;

  /** Kept so `catch (e)` code can name these failures. */
  export interface CanvasException extends Error {
    readonly name: DOMExceptionName | "TypeError" | "RangeError";
  }
}

// ===========================================================================
declare module "starhermit:draw" {
  import type { ColorLike } from "starhermit:engine";
  import type { Texture } from "starhermit:scene";
  import type { OffscreenCanvas, ImageBitmap } from "starhermit:canvas";

  // The per-frame 2D overlay over the 3D scene (HUDs), drawn in call order
  // and cleared as each frame begins; call it from `onUpdate` or
  // `onRender`. Coordinates are window pixels from the top-left corner. At
  // most 16,384 items a frame, 4,096 characters a text and 65,536
  // characters a frame (RangeError). The runtime's own interface always
  // draws above it. The frame's overlay draws at most 262,144 vertices
  // (three a triangle): a frame past them draws none of its overlay (the
  // console says so once: "2D vertex budget exceeded"). `box` is the
  // costly item: a plain box takes a few dozen vertices, a gradient a few
  // hundred, and a repeating radial gradient a ring at each stop of each
  // period (about 5,200 for hard rings every 10 pixels over a 120-pixel
  // box, so about fifty such boxes fill the budget).
  //
  // Fonts. Text in no family the game added draws with the operating
  // system's fonts, as browsers map the generic families: `system-ui` (the
  // default; Segoe UI on Windows, DejaVu Sans on Linux), `sans-serif`
  // (Arial, Liberation Sans or DejaVu Sans), `serif`, `monospace`,
  // `cursive` and `fantasy`; characters a face lacks take the next face
  // that has them (other system families, Segoe UI Symbol on Windows), and
  // the engine's 5 × 7 pixel font (`starhermit pixel`, printable ASCII,
  // `· × — …` and the arrows) comes last, so a machine without system fonts
  // still draws ASCII. On common systems that covers Latin-1, Latin
  // Extended-A and general punctuation (`é`, `ß`, `–`, `’`); symbols such as
  // `★` depend on the system. Besides its own emoji font (below), the
  // runtime ships no font file and reads fonts only from the system's font
  // directories; games name them only
  // by the generic families (a system family's own name, such as `Arial`,
  // is not a family here, so text cannot tell which fonts the system has).
  // Exact metrics (widths,
  // line heights) differ between systems, as on the web: measure text
  // (`measureText`) rather than assume widths.
  //
  // Emoji draw in colour from the engine's own emoji font, StarHermit
  // Emoji, the same on every system and in browsers: in `text` and
  // `measureText` here, in `starhermit:ui`, and in a canvas's `fillText`
  // and `measureText` (`strokeText` strokes an emoji's outline in the
  // stroke style, as browsers do). It comes after every other face, just
  // before the pixel font, except that an emoji drawn in emoji style by
  // default (Emoji_Presentation, such as `😀 🔴 ⭐`) takes it over a
  // system face's black-and-white form, as browsers prefer their emoji
  // font. U+FE0F after a character asks for emoji style (`❤️`, where `❤`
  // alone is text style), U+FE0E for text style; neither draws anything.
  // An emoji's own colours draw whatever the text's color (its opacity
  // still applies), except parts the font gives the text's color (as it
  // draws text-style symbols such as `✔ ☀`). It also has symbols that
  // Unicode gives no emoji form (`⌖ ☆ ✓ ● ⚀`), drawn in the text's
  // color, and like any face draws them wherever no face before it has
  // them (loading for them as for emoji). The font is original art,
  // under the engine's licence, and has 711 glyphs: the common single
  // emoji, one code point each (an emoji it lacks draws with the faces
  // before it, or as the pixel font's box), and the twelve keycaps
  // (`0`–`9`, `#` or `*`, U+FE0F, U+20E3: `2️⃣ #️⃣`, also without the
  // U+FE0F), each one key drawn the same everywhere. U+20E3 never draws
  // on its own: anywhere else the character before it draws as plain
  // text. This version draws no other emoji sequences: in a ZWJ sequence
  // (`👩‍💻`) each emoji draws on its own and the joiner draws nothing, a
  // skin-tone modifier is dropped (the emoji draws in its default tone),
  // and a flag draws as its two regional indicator letters where a face
  // has them. The font loads the
  // first time text needs it, never before (a game without emoji never
  // loads it): until it arrives, which takes a moment in a browser, emoji
  // (and its symbols that no other face has) draw as nothing in the room
  // they take once it is in (an em each), so
  // text keeps its layout, and then they draw. Nothing waits or throws.

  export interface Clip {
    /** Only the part inside this window rectangle draws. */
    clip?: { x: number; y: number; width: number; height: number };
  }
  /** How an item combines with what is drawn under it (since API_MINOR
   * 18), as canvas composites: `normal` (`source-over`, the default),
   * `add` (canvas `"lighter"`: colors added, for glows and additive
   * particles; two overlapping half-bright items make a full one),
   * `multiply` (darkens; canvas's own over the opaque frame) and `screen`
   * (lightens). Items of different blends draw in call order, the same
   * natively and in browsers. Another name is a TypeError. */
  export type BlendMode = "normal" | "add" | "multiply" | "screen";
  export interface Blend {
    /** Since API_MINOR 18. */
    blend?: BlendMode;
  }
  /** `options.blend` since API_MINOR 18. */
  export function rect(x: number, y: number, width: number, height: number, color: ColorLike, options?: Clip & Blend): void;
  /** An outline `lineWidth` pixels wide inside the rectangle. */
  export function strokeRect(x: number, y: number, width: number, height: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  /** Since API_MINOR 12 its edge (as `strokeRoundRect`'s) is antialiased
   * over a pixel, the same natively and in browsers. */
  export function roundRect(x: number, y: number, width: number, height: number, radius: number, color: ColorLike, options?: Clip): void;
  /** A box drawn as `starhermit:ui` draws a styled widget's (since
   * API_MINOR 12), for HUD pieces drawn by hand (a pill over the world, a
   * gradient frame): `style` is class names registered with
   * `ui.setStyles` (a string or an array) or a style object, of which the
   * box properties draw (fills, border, radius, shadows, decorations,
   * opacity, translate). The rectangle is window pixels; the style's sizes
   * are logical, at the UI's scale, and the player's high contrast applies
   * as to widgets. It counts as one overlay item per part it draws. */
  export function box(x: number, y: number, width: number, height: number, style: string | readonly string[] | import("starhermit:ui").Style, options?: Clip): void;
  /** A rounded outline `lineWidth` pixels wide inside the rectangle. */
  export function strokeRoundRect(x: number, y: number, width: number, height: number, radius: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  export function line(x1: number, y1: number, x2: number, y2: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  /** A filled simple polygon (3 to 256 points, `[x, y]` pairs, convex or
   * not; self-intersecting outlines fill as their triangulation falls). */
  export function polygon(points: readonly (readonly [number, number])[], color: ColorLike, options?: Clip): void;
  /** Turns a text or image about `origin` (default its top-left corner, in
   * window pixels; a circle, ellipse or arc about its center). */
  export interface Rotation {
    /** Radians, clockwise on screen. */
    rotation?: number;
    origin?: { x: number; y: number };
  }
  // Circles, ellipses and arcs (since API_MINOR 18), their edges
  // antialiased over a pixel as `roundRect`'s, the same natively and in
  // browsers, as smooth as their size needs (no point limit). Each is one
  // overlay item. A negative radius is a RangeError; a radius of 0 or a
  // `lineWidth` of 0 draws nothing. Outlines are centered on the curve
  // (as canvas strokes it; `strokeRect` draws inside), `lineWidth`
  // default 1, an arc's ends cut square (canvas's butt caps). Angles are
  // radians from +x, clockwise on screen (canvas's), an ellipse's
  // parametric as canvas's `ellipse`.
  export interface ShapeOptions extends Clip, Rotation, Blend {}
  export interface ArcOptions extends ShapeOptions {
    /** Goes from `startAngle` to `endAngle` the other way (canvas's
     * `counterclockwise`): an arc sweeps the way it goes, a whole turn
     * when the angles are a turn or more apart that way. */
    counterclockwise?: boolean;
  }
  /** Since API_MINOR 18. */
  export function circle(x: number, y: number, radius: number, color: ColorLike, options?: ShapeOptions): void;
  /** Since API_MINOR 18; `rotation` turns its axes. */
  export function ellipse(x: number, y: number, radiusX: number, radiusY: number, color: ColorLike, options?: ShapeOptions): void;
  /** A filled sector (a pie slice: the arc closed through the center),
   * since API_MINOR 18: cooldowns and timers. */
  export function arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, color: ColorLike, options?: ArcOptions): void;
  /** Since API_MINOR 18. */
  export function strokeCircle(x: number, y: number, radius: number, color: ColorLike, lineWidth?: number, options?: ShapeOptions): void;
  /** Since API_MINOR 18. */
  export function strokeEllipse(x: number, y: number, radiusX: number, radiusY: number, color: ColorLike, lineWidth?: number, options?: ShapeOptions): void;
  /** The arc alone (no lines to the center), since API_MINOR 18: rings
   * and progress arcs. */
  export function strokeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number, color: ColorLike, lineWidth?: number, options?: ArcOptions): void;
  export interface TextOptions extends Clip, Rotation {
    /** Pixels (default 16). */
    size?: number;
    color?: ColorLike;
    /** A family added with `canvas.fonts`, a generic family (`system-ui`,
     * the default, `sans-serif`, `serif`, `monospace`, `cursive`,
     * `fantasy`) or `starhermit pixel` (the pixel font, crisp at multiples
     * of 10); any other name draws as `sans-serif`, as browsers fall back.
     * The system's own families (Arial, DejaVu Sans) are reached only
     * through the generic families. */
    font?: string;
    /** Where `x` is: the text's start (default), center or end. */
    align?: "start" | "center" | "end";
    /** A `FontFace` weight of the family (`"bold"`, `"700"`); the nearest
     * face added under it (or the system's bold face) is used; a family
     * without a bold face draws a synthesized bold at 600 and more. */
    weight?: string;
    /** Extra pixels between characters (within ±1,024). */
    letterSpacing?: number;
    /** Drawn first under the text, offset by `x`/`y` pixels. */
    shadow?: { color: ColorLike; x: number; y: number };
    /** An outline around each glyph under the fill, as canvas's
     * `strokeText` then `fillText` draw outlined text (since API_MINOR
     * 18): `width` pixels (default 1, at most 32, RangeError; 0 draws
     * none) centered on the glyphs' edges, so half of it shows past them,
     * with round joins; over the shadow. It bakes into an image once for
     * each text, size and width (a changing text, a score, once a value),
     * and the text stays one text item (play scripts match it once). */
    stroke?: { color: ColorLike; width?: number };
    /** Wrap at this width in pixels. */
    maxWidth?: number;
    direction?: "ltr" | "rtl";
  }
  /** `y` is the top of the first line. */
  export function text(text: string, x: number, y: number, options?: TextOptions): void;
  /** The size `text` draws at with these options: the same faces (the
   * weight's), letter spacing, wrap width and direction, so a width
   * measured here is the width drawn. Drawing is unscaled: this follows
   * neither the player's interface size nor their text size. To lay out
   * `starhermit:ui` widgets, measure with `ui.measureText`, which does.
   * With a `stroke` (since API_MINOR 18) both grow by its width, the
   * outline reaching half of it past each side (the text's fill stays
   * where it draws without one). */
  export function measureText(text: string, options?: Pick<TextOptions, "size" | "font" | "weight" | "letterSpacing" | "maxWidth" | "direction" | "stroke">): { width: number; height: number };
  /** `blend` since API_MINOR 18 (an additive glow sprite: `"add"`). */
  export interface ImageOptions extends Clip, Rotation, Blend {
    /** Part of the source in its own pixels (default all of it). As
     * canvas's `drawImage` takes it: a part reaching past the image is
     * clipped to it and the destination shrinks with it (the image is
     * never stretched past its edge), a negative width or height spans
     * the other way, and a part with no area in the image draws nothing. */
    source?: { x: number; y: number; width: number; height: number };
    /** Multiplies the image (default white). */
    tint?: ColorLike;
  }
  /** Draws a texture, canvas (as it is now) or bitmap; the width and height
   * default to the source's size. */
  export function image(source: Texture | OffscreenCanvas | ImageBitmap, x: number, y: number, width?: number, height?: number, options?: ImageOptions): void;
}

// ===========================================================================
declare module "starhermit:ui" {
  import type { ColorLike } from "starhermit:engine";
  import type { Texture } from "starhermit:scene";

  // The engine's immediate-mode UI for the game's own menus and HUD panels:
  // call widgets every frame (from `onUpdate` or `onRender`) and they return
  // what the player did. It lays out, draws into the overlay (after
  // `starhermit:draw`), takes pointer, touch, keyboard (Tab, arrows,
  // Enter, Escape) and gamepad navigation (D-pad or left stick, South to
  // activate, East to go back), follows the player's UI scale, text size,
  // contrast and reduced-motion settings (see `preferences`), and builds an
  // accessibility tree screen readers read. Labels are the widgets' identities unless `id()`
  // names them, so keep them stable or set ids for translated labels. At
  // most 4,096 widgets a frame (RangeError). A click or tap needs its press
  // and its release on the same widget, each counted where it happened, so
  // one that comes and goes between two frames (a quick tap on a slow
  // frame) still clicks; a frame clicks at most once, and further taps
  // between two frames click in the frames after it, in order.

  // Sizes. What the game passes is logical pixels: theme sizes, text sizes,
  // padding, spacing, and layout, paragraph, slider, field, progress, image
  // and scroll-area sizes. Each frame the UI multiplies them by
  // `preferences().scale` (the window's scale factor times the player's
  // interface size) and text sizes by `textScale` on top, as the runtime's
  // own menu does; a change the player makes in the Options menu shows on
  // the next frame. What the UI returns is window pixels: rectangles,
  // scroll offsets, `measureText`. Rectangles the game gives (`setViewport`,
  // `area`) are window pixels too. A game that places widgets itself
  // measures them with `measureText` (never `starhermit:draw`'s, which is
  // unscaled) and divides window pixels by `scale` for the logical sizes it
  // passes back: a column as wide as its widest label is
  // `{ width: widest / ui.preferences().scale }`; a screen-filling one is
  // `frame().width / ui.preferences().scale` wide, not `/ frame().scale`.

  // Fonts. Text draws with the default faces (`system-ui`), `setFont`'s
  // family or a text option's (`TextOptions.font`), each falling back as
  // `starhermit:draw`'s text does: the system's faces, then the engine's
  // emoji font and pixel font. Emoji draw in colour from the engine's own
  // emoji font, StarHermit Emoji, loaded the first time text needs it;
  // until then they keep their room and draw nothing, and measured widths
  // (`measureText`) are already theirs. Single emoji and keycaps (`2️⃣`)
  // only in this version: ZWJ sequences draw as their emoji one by one,
  // skin tones are dropped, flags draw as regional indicator letters (see
  // "Emoji" in `starhermit:draw`).

  /** A widget's or container's rectangle (window pixels): a new frozen
   * object each call, so one the game keeps never changes. */
  export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }
  export type Align = "start" | "center" | "end";
  export interface Layout {
    /** Logical pixels; one number for all sides. */
    padding?: number | { top?: number; bottom?: number; start?: number; end?: number };
    spacing?: number;
    /** Across the axis; `"stretch"` (since API_MINOR 12) gives every child
     * the container's whole width (a column's) or height (a row's): in an
     * auto-sized column, its widest child's. In a `grid`, where cells sit
     * in their row's height (`"stretch"`: as tall); in a `stack`, where
     * children sit across it (`"stretch"`: its whole box). */
    align?: Align | "stretch";
    /** Along the axis: the children together at the start, center or end,
     * or (since API_MINOR 12, CSS `justify-content`) the free space
     * between them: `"space-between"` between each two (one child stays
     * at the start), `"space-around"` a share around each (half a share
     * at the ends), `"space-evenly"` equal shares between them and at
     * the ends. The free space is the container's size (fixed, filled,
     * stretched or grown) less its children's last frame, so a
     * content-sized container has none. In a `stack`, where children sit
     * down it. */
    justify?: Align | "space-between" | "space-around" | "space-evenly";
    /** The outer size, padding and border included (CSS `box-sizing:
     * border-box`), as a style's `width` and `height`. */
    width?: number;
    height?: number;
    /** The panel's color (the theme's opaque panel under high contrast). */
    background?: ColorLike;
    /** Clip children to the container. */
    clip?: boolean;
    /** The text of everything inside (since API_MINOR 8): smaller type for
     * a wide table, a handwritten face for a letter. Nested containers and
     * widgets' own options override it. */
    text?: TextOptions;
    /** The container's classes (since API_MINOR 12), as `style()` gives
     * them: it is styled as a `panel` with a background, else a `row` or
     * `column`. */
    style?: string | readonly string[];
    /** A share of the free space along the enclosing container's axis
     * (since API_MINOR 12, CSS `flex: 1`): its height in a column of fixed
     * height (or the root column, the viewport's), its width in a row of
     * fixed width, split between growing children by their shares. The
     * free space is what the other children took last frame (on its first
     * frame, what is left after the children before it). In a container
     * without a fixed size it has no effect. */
    grow?: number;
    /** `"radiogroup"` (since API_MINOR 12): a segmented control. The
     * buttons inside with `selected` (and `widget`s of role `"radio"`) are
     * its radios, announced "radio, 2 of 3" with the group's label: one
     * stop for Tab (the chosen radio, else the first), arrows along its
     * axis move to the next or previous radio and choose it (the button
     * activates, as a click would), and leave the group at its ends; the
     * other arrows leave it as a block. */
    role?: "radiogroup";
    /** The container's tooltip (since API_MINOR 12), as a widget's. */
    tooltip?: Tooltip;
  }
  /** A widget's or container's text (since API_MINOR 8); each option
   * absent keeps the enclosing container's (else the theme's). */
  export interface TextOptions {
    /** Logical pixels, for every text style (labels, headings, buttons):
     * the player's UI scale and text size settings still enlarge it, and
     * it is at least 10 (smaller sizes draw at 10). A widget's own `size`
     * and `font` win over the text its style class sets, as an inline
     * style over a class; a scope's (`ui.text`, a container's options) are
     * inherited, so a class's text still wins inside it. */
    size?: number;
    /** A family added with `canvas.fonts` (any case), a generic family
     * (`system-ui`, `sans-serif`, `serif`, `monospace`, `cursive`,
     * `fantasy`: the system's faces, as `starhermit:draw` maps them) or
     * `starhermit pixel`; absent with a `weight`, the UI's own family
     * (`setFont`'s, else `system-ui`). Another name throws a TypeError. The
     * runtime bundles no handwriting face: `cursive` is the system's
     * (Comic Sans MS on Windows, as browsers pick; elsewhere and on the web
     * runtime the sans-serif faces), so a game wanting handwriting
     * everywhere adds its own font. At most 64 families and weights a
     * game (RangeError). */
    font?: string;
    /** `"bold"`, `"normal"` or `"100"`–`"900"` (a family without a bold
     * face draws a synthesized bold at 600 and more). */
    weight?: string;
  }
  /** Where the UI lays out (window pixels; default the whole window less
   * its safe area). It may change during a frame: widgets after a call lay
   * out in the new area (see `area`). */
  export function setViewport(rect: Rect): void;
  /** Lays out `build`'s widgets in another window rectangle this frame
   * (several regions a frame: a chat field in one corner, a toggle in
   * another), then returns to the current area. */
  export function area(rect: Rect, build: () => void): Rect;
  /** Names the next widget or container (focus and state survive a changed
   * label). Returns the module for chaining: `ui.id("play").button(label)`. */
  export function id(id: string): typeof import("starhermit:ui");
  export function column(label: string, build: () => void, layout?: Layout): Rect;
  export function row(label: string, build: () => void, layout?: Layout): Rect;
  /** A column on a panel background. */
  export function panel(label: string, build: () => void, layout?: Layout): Rect;

  // -- Layout (since API_MINOR 12) ---------------------------------------
  //
  // The box model is CSS's `box-sizing: border-box`: a container's or
  // widget's `width` and `height` are its outer size, border and padding
  // included. A container without them is as large as its content (its
  // children's own sizes and margins, plus its padding and border), at
  // least its style's `minWidth` and `minHeight`; `width: "fill"`,
  // `align: "stretch"` and `grow` give a child the room its container
  // has instead (a column's width, a grid cell, a stack's box), and its
  // content size still counts what it needs, so a stretched column
  // shrinks again when its widest child does. Placement that needs a
  // size not known yet (justify, centring, `auto` grid columns, a row's
  // height for its cells) uses last frame's, so a new layout settles on
  // its second frame; rows above the one being built are this frame's,
  // so cells never overlap the rows before them. Right to left, start and
  // end swap: rows, grid columns, anchors, margins and alignment mirror.

  /** A grid column's or row's size: logical pixels, `"auto"` (its widest
   * cell last frame; tallest for a row), or `{ fr }`, a share of the room
   * the others leave (CSS `minmax(0, 1fr)`). A column may also be
   * `{ width, align }` (`width` pixels or `"auto"`) or `{ fr, align }`:
   * where its cells sit across it (`"stretch"`: as wide), CSS's
   * `td:last-child { text-align: right }` being `align: "end"` on the
   * last column. */
  export type GridTrack = number | "auto" | { fr: number };
  export type GridColumn =
    | GridTrack
    | { width?: number | "auto"; fr?: number; align?: Align | "stretch" };
  export interface GridLayout extends Layout {
    /** A count of equal shares, or the columns (at most 64, RangeError). A
     * grid with `fr` columns and no `width` fills its container's width
     * (as CSS's block-level grids), and in a row (no width to share)
     * they size as `"auto"`. */
    columns: number | readonly GridColumn[];
    /** Row sizes from the top (at most 64); rows past them are `"auto"`.
     * `fr` rows share a fixed `height`. */
    rows?: readonly GridTrack[];
    /** Logical pixels between cells (default the layout's `spacing`). */
    gap?: number | { row?: number; column?: number };
    /** Classes of a box drawn behind each row, the grid's whole width
     * (ruled rows, zebra stripes, a hovered row): its state blocks
     * `first`, `last`, `odd` and `even` say which row, `hoverWithin` the
     * pointer over it. */
    rowStyle?: string | readonly string[];
    /** Classes of a box drawn behind each cell, its whole area (column
     * rules, cell backgrounds), `first`, `last`, `odd` and `even` by its
     * column. */
    cellStyle?: string | readonly string[];
  }
  /** A grid (CSS `display: grid`): its children fill its cells row by row
   * from the start (`cell` places one elsewhere or spans columns). Tab
   * and screen readers go in build order, so build cells in reading
   * order; arrows move from cell to cell. A child's `first`, `last`,
   * `odd` and `even` state blocks match its column in its row. Styled as
   * `grid` (as `panel` with a background). */
  export function grid(label: string, build: () => void, layout: GridLayout): Rect;
  /** Where the grid's next child goes: its `column` and `row` (from 0;
   * absent, the next free one), and how many columns it `span`s (default
   * 1). A column alone goes in the current row unless the cells before
   * it are past it (then in the next row); with a row, the cell is
   * exactly there and the cells after it carry on where they were. A
   * cell spanning columns does not size `auto` columns. Outside a grid it
   * throws a TypeError. Returns the module for chaining:
   * `ui.cell({ span: 2 }).label("Total")`. */
  export function cell(cell: { column?: number; row?: number; span?: number }): typeof import("starhermit:ui");
  /** Classes for the box behind the grid row its next child goes in
   * (since API_MINOR 12), after the grid's `rowStyle`: a row of its own
   * look, as the player's gold-edged row of a leaderboard. Call it
   * before the row's first cell; its state blocks (`first`, `odd`,
   * `hoverWithin`…) work as `rowStyle`'s. Outside a grid it throws a
   * TypeError. Returns the module for chaining:
   * `ui.gridRow("me").label(name)`. */
  export function gridRow(classes: string | readonly string[]): typeof import("starhermit:ui");
  /** Children over each other in one box (a badge on an icon, a caption
   * on a picture): each sits by the stack's `align` across and `justify`
   * down (`align: "stretch"` gives each the whole box). The box is its
   * largest child's (or its `width` and `height`). Tab and screen readers
   * go in build order. Styled as `stack` (as `panel` with a background). */
  export function stack(label: string, build: () => void, layout?: Layout): Rect;
  export type Anchor =
    | "top-start" | "top" | "top-end" | "start" | "center" | "end"
    | "bottom-start" | "bottom" | "bottom-end";
  /** A column anchored in the inner box of the container it is built in,
   * out of that container's flow (CSS `position: absolute`): a badge on a
   * stack's corner, a close button at a panel's top end, at the top level
   * a HUD piece in a corner of the screen (inside its safe area). `x` and
   * `y` (logical pixels) move it in from the edges it is anchored to (on
   * an axis it is centred on, toward the end and the bottom); its style's
   * margin does the same. `{ x, y }` alone is from the top-start corner.
   * Its size is its content's: in the frame that changes (its first, new
   * content) it is laid out at the old size, then moved, input and focus
   * included, to where the anchor puts it. It stays in the focus order
   * where it is built. In a stack it counts toward the stack's size;
   * elsewhere it takes no room. Since API_MINOR 18 the topmost takes the
   * pointer, by last frame's rectangles (later is on top): a placed
   * container with a background or a style (a pause card over a board),
   * any container with one in a stack, and a scroll area take the pointer
   * (hover, presses, the wheel) over their whole box from what was built
   * before them under it, and an interactive widget from those under its
   * own rectangle. A placed container painting nothing (an effects layer
   * drawn over the UI, a widget of role "none") lets the pointer through
   * between its interactive widgets. Games declaring an older minor keep
   * the earlier rule: the first widget built under the pointer takes it. */
  export function place(
    label: string,
    at: Anchor | { anchor?: Anchor; x?: number; y?: number },
    build: () => void,
    layout?: Layout,
  ): Rect;
  /** An empty child taking a `share` (default 1) of the free space along
   * a row or column of fixed size, as `grow` does for a container (CSS's
   * `flex: 1` spacer): the brand at a header's start, the stats at its
   * end. Its Rect spans the row's height (the column's width), so the
   * room a fixed-height column leaves is a region to draw in (a game's
   * view under a HUD); that span is not content, so it never widens a
   * column sized by its children. A non-positive share throws a
   * RangeError. */
  export function spacer(share?: number): Rect;
  /** A tone colors a label's text from the theme (`"muted"`, `"accent"`)
   * or by an explicit color (the theme's text color under high contrast). */
  export type Tone = "normal" | "muted" | "accent" | "danger";
  /** A tooltip (since API_MINOR 12): text, or a function that builds its
   * content with widgets (labels, headings, images, meters: presentation,
   * interactive widgets throw a TypeError), called on the frames it shows.
   * It shows by the widget's rectangle (below it from its start edge,
   * above it when there is no room below, inside the window's safe area)
   * once the pointer rests on the widget 0.6 seconds, and at once while
   * the widget has keyboard or gamepad focus; a press hides it until the
   * pointer leaves. Text tooltips are the widget's accessible description
   * always; built ones while they show. Styled by the `tooltip` kind; one
   * shows at a time. Widgets take it as their `tooltip` option, or the
   * next widget from `ui.tooltip(…)`. */
  export type Tooltip = string | (() => void);
  /** What every widget's options take besides their own. */
  export interface WidgetOptions {
    tooltip?: Tooltip;
  }
  export function label(text: string, options?: TextOptions & WidgetOptions & { tone?: Tone; color?: ColorLike }): Rect;
  export function heading(text: string, options?: TextOptions & WidgetOptions): Rect;
  /** Wrapped text at most `width` logical pixels wide; a style's
   * `text.align` places each line (since API_MINOR 12). */
  export function paragraph(text: string, width?: number, options?: TextOptions & WidgetOptions): Rect;
  /** `size` (logical) is the image's own; styled as `image` (or by a
   * chained `style`), the style's padding and border go around it and the
   * image fills what they leave (so a style's fixed size stretches it).
   * `uv` (0–1 from the texture's top-left) reaching outside the texture
   * draws what lies inside it, the box shrinking with it, as
   * `draw.image`'s `source` does (since 1.16.5; before, a region a hair
   * outside was clamped and one further out left out). */
  export function image(alt: string, texture: Texture, size: { width: number; height: number }, uv?: { min: [number, number]; max: [number, number] }, options?: WidgetOptions): Rect;
  /** `value` 0–1. Styled as `progress`, its parts `track` and `fill`. */
  export function progress(value: number, width?: number, options?: WidgetOptions): Rect;
  /** The next widget's tooltip (since API_MINOR 12; see `Tooltip`).
   * Chains: `ui.tooltip("Costs $1,200").button("Office")`. */
  export function tooltip(tooltip: Tooltip): typeof import("starhermit:ui");
  /** True on the frame it was activated. A disabled button shows muted,
   * stays in the focus order for screen readers (announced unavailable)
   * and never activates. An activation by a press counts as that press
   * for `clipboard.writeText` and pointer lock during this frame. */
  export interface ButtonOptions extends TextOptions, WidgetOptions {
    disabled?: boolean;
    tone?: Tone;
    /** Announced unavailable and styled by the `disabled` state block, but
     * still activates (since API_MINOR 12): a locked tool that says why
     * when pressed. */
    ariaDisabled?: boolean;
    /** A toggle (since API_MINOR 12): announced pressed or not, styled by
     * the `selected` state block (the active tool, the chosen segment). In
     * a `radiogroup` container, a radio of the group instead. */
    selected?: boolean;
    /** Builds the button's face (since API_MINOR 12): an icon over two
     * lines, a title with a small second line, a stat chip. It runs in a
     * column inside the button's padding (aligned by the style's
     * `text.align`, centered vertically in a taller button); what it
     * builds is presentation (it takes no focus or input; an interactive
     * widget throws a TypeError) and is styled as the button is: its
     * state blocks and `inside` rules match the button's state
     * (`".tool": { inside: { label: { selected: { … } } } }`), and its
     * text takes the button's text color. The button stays one widget: one
     * focus stop, activated by a click anywhere on it, Enter, Space or
     * South. Its accessible name is `label`, and the content's text its
     * description; with an empty `label` (give it an `id`) the content's
     * text is its name. */
    content?: () => void;
  }
  export function button(label: string, options?: ButtonOptions): boolean;
  /** Returns the value after this frame's input. `appearance: "switch"`
   * (since API_MINOR 12) draws a pill whose knob sits at the end when
   * checked (the parts `box` and `mark`, round unless a style says
   * otherwise); it is announced as a checkbox. */
  export function checkbox(label: string, checked: boolean, options?: WidgetOptions & { appearance?: "box" | "switch" }): boolean;
  /** Arrows step by `step` (default a hundredth of the range); since
   * API_MINOR 12 a press or drag lands on `min + k × step` too, within the
   * range. Styled as `slider`, its parts `track` and `thumb`. */
  export function slider(label: string, value: number, options: WidgetOptions & { min: number; max: number; step?: number; width?: number }): number;
  /** An option of a select with an icon before its text (since
   * API_MINOR 12). */
  export interface SelectOption {
    text: string;
    icon?: Texture;
    /** Shown in the muted color and announced unavailable, never chosen:
     * the arrow keys and the D-pad pass over it, and clicks, taps and
     * assistive activation on it do nothing (since API_MINOR 14; a
     * graphics level above `frame().levelCeiling`). The index passed in
     * may still be one: it shows as the choice. */
    disabled?: boolean;
    /** Read after the text by assistive technology: why it is disabled
     * (since API_MINOR 14). */
    description?: string;
  }
  /** A dropdown; returns the chosen index. Styled as `select`, its parts
   * `field` (the closed control), `list` (the open list) and `option`
   * (each option: `hovered` under the highlight, `selected` the current
   * choice). */
  export function select(label: string, index: number, options: readonly (string | SelectOption)[], extra?: WidgetOptions): number;
  /** Left/right arrows through the options; returns the index. */
  export function cycle(label: string, index: number, options: readonly string[], extra?: WidgetOptions): number;
  /** Returns the edited text (at most `maxChars`, default 256).
   * `placeholder` shows while it is empty. While it has focus the runtime
   * takes text input at its caret: typing, input method compositions
   * (shown at the caret; scripts' `text` events get the committed text
   * only) and paste (Ctrl+V or Shift+Insert natively; in browsers, through
   * a text entry the page puts over the field until it loses focus). In
   * browsers that focused text entry is a real one, so on phones and
   * tablets tapping a text field brings up the on-screen keyboard (a text
   * keyboard whose Enter reads Done; the tap's release focuses it within
   * the gesture, as iOS asks), its typing, suggestions and deletions
   * reaching the field, and leaving the field puts it away. The
   * runtime reads the clipboard for a paste, never the game: the pasted
   * text arrives as typed text does (a `text` event, then the field's new
   * value), on one line (trailing line breaks dropped, the others spaces),
   * at most 64 KiB natively. No capability is needed. While it has focus
   * the field has the keyboard (`capturingKeys()` is true): since
   * API_MINOR 17 the keyboard presses no actions meanwhile. Arrows and the
   * D-pad reach a field only from focus the player sees (navigating the
   * UI), never from nothing focused or from a press, since API_MINOR 17
   * (older games: as any widget); `arrows: false` (since API_MINOR 17)
   * keeps them out always: Tab, a press, `setFocus` and screen readers
   * still focus it (a chat field beside a game steered with the arrows). */
  export function textField(id: string, value: string, options?: WidgetOptions & { maxChars?: number; width?: number; placeholder?: string; arrows?: boolean }): string;
  /** Whether Enter was pressed in the text field `id` this frame (the field
   * keeps focus; `setFocus(null)` leaves it). */
  export function submitted(id: string): boolean;
  /** Tab strip plus the chosen tab's content; returns the chosen index.
   * Styled as `tabs` (each tab), its parts `strip` (the box behind the
   * tabs) and `tab` (each tab over the kind's look). */
  export function tabs(label: string, index: number, labels: readonly string[], content: (index: number) => void): number;
  /** A scroll area's rectangle and, since API_MINOR 8, its scroll state
   * after this frame's input, in window pixels like the rectangle (the
   * DOM's names): `scrollTop` from 0 to `scrollHeight - clientHeight`,
   * `scrollLeft` toward the content's end (leftward right-to-left),
   * `scrollHeight`/`scrollWidth` the content as this frame built it, and
   * `clientHeight`/`clientWidth` the part showing it (less the scroll
   * bar). */
  export interface ScrollAreaRect extends Rect {
    readonly scrollTop: number;
    readonly scrollLeft: number;
    readonly scrollHeight: number;
    readonly scrollWidth: number;
    readonly clientHeight: number;
    readonly clientWidth: number;
  }
  export interface ScrollAreaOptions {
    /** Moves the content this frame (since API_MINOR 8; window pixels, as
     * reported): a Next page button sets `top: r.scrollTop +
     * r.clientHeight`, a log stays at its end with `top: Infinity`; past
     * the end stops there, before the start at 0, and NaN throws a
     * TypeError. An absent axis stays. `"instant"` (default)
     * moves it this frame, `"smooth"` glides as the wheel does (instant
     * with reduced motion). It ends a drag of the area. Pass it only on the
     * frame it should move. A frame hears its input first (`onAction`
     * listeners run before `onUpdate` and `onRender` build the widgets),
     * while an area's state is known only once its `scrollArea` call
     * returned: a `scrollTo` worked out from this frame's result moves the
     * content on the next call, a frame late. Work it out in the action
     * listener from the last frame's result (keep it), and pass it on this
     * frame's call. */
    scrollTo?: { top?: number; left?: number; behavior?: "instant" | "smooth" };
    /** Classes (since API_MINOR 12): the `scrollArea` kind's style and
     * these draw its box behind the content. */
    style?: string | readonly string[];
    /** Takes a share of the free space along its container's axis instead
     * of `size`'s height (width in a row), as `Layout.grow` (since
     * API_MINOR 12). */
    grow?: number;
    /** The content's inset inside the area's clip (since API_MINOR 12,
     * CSS padding on a scrolling box), logical pixels: room for its
     * children's focus rings and shadows, which the clip cuts at its
     * edges. Without it, a styled area takes its style's padding and
     * border. */
    padding?: number | { top?: number; bottom?: number; start?: number; end?: number };
  }
  /** Content taller (or wider) than `size` scrolls by wheel, drag, its
   * bar, focus moving inside, and the game (`options.scrollTo`). */
  export function scrollArea(label: string, size: { width: number; height: number }, build: () => void, options?: ScrollAreaOptions): ScrollAreaRect;
  /** A modal dialog while `open`: input reaches nothing behind it. Returns
   * whether it is still open (Back or Escape closes it). Styled as
   * `dialog`: its style is the panel (its padding and border hold the
   * title and content, since API_MINOR 12), its part `backdrop` the dim
   * over the screen behind it. `title` is its heading above `build`'s
   * content and its accessible name. Since API_MINOR 17 an empty or null
   * title draws no heading: the content starts at the top of the padding
   * (a game's own title, or something above it), and screen readers name
   * the dialog by `label`, so make `label` readable (games declaring an
   * older `engine.minor` keep a heading: empty, or `"null"`). */
  export function dialog(label: string, title: string | null, open: boolean, build: () => void): boolean;
  /** Back (Escape, East) pressed this frame and not taken by a dialog. */
  export function back(): boolean;
  /** The UI has the keyboard, as the last frame ended: a text field has
   * focus or a key capture waits for a key. Game shortcuts read from keys
   * should wait. Since API_MINOR 17 the keyboard presses no actions
   * meanwhile (`onAction`, `isDown`; releases still come, so nothing stays
   * held, and `key` events still do); older games hear them and hold them
   * back themselves. */
  export function capturingKeys(): boolean;
  /** Whether the pointer is over a widget (the game should not act on its
   * clicks). A `target` is none: it takes nothing, so the pointer over it
   * is the game's (earlier releases read true over a button target). */
  export function pointerOver(): boolean;
  /** The focused widget's label as the last frame ended (null when
   * nothing had focus); the same all through a frame (since API_MINOR 12:
   * before, it was null once the frame's first widget was built). */
  export function focused(): string | null;
  /** Names an area the game draws itself (since API_MINOR 17): a Canvas 2D
   * game's button shown with `draw.image`, a board's tile. It is a node of
   * the UI's accessibility tree named `text` over `rect` (window pixels,
   * clipped as widgets built where it is: in a scroll area, out of view
   * when scrolled away), a button or, with `role: "label"`, text that only
   * reads, and it lays out, draws, focuses and takes nothing: the pointer
   * over it stays the game's (`starhermit:input`), so the game's own hit
   * tests answer clicks there. Play scripts (`click TEXT`, `until TEXT`)
   * find it as they find a widget, so a game need not draw its labels as
   * overlay text to be tested. Call it every frame the area shows, like a
   * widget (it counts toward the widgets a frame); its identity is `id()`
   * or `text`. A rect that is not an object, or another role, is a
   * TypeError. */
  export function target(text: string, rect: Rect, options?: { role?: "button" | "label" }): void;
  // Screen readers, and in browsers the page's ARIA mirror of the UI (a
  // layer of elements over the canvas, each at its widget, which
  // automation such as Playwright's getByRole finds by role and name and
  // clicks), see every widget with its role, name and states, and focus
  // and activate widgets as the player does, whatever minor the game
  // declares.
  /** Has the player's screen reader speak `text` (since API_MINOR 9): what
   * a game drawn without widgets cannot say otherwise ("hal played Nf3,
   * check", "Checkmate — you won"). Natively a UI Automation notification
   * (Windows) or an AT-SPI announcement (Linux); in browsers a live region
   * on the page. Works at any time (an action or socket handler, a frame
   * without widgets, nothing focused), the runtime's menu open or not.
   * `"polite"` (default) waits until the reader finishes what it is
   * saying; `"assertive"` interrupts it, for news that cannot wait. At
   * most 500 characters (RangeError; another politeness is a TypeError);
   * an empty or blank text says nothing. Four announcements are spoken
   * at once, then one each half second: past that only the newest waits
   * (a polite one never replaces a waiting assertive one) and the rest
   * are dropped, so announce what changed, not every frame. Players
   * without a screen reader hear nothing. */
  export function announce(text: string, options?: { politeness?: "polite" | "assertive" }): void;
  /** Focuses a widget from the next frame (null: none), with its focus
   * ring, as keyboard focus is: a scroll area holding it scrolls it into
   * view. `name` is a widget's `ui.id`, else its label (its accessible
   * name): the first focusable widget whose id it is, else the first
   * whose label it is, so one widget's id wins over another's label. It
   * names the widgets of the frame it is called in, before or after they
   * are built; when that frame has none, the next frame's (the screen the
   * game switches to), unless focus moved elsewhere meanwhile. Within an
   * open modal dialog, only its widgets.
   *
   * Since API_MINOR 20 keys go to the game unless a widget has focus, as
   * keys go to a browser's page unless a focusable element has it: the
   * keyboard's arrows never focus a widget from nothing focused, so the
   * arrows and Enter stay a board cursor's until the player gives the UI
   * focus (Tab, a press on a widget, the gamepad's D-pad or stick, this
   * call, a dialog opening), and a press on no widget outside a modal
   * dialog takes focus away. Older games' arrows focus the first or last
   * widget from nothing focused, and such a game calls `setFocus(null)`
   * to give the keys back. */
  export function setFocus(name: string | null): void;
  /** The language widgets announce (BCP 47) and its direction (right-to-left
   * mirrors the layout); default the player's language. */
  export function setLanguage(tag: string, direction?: "ltr" | "rtl"): void;
  /** A subtree in another language. */
  export function lang(tag: string, build: () => void): void;
  /** Colors (sRGB) and sizes (logical pixels) over the player's settings:
   * the player's interface and text sizes multiply the sizes, and a
   * high-contrast setting replaces the colors (white text and outlines on
   * black, yellow accent and focus), also when the theme is set during a
   * frame. Each call changes what it names and keeps the rest of the
   * game's theme. */
  export interface Theme {
    fontSize?: number;
    headingSize?: number;
    smallSize?: number;
    padding?: number;
    spacing?: number;
    text?: ColorLike;
    muted?: ColorLike;
    panel?: ColorLike;
    control?: ColorLike;
    hovered?: ColorLike;
    pressed?: ColorLike;
    field?: ColorLike;
    accent?: ColorLike;
    focus?: ColorLike;
    outline?: ColorLike;
    /** The corner radius of styled widgets and panels (since API_MINOR
     * 12; default 0). Unstyled widgets stay square. */
    radius?: number;
  }
  export function setTheme(theme: Theme): void;

  // -- Styles (since API_MINOR 12) ---------------------------------------
  //
  // Looks a game registers once (`setStyles`) by widget kind (`"button"`)
  // and class (`".primary"`), and widgets name each frame (`style()`), so
  // menus can look like the game's original HTML and CSS while focus,
  // keyboard, gamepad, touch, screen readers and the player's settings
  // keep working. A widget's look is, in order, later winning: the
  // theme's defaults for its kind, the game's kind style, the `inside`
  // rules of its enclosing containers (outermost first), its classes in
  // the order given, and inline styles; then, for each of its states, the
  // state blocks of those in the order first, last, odd, even (where it
  // is among its container's children), hoverWithin, focusWithin,
  // hovered, focused, focusVisible, checked, selected, pressed, disabled
  // (CSS's practical precedence: a selected tool keeps its look under the
  // pointer, a press shows while held, disabled wins over all), whichever
  // rule gave the block: a kind's `hovered` loses to an `inside` rule's
  // `selected`. Each
  // property replaces what came before it (`background`, `shadow` and
  // `decorations` as a whole, as in CSS), except `padding`, `border` and
  // `text`, whose fields merge. Sizes are logical pixels. Sizes are
  // border-box (CSS `box-sizing: border-box`): a style's or layout's
  // `width` and `height` are the outer size, padding and border included,
  // so a port of content-box CSS adds the padding and border to its
  // widths. On widgets that hold text they are minimums (text never cuts:
  // it grows the box, or ellipsizes with `text.overflow`).
  //
  // The player's settings apply last and win: the interface size scales
  // every size (borders stay at least a pixel), the text size scales text,
  // and high contrast forces colors as CSS `forced-colors` does: one solid
  // fill by role and state (panels and controls black, hovered and pressed
  // greys, selected the theme's selection blue), white text (grey when
  // disabled), white borders at least 1 wide on controls (yellow when
  // focused or selected), no shadows, decorations in the text color,
  // opacity 1, and a yellow focus ring at least 3 wide even where a style
  // says `"none"`. Shapes, sizes, fonts and spacing stay.
  //
  // Styles are checked when registered: an unknown key or a value of the
  // wrong shape throws a TypeError (a typo CSS would ignore), a bound a
  // RangeError, and a call that throws registers nothing. A class named
  // with no style registered draws as if unnamed, with one warning in
  // the console (none for a class some `inside` rule names). Tokens are checked where used: one missing or of the
  // wrong kind leaves that property as it was, with one warning. Styles
  // are resolved once per combination of rules and state and cached, so a
  // frame's widgets cost a lookup each; register them once, not per frame.
  //
  // Widgets: buttons, labels, headings and paragraphs lay out and draw
  // whole by their style (padding, border, sizes, box and text). Containers
  // (`column`, `row`, `panel`, `scrollArea`, `dialog`) draw their box
  // behind their children and take its padding. `checkbox`, `slider`,
  // `progress`, `meter`, `select`, `cycle`, `textField` and `tabs` (each
  // tab) take the box behind them, the text color and the focus ring, and
  // since API_MINOR 12 their parts (`parts`: the slider's `track` and
  // `thumb`, the checkbox's `box` and `mark`, the select's `field`, `list`
  // and `option`, progress bars' and meters' `track` and `fill`, the tabs'
  // `strip` and `tab`, the dialog's `backdrop`, a scroll area's `track`
  // and `bar`) take their own; a part no style gives a look keeps the
  // theme's.
  //
  // The focus ring shows for focus the player sees (CSS
  // `:focus-visible`, since API_MINOR 12): focus moved by the keyboard,
  // a gamepad, `setFocus` or a screen reader. A press or tap focuses the
  // widget without it. `focused` matches any focus, `focusVisible` only
  // the former.
  //
  // Boxes past a frame's budget (131,072 vertices of styled boxes) draw
  // without shadows from the next frame, then without gradients (their
  // first color), never without content.

  /** The widget kinds a style key names. */
  export type WidgetKind =
    | "panel" | "column" | "row" | "label" | "heading" | "paragraph" | "image"
    | "progress" | "button" | "checkbox" | "slider" | "select" | "cycle"
    | "textField" | "tabs" | "scrollArea" | "dialog"
    | "widget" | "tooltip" | "meter" | "document"
    | "grid" | "stack";
  /** A token's name where its value goes: `"$gold"`. */
  export type Token = `$${string}`;
  /** A number in logical pixels, or a token for one. */
  export type Length = number | Token;
  /** The parts of compound widgets (`Style.parts`, since API_MINOR 12). */
  export type PartName =
    | "track" | "fill" | "thumb" | "box" | "mark" | "field" | "list"
    | "option" | "strip" | "tab" | "backdrop" | "bar";
  /** Per side: `start` and `end` follow the language's direction. */
  export interface Sides<T> { top?: T; end?: T; bottom?: T; start?: T }
  /** A corner: a radius, or a straight cut this far along each side (CSS
   * `clip-path` chamfers). */
  export type Corner = Length | { cut: Length };
  /** One corner for all four, or start-top, end-top, end-bottom,
   * start-bottom. Corners on a side that would overlap shrink together, as
   * in CSS. */
  export type Corners = Corner | readonly [Corner, Corner, Corner, Corner] | Token;
  /** A gradient stop: a color, spread evenly, or one `at` 0–1 (a
   * repeating gradient's: logical pixels). Since API_MINOR 12 `at` may be
   * two positions, a stop at each (CSS's `#ffcc33 0 5px`). */
  export type Stop = ColorLike | { color: ColorLike; at?: number | readonly [number, number] };
  export interface LinearGradient {
    type: "linear";
    /** Degrees, as CSS: 180 (default) top to bottom, 90 start to end. */
    angle?: number;
    /** 2 to 16 stops (RangeError). As CSS: the first defaults to 0, the
     * last to 1, missing ones spread between their neighbors; colors mix
     * premultiplied, so `transparent` fades. */
    stops: readonly Stop[];
    /** Repeats (since API_MINOR 12; CSS `repeating-linear-gradient`):
     * the stops' `at` are logical pixels along the gradient line, the
     * last one given (TypeError), and the pattern repeats every last less
     * first: stripes, scanlines, brushed metal. A hard stop (two colors at
     * one place) changes over one pixel, so stripes' edges are smooth; a
     * period under 2 window pixels (or more than 2,048 stops over the box)
     * draws as its average color instead of shimmering. */
    repeating?: boolean;
  }
  export interface RadialGradient {
    type: "radial";
    /** Fractions of the box (default 0.5, 0.5). */
    center?: { x: number; y: number };
    /** Fractions of the box, or CSS's extents (default
     * `"farthest-corner"`). */
    radius?: { x: number; y: number } | "farthest-corner" | "closest-side";
    /** `"ellipse"` (default, the box's proportions) or `"circle"`. */
    shape?: "ellipse" | "circle";
    stops: readonly Stop[];
    /** Repeating rings (since API_MINOR 12; CSS
     * `repeating-radial-gradient`): `at` in logical pixels along the
     * horizontal radius, as `LinearGradient.repeating`. Rings are drawn
     * as polygons at each stop, a quarter of a pixel at most inside
     * their curves (they were drawn on a grid of up to 96 cells a side,
     * several times the vertices); a box of rings that would take more
     * vertices than such a grid draws on the grid, so very fine ones
     * blur. */
    repeating?: boolean;
  }
  /** An image filling the box (since API_MINOR 12; CSS
   * `background-image`): a Texture (a loaded one: a Texture still
   * loading throws a TypeError when the style is registered) or an image
   * file of the game's by its path (PNG or WebP, loaded on first use and
   * drawn from the frame after it is ready; a missing or broken file is
   * warned once and draws nothing). The image counts against the game's
   * image budget. It is clipped to the box's corners, its edges
   * antialiased. A style or token holds its Texture while it names it
   * (the game need not keep it), and the Texture's `needsUpdate` shows in
   * the style from that frame, as in a material: a repainted CanvasTexture
   * or new DataTexture data. A canvas resized gets a new image: the keys
   * naming it are registered again with it (keys that `extends` one keep
   * the old image until they are registered again). */
  export interface ImageFill {
    image: Texture | string;
    /** The part of the image, in its pixels (an atlas region). */
    region?: { x: number; y: number; width: number; height: number };
    /** `"auto"` (default: the image's own size, a pixel of it a logical
     * pixel), `"cover"`, `"contain"` or [width, height] in logical
     * pixels, as CSS `background-size`. */
    size?: "auto" | "cover" | "contain" | readonly [number, number];
    /** Where the image sits in the free room, fractions (default the
     * center), as CSS `background-position`. */
    position?: { x: number; y: number };
    /** Tiles it across both axes (`true`), one (`"x"`, `"y"`) or none
     * (default), from `position`; past 256 tiles it is drawn once,
     * stretched over the box. */
    repeat?: boolean | "x" | "y";
    /** Multiplies the image (default white). */
    tint?: ColorLike;
  }
  /** An image nine-sliced over the box (since API_MINOR 12; CSS
   * `border-image`): frames and plates. `slice` cuts the image (its
   * pixels, top, right, bottom, left as CSS lists them, or one for all)
   * into corners drawn at their size, edges stretched along the box's
   * sides and a middle drawn (stretched) only with `fill`. `width` is how
   * wide the slices draw, logical pixels (default the slices' own sizes,
   * a pixel a logical pixel); slices wider than the box shrink together.
   * Not clipped to the box's corners, as CSS's. */
  export interface SliceFill {
    image: Texture | string;
    slice: number | readonly [number, number, number, number];
    width?: number | readonly [number, number, number, number];
    fill?: boolean;
    region?: { x: number; y: number; width: number; height: number };
    tint?: ColorLike;
  }
  /** A color, a gradient, an image (since API_MINOR 12), or a token
   * (`"$name"`) for one. High contrast draws every layer as one solid
   * color. */
  export type Fill = ColorLike | LinearGradient | RadialGradient | ImageFill | SliceFill;
  /** CSS `box-shadow`: logical pixels; `blur` as CSS's (a Gaussian of
   * deviation blur / 2), at most 128 (RangeError). Blurred and inset
   * shadows are baked once into images that count against the game's
   * image budget (16 MiB of them at most, the least recently used let go).
   * An inset shadow draws only inside the box. Since API_MINOR 20, as in
   * browsers, an outer shadow draws only outside the box's (rounded or
   * cut) border edge, so a translucent background never shows it through
   * (a focus ring made of `spread` stays a ring); before, it draws under
   * the whole box too, showing through a translucent background. */
  export interface Shadow {
    x?: Length;
    y?: Length;
    blur?: Length;
    spread?: Length;
    color: ColorLike;
    /** Inside the box (bevels, wells, a one-pixel highlight). */
    inset?: boolean;
  }
  export interface TextStyle {
    color?: ColorLike;
    /** Logical pixels (at least 10; the player's text size on top). */
    size?: Length;
    /** A family added with `canvas.fonts`, a generic family or a token. */
    font?: string;
    weight?: string;
    /** Extra logical pixels after each character, or `"0.12em"`. */
    letterSpacing?: number | `${number}em` | Token;
    /** What draws only: screen readers hear the text as written. */
    transform?: "none" | "uppercase" | "lowercase" | "capitalize";
    /** Where the text sits in the widget's content box; a paragraph's
     * lines each. */
    align?: "start" | "center" | "end";
    /** `"tabular"`: every digit takes the widest digit's advance. */
    numerals?: "proportional" | "tabular";
    /** Text shadows, drawn under the text, the last lowest (at most 4;
     * CSS `text-shadow`): an offset, a color and (since API_MINOR 12) a
     * `blur` up to 32 (RangeError; no `spread` or `inset`), a glow for
     * LED text. A blurred one is baked once into an image (keyed by the
     * text, face, size and blur) and counts against the image budget, as
     * box shadows do; text that changes every frame bakes every frame, so
     * keep glows for labels that hold still. Wrapped text (a paragraph)
     * draws its blurred shadows unblurred. High contrast drops them. */
    shadow?: Shadow | readonly Shadow[] | Token;
    /** An outline around each glyph, under its fill (since API_MINOR 12;
     * CSS `-webkit-text-stroke` with `paint-order: stroke`, at twice the
     * width): `width` logical pixels out (at most 4, RangeError), drawn as
     * the text 4 or 8 times around. High contrast drops it. */
    stroke?: { width?: number; color?: ColorLike } | "none";
    /** A linear gradient filling the text instead of `color` (since
     * API_MINOR 12; CSS `background-clip: text`): across the text's box,
     * baked once into an image like a glow. Wrapped text draws in its
     * first color. High contrast drops it. */
    fill?: LinearGradient | "none";
    /** `"ellipsis"`: text wider than the widget's width (its style's
     * `width`, else its column's) is cut with "…", after `maxLines` lines
     * (default 1). The whole text stays the widget's accessible name. */
    overflow?: "visible" | "ellipsis";
    maxLines?: number;
    opacity?: number;
  }
  /** A shape in the box (CSS `::before`/`::after` with absolute
   * position): an accent bar, a rule, a corner bracket, a chevron. Each
   * edge is logical pixels in from that side of the box; `width`/`height`
   * fix its size (a missing edge is 0 unless the size and the other edge
   * place it; with both edges and the size, the size is centred between
   * them, as CSS's inset with `margin: auto`: `{ top: 0, bottom: 0,
   * height: 9 }` stays vertically centred however tall the box grows).
   * It has a `fill`, a `border` or both. At most 8 a style. */
  export interface Decoration {
    fill?: Fill;
    /** A border-only shape (since API_MINOR 12): a chevron is a square
     * with a `top` and `end` border, turned 45 degrees. Width 1 unless
     * given. */
    border?: { width?: Length | Sides<Length>; color?: ColorLike };
    radius?: Corners;
    top?: Length;
    bottom?: Length;
    start?: Length;
    end?: Length;
    width?: Length;
    height?: Length;
    /** Degrees clockwise about its center (since API_MINOR 12; mirrored
     * right to left). Its blurred shadows turn with it since API_MINOR 13
     * (games declaring an older `engine.minor` keep them upright). */
    rotate?: number;
    /** Its glows and shadows, as a box's (since API_MINOR 12; outer
     * only). */
    shadow?: Shadow | readonly Shadow[] | Token;
    /** Over the content instead of under it. */
    over?: boolean;
    /** Multiplies its alpha, 0–1 (since API_MINOR 12; a chevron fading
     * in on hover). */
    opacity?: number;
  }
  export interface BoxStyle {
    /** Fill layers, first on top (at most 4). */
    background?: Fill | readonly Fill[];
    /** `style: "double"` draws two lines a third of the width each. */
    border?: { width?: number | Sides<number>; color?: ColorLike | Sides<ColorLike>; style?: "solid" | "double" };
    radius?: Corners;
    /** Outer and inset shadows, first on top (at most 6). */
    shadow?: Shadow | readonly Shadow[] | Token;
    /** Inside the border; part of `width` and `height` (border-box). */
    padding?: Length | Sides<Length>;
    /** Room outside the box (since API_MINOR 12), logical pixels: it keeps
     * the box from its siblings and its container's edges, and counts in
     * its container's size. Negative margins pull it out: into its
     * container's padding (`.console h2 { margin: 0 -14px }`, a full-bleed
     * header band, a divider or tab strip across a padded panel, with
     * `width: "fill"`), or over the sibling before it. A clipped container
     * still clips at its padding. The margin comes from the style without
     * its interaction states (layout doesn't move on hover; structural
     * blocks such as `first` apply). */
    margin?: Length | Sides<Length>;
    minWidth?: Length;
    minHeight?: Length;
    /** The outer width (border-box), at least, or `"fill"`: the whole
     * width of the column it is in (since API_MINOR 12 also its grid
     * cell's or stack's), less its margins. A column without a width is
     * as wide as its widest child, so `"fill"` in it fills only that: give
     * the column a `width`, or `align: "stretch"` in a column that has
     * one. In a row it has no effect. */
    width?: Length | "fill";
    height?: Length;
    opacity?: number | Token;
    /** Moves what draws (logical pixels); the widget still lays out, hits
     * and focuses where it is (a hover lift without jitter). */
    translate?: { x?: number; y?: number };
    /** Scales what the box draws, its children included, about its
     * center (since API_MINOR 12; 0–16, RangeError past it; CSS `scale`).
     * Drawing only, as `translate`. */
    scale?: number;
    /** Turns what the box draws about its center, degrees clockwise
     * (since API_MINOR 12; mirrored right to left; after `translate`, as
     * CSS composes them). Since API_MINOR 13 everything turns, as a CSS
     * transform turns an element: shapes, text (with its shadows, glows,
     * strokes and gradient fills), images, nine-slices and blurred
     * shadows, edges antialiased; boxes turned inside turned boxes add up.
     * Games declaring an older `engine.minor` keep text, images and
     * blurred shadows upright (they move with the turn). A game-drawn
     * widget's own drawing (`draw`) stays upright. Drawing only. */
    rotate?: number;
    /** How the look's values move when they change (since API_MINOR 12;
     * see `Transition`). The look changed to gives it, as in CSS. */
    transition?: number | Transition | readonly Transition[] | "none";
    /** A keyframe animation (since API_MINOR 12; see `Animation`). */
    animation?: Animation | "none";
    text?: TextStyle;
    decorations?: readonly Decoration[];
    /** The focus indicator (CSS `:focus-visible` outline): `offset`
     * outside the box (negative inside), or `"none"` (high contrast draws
     * one anyway). */
    focusRing?: { color?: ColorLike; width?: number; offset?: number; radius?: Corners } | "none";
    /** Blurs what is behind the box (since API_MINOR 12; CSS
     * `backdrop-filter: blur()`), logical pixels, at most 32 (RangeError):
     * the 3D scene and what the overlay drew before it, as a Gaussian of
     * that deviation, in the box's shape, under its background (glass
     * panels, a dialog's `backdrop` part). At most 4 a frame, within twice
     * the window's area; past them, at low graphics quality, and where
     * the renderer has no room for its copy of the frame (a half or a
     * quarter of the window, three images), the box draws its tint
     * instead: its first background color at least half opaque (black at
     * 35% without one). The scene under it is drawn again at that size
     * without shadows or post effects, which the blur hides. High
     * contrast turns it off. */
    backdropBlur?: number;
  }
  /** Box and text properties for a state (no nested states or `inside`). */
  export interface StateStyles {
    /** Where it is among its container's children (since API_MINOR 12;
     * CSS `:first-child`, `:last-child`, `:nth-child(odd)` and `(even)`,
     * counting from 1): in a grid, its column in its row (a grid's
     * `rowStyle` boxes: their row). `last` is the last of last frame's
     * children (a list that grows settles on its next frame). In `inside`
     * rules too: `inside: { label: { last: { text: { align: "end" } } } }`. */
    first?: BoxStyle;
    last?: BoxStyle;
    odd?: BoxStyle;
    even?: BoxStyle;
    /** The pointer over it (never a finger: since API_MINOR 13 also not
     * the pointer a platform moves with the first finger, so nothing
     * stays hovered after a tap; a mouse or pen hovers). */
    hovered?: BoxStyle;
    /** Held down: by a mouse or pen while its button is held, wherever
     * the pointer goes; by a finger (since API_MINOR 13) only while it is
     * down on the widget. */
    pressed?: BoxStyle;
    /** Any focus: keyboard, gamepad, pointer or a screen reader. */
    focused?: BoxStyle;
    /** Focus the player sees (since API_MINOR 12, CSS `:focus-visible`):
     * by keyboard, gamepad, `setFocus` or a screen reader, not a press. */
    focusVisible?: BoxStyle;
    /** A disabled or `ariaDisabled` button. */
    disabled?: BoxStyle;
    /** A ticked checkbox, a checked widget, a chosen select option. */
    checked?: BoxStyle;
    /** The chosen tab, a `selected` button, a chosen select option. */
    selected?: BoxStyle;
    /** Containers: the pointer over it or anything in it (never a
     * finger). */
    hoverWithin?: BoxStyle;
    /** Containers: focus on something in it. */
    focusWithin?: BoxStyle;
    /** What a widget appears from (since API_MINOR 12, CSS
     * `@starting-style`): built for the first time, or again after a frame
     * without it, it starts with this on top and transitions to its look.
     * Needs a `transition`. Skipped under reduced motion. */
    enter?: BoxStyle;
    /** What a widget leaves toward (since API_MINOR 12): one with this
     * block that stops being built keeps drawing its last frame's drawing
     * (its children included) while it transitions toward its look with
     * this on top, then goes. Only `opacity`, `translate`, `scale` and
     * `rotate` move in an exit (it replays drawing); it takes no input,
     * focus or accessibility node and draws above the rest of its layer.
     * Needs a `transition` (this block may give its own). Skipped under
     * reduced motion. A dialog and its `backdrop` part take both: build
     * the dialog only while it is open. */
    exit?: BoxStyle;
  }

  // -- Motion (since API_MINOR 12) ---------------------------------------
  //
  // Transitions, keyframe animations and enter and exit looks, as CSS's
  // `transition`, `animation`, `@keyframes` and `@starting-style`, on the
  // UI's clock (the frame times the game's UI sees; the same natively and
  // in browsers). When a widget's resolved look changes (a state, a class,
  // a token), each property group whose value changed moves from what
  // shows toward the new value over the transition naming it; a group no
  // transition names changes at once, and so does anything that is not a
  // group (padding, sizes, fonts). A transition interrupted on its way
  // back reverses from where it is, as long as it took to get there (as
  // CSS's). Colors mix premultiplied; a color blends with a gradient,
  // gradients of one type with as many stops blend, other fills switch;
  // shadows and decorations pair by index, a missing one transparent.
  // Motion follows widget ids (a label's, its text).
  //
  // The player's reduced motion: transitions are instant, enter and exit
  // skipped, and animations show their `rest`. `preferences().reducedMotion`
  // and `engine.preferences().reducedMotion` agree in every frame.
  //
  // Cost: widgets without motion in their styles keep no state; at most
  // 512 widgets move at once (later ones jump to their target, their
  // animations rest). While a shadow's blur or spread moves it takes steps
  // of 2 logical pixels (each baked once into the skin cache), its exact
  // value when the motion ends.

  /** What a transition names (`properties`): `"all"`, a style key whose
   * values move, `"transform"` (translate, scale and rotate), or a part of
   * the decorations. */
  export type TransitionProperty =
    | "all" | "background" | "border" | "radius" | "shadow" | "opacity"
    | "translate" | "scale" | "rotate" | "transform" | "text" | "focusRing"
    | "decorations" | "decorations.fill" | "decorations.position"
    | "decorations.opacity" | "decorations.rotate";
  /** A timing function, as CSS's: x1 and x2 of a cubic Bézier within 0–1
   * (RangeError), y free (overshoot); `steps` jumps at each step's end
   * (`position: "start"`: at its start). */
  export type Easing =
    | "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out" | "step-start" | "step-end"
    | { cubicBezier: readonly [number, number, number, number] }
    | { steps: number; position?: "start" | "end" };
  /** A transition: seconds (at most an hour; a negative duration is a
   * RangeError). A negative delay starts it partway. Without `properties`
   * it is every group's; in a list, a later one wins for a group both name
   * (at most 16): `[{ properties: "decorations.opacity", duration: 0.16 },
   * { properties: "decorations.position", duration: 0.2, easing: {
   * cubicBezier: [0.2, 0.8, 0.2, 1] } }]`. A number is `{ duration }`. */
  export interface Transition {
    duration: number;
    /** Default `"ease"`. */
    easing?: Easing;
    delay?: number;
    properties?: TransitionProperty | readonly TransitionProperty[];
  }
  /** A keyframe animation by its keyframes' name (`setAnimations`). It
   * starts when a widget first shows it (or the name changes) and plays
   * over its transitions. Keyframes without a `0%` (`from`) or `100%`
   * (`to`) take the widget's current look at those ends, as CSS's
   * implicit keyframes do: its state included (selected, hovered…), not
   * only its classes. A pulse of `{ "50%": { shadow: glow } }` on a
   * selected card therefore runs between the card's selected look and the
   * glow; name the ends (`"0%, 100%": { shadow: rest }`) to fix them
   * whatever the state. */
  export interface Animation {
    name: string;
    /** Seconds an iteration (default 0). */
    duration: number;
    /** A count (fractions allowed, default 1) or `"infinite"`. */
    iterations?: number | "infinite";
    direction?: "normal" | "reverse" | "alternate" | "alternate-reverse";
    /** Between each two keyframes, as CSS's animation-timing-function
     * (default `"ease"`; a keyframe's own `easing` wins). */
    easing?: Easing;
    delay?: number;
    /** What shows before it starts and after it ends (default `"none"`:
     * the widget's own look). */
    fill?: "none" | "forwards" | "backwards" | "both";
    /** Seconds more delay for each child before the widget in its
     * container: a menu's buttons cascading in (`stagger: 0.07`). */
    stagger?: number;
    /** `"paused"` freezes it where it is (as CSS; since API_MINOR 12 not
     * back at its delay's point), and `"running"` again carries on from
     * there; one that starts paused holds where its delay puts it (a
     * negative delay: that far in). */
    playState?: "running" | "paused";
    /** The keyframe offset (0–1) shown under reduced motion; by default
     * where it ends (an infinite one, where one iteration ends). */
    rest?: number;
  }
  /** A keyframe: the groups that move (anything else is a TypeError) and
   * the easing to the next. */
  export type Keyframe = Pick<
    BoxStyle,
    "background" | "border" | "radius" | "shadow" | "opacity" | "translate" | "scale" | "rotate" | "text" | "focusRing" | "decorations"
  > & { easing?: Easing };
  /** Registers keyframe animations by name (since API_MINOR 12, CSS
   * `@keyframes`): offsets `"from"`, `"to"` and percentages (`"50%"`,
   * several comma-separated). A group a keyframe at an end does not set
   * takes the widget's own value there. A name registered again is
   * replaced. At most 32 keyframes a name, 256 names (RangeError) and
   * 256 KiB of JSON a call; a call that throws registers nothing. A style
   * naming an animation not registered adds nothing (one warning). */
  export function setAnimations(animations: { readonly [name: string]: { readonly [offset: string]: Keyframe } }): void;
  export interface Style extends BoxStyle, StateStyles {
    /** Keys this one builds on, flattened when registered (they must be
     * registered before, or in the same call). */
    extends?: string | readonly string[];
    /** Rules for descendants, as CSS's `.speed button`: keys are kinds or
     * classes; they nest up to 4 deep. */
    inside?: { readonly [key: string]: Style };
    /** The parts of a compound widget (since API_MINOR 12; see
     * `PartName`): each a box and text style with state blocks, in the
     * widget's state (`option` and `tab` in their own). An unknown part
     * throws a TypeError. */
    parts?: { readonly [part in PartName]?: BoxStyle & StateStyles };
  }
  /** Registers styles under their keys: a widget kind (`"button"`) sets its
   * defaults, `".name"` a class. A key registered again is replaced. At
   * most 512 keys (RangeError) and 256 KiB of JSON a call. */
  export function setStyles(styles: { readonly [key: string]: Style }): void;
  /** The values `"$name"` stands for anywhere in a style: colors, numbers
   * (corners, sizes), font names, fills and shadows. A changed token
   * restyles every widget using it (a side's colors, a day/night palette)
   * without registering styles again. At most 512 tokens. */
  export function setTokens(tokens: { readonly [name: string]: ColorLike | number | string | Fill | Shadow | readonly Shadow[] | Corners }): void;
  /** Classes (with or without the dot; several in one string separated by
   * spaces) and inline style objects for the next widget or container,
   * later ones winning; falsy entries are skipped:
   * `ui.style("tool", active && "active").button(name)`. Chains with `id`
   * either way round. The next widget or container takes what is chained
   * (`style`, `id`, `tooltip`) whether or not it uses it (a spacer drops
   * it), so it never reaches the one after. A class with no style registered is skipped (one
   * warning). Prefer registered classes to inline objects, which are
   * checked each call. */
  export function style(...styles: readonly (string | Style | false | null | undefined)[]): typeof import("starhermit:ui");

  // -- From CSS (since API_MINOR 12) -------------------------------------
  //
  // A port's style sheet as styles, ready to register:
  //   const css = ui.stylesFromCss(files.readText("theme/style.css"), { path: "theme/style.css" });
  //   ui.setTokens(css.tokens); ui.setAnimations(css.animations); ui.setStyles(css.styles);
  // and `ui.row(label, build, css.layouts[".speed"])` where a container
  // was `display: flex` or `grid`. The engine reads the CSS itself and
  // never throws on it: what has no style is left out and listed in
  // `dropped` with the reason. `starhermit css FILE` writes the same
  // result as JSON, for a port to convert once and commit (read it back
  // with `files.readJson`). What maps and what is dropped: the spec's
  // "From CSS" section.
  //
  // Selectors: the types the UI has kinds for (`button`; `label` and
  // `span` as `label`; `p` as `paragraph`; `input` as `textField`,
  // `slider` (`[type=range]`) or `checkbox`; `textarea`, `select`,
  // `dialog`, `img`, `progress`, `meter`; `table` as `grid`; `tr`, `td`,
  // `th` as the classes `tr`, `td`, `th` for a grid's `rowStyle` and
  // `cellStyle`), `h1`–`h6` as the classes `h1`–`h6` since API_MINOR 16
  // (one heading kind: `ui.style("h2").heading(text)`; games declaring an
  // older `engine.minor` get every level as the `heading` kind), classes,
  // a compound of classes (`.a.b`) as the class `"a.b"` (name it last:
  // `ui.style("a", "b", "a.b")`), a type with a class as the class, since
  // API_MINOR 16 an id with no class (`#menu`, `button#go`) as the class
  // of its name (`ui.style("menu")`, each listed in `dropped`; dropped for
  // an older `engine.minor`), and descendants (`.speed button`, also `>`)
  // as `inside` rules up to 3 deep. `:hover` (on a container kind,
  // `hoverWithin`), `:active`, `:focus`, `:focus-visible`,
  // `:focus-within`, `:disabled`, `:checked`, `:first-child`,
  // `:last-child`, `:nth-child(odd)` and `(even)` are state blocks, as
  // are `.active`, `[aria-selected=true]` and `[aria-pressed=true]`
  // (`selected`), `[aria-checked=true]` (`checked`) and
  // `[aria-disabled=true]`; a scope's state moves to the styled key's
  // block (`.tool.active .icon` is `".tool": { inside: { ".icon": {
  // selected } } }`). `::before` and `::after` with `content: ""` and
  // `position: absolute` are decorations; `::backdrop` and the range and
  // progress pseudo-elements are parts. `:root` custom properties are
  // tokens, and `var(--name)` stands as `"$name"` where its value fits.
  //
  // The cascade: declarations for one key and state cascade as CSS's
  // (specificity, then order; `!important` is ignored and listed); across
  // keys the style cascade's order holds (kind, then `inside` rules, then
  // classes in the order named), CSS's for type < descendant < class. A
  // descendant rule for a class that the class's own rule also sets loses
  // in the style cascade though CSS's is more specific: it is listed in
  // `dropped` as shadowed.
  //
  // Sizes: styles are border-box, so a rule's content-box `width`,
  // `height`, `min-width` and `min-height` grow by its padding and border.
  // Content-box is CSS's default; a rule's own `box-sizing`, else `*`'s,
  // says otherwise. Since API_MINOR 16 `*`'s is that of `*` itself (with
  // `*::before, *::after`, which alone size no element) or, with
  // `inherit`, of `html` or `:root`; with no `*` rule `button`, `select`
  // and checkboxes are border-box as in browsers; and what it cannot
  // decide (a `box-sizing: inherit` on a rule, a value it cannot read) is
  // listed in `dropped`. Games declaring an older `engine.minor` read any
  // `*` rule's (pseudo-elements' too) as border-box or not, and nothing
  // else. `starhermit css` converts as the newest minor unless given
  // `--minor N`.

  export interface CssOptions {
    /** Logical pixels of `rem` (and of `em` where a rule gives no font
     * size): by default the sheet's own `:root` or `html` font size, else
     * the theme's default. */
    fontSize?: number;
    /** The families the game adds with `canvas.fonts`: a `font-family`
     * list takes the first of these, else its first generic family. */
    fonts?: readonly string[];
    /** The sheet's path in the package, which its `url()`s are relative to
     * (default the root). */
    path?: string;
  }
  /** What has no style, or is styled other than as written (an id as a
   * class, since API_MINOR 16), and why. */
  export interface CssDropped {
    readonly selector: string;
    /** The declaration's property (empty for a whole rule). */
    readonly property: string;
    readonly value: string;
    readonly reason: string;
    /** From 1; 0 for what was found once converted. */
    readonly line: number;
  }
  /** A container's layout from `display: flex` or `grid` (with
   * `flex-direction`, `justify-content`, `align-items`, `gap`, `flex-grow`,
   * `grid-template-columns` and `-rows`): `container` names the call that
   * takes it, which ignores the field. */
  export type CssLayout = Layout &
    Partial<Pick<GridLayout, "columns" | "rows" | "gap">> & { container?: "row" | "column" | "grid" };
  export interface CssStyles {
    readonly styles: { readonly [key: string]: Style };
    readonly animations: { readonly [name: string]: { readonly [offset: string]: Keyframe } };
    readonly tokens: { readonly [name: string]: ColorLike | number | string | Fill | Shadow | readonly Shadow[] };
    readonly layouts: { readonly [key: string]: CssLayout };
    readonly dropped: readonly CssDropped[];
  }
  /** Converts a style sheet (at most 1 MiB, RangeError): plain objects for
   * `setStyles`, `setAnimations` and `setTokens`, which take them as they
   * are. Not a TypeError for any CSS. Needs no frame: convert once, at
   * the start. */
  export function stylesFromCss(css: string, options?: CssOptions): CssStyles;
  /** What the player's settings make of the UI this frame (since
   * API_MINOR 11): `scale` is window pixels per logical pixel (the
   * window's scale factor times the player's interface size), `textScale`
   * the player's text size on top of it for text, and whether colors are
   * high-contrast and motion reduced. Read it each frame: it changes when
   * the window moves to another display or the player changes a setting
   * (`engine.onPreferencesChange` tells of the latter). A new frozen object
   * each call. */
  export interface UiPreferences {
    readonly scale: number;
    readonly textScale: number;
    readonly highContrast: boolean;
    readonly reducedMotion: boolean;
  }
  export function preferences(): UiPreferences;
  /** The size, in window pixels, that a widget with this text takes this
   * frame (since API_MINOR 11), within rounding of the rectangle it
   * returns: a `label` (the default `kind`), a `heading`, or a `button`
   * (its padding included); with `width` (logical pixels, a label's text
   * only) a `paragraph` that wide: its height and its widest line (the
   * paragraph's rectangle spans all of `width`). It measures with the
   * current scale and text size, the options' size, font and weight, and
   * the font (`setFont`) and text of the container it is called in.
   * Counts as a UI call. A `width` with `kind: "button"` throws a
   * TypeError, a non-finite one a RangeError. Since API_MINOR 12 it
   * measures as the widget draws: the kind's style (a `button` style's
   * padding) and the container's `inside` rules count, with or without
   * `style`. */
  export function measureText(
    text: string,
    options?: TextOptions & {
      width?: number;
      kind?: "label" | "heading" | "button";
      /** A widget in these classes and inline styles (since API_MINOR 12),
       * as `ui.style(…).button(text)` (or `label`, `heading`) lays it
       * out. */
      style?: string | Style | readonly (string | Style)[];
    },
  ): { width: number; height: number };

  // -- Richer widgets (since API_MINOR 12) -------------------------------

  /** What a `widget`'s `draw` gets after its rectangle. */
  export interface WidgetState {
    readonly hovered: boolean;
    readonly pressed: boolean;
    /** Any focus (the engine draws the ring for focus the player sees). */
    readonly focused: boolean;
    readonly disabled: boolean;
    /** A checked checkbox or toggle, a chosen radio. */
    readonly selected: boolean;
    /** A slider's or meter's value after this frame's input; else null. */
    readonly value: number | null;
    /** Window pixels per logical pixel (`preferences().scale`). */
    readonly scale: number;
    /** Draw with `colors`, which are the forced ones under high contrast. */
    readonly highContrast: boolean;
    readonly reducedMotion: boolean;
    /** The `widget` style's colors (CSS `rgba()` strings), else the
     * theme's for the state; the forced colors under high contrast. */
    readonly colors: { readonly text: string; readonly background: string; readonly accent: string; readonly border: string };
  }
  /** A region's pointer this frame, window pixels from its top-left. */
  export interface RegionPointer {
    readonly x: number;
    readonly y: number;
    /** Over the region (a drag that began in it keeps reporting outside). */
    readonly inside: boolean;
    /** Held: 1 primary, 2 secondary, 4 middle. */
    readonly buttons: number;
    /** A drag that began in it: how far the pointer moved since last frame. */
    readonly dragX: number;
    readonly dragY: number;
    /** Wheel notches over it (the region takes them: scroll areas around
     * it do not scroll). */
    readonly wheelX: number;
    readonly wheelY: number;
  }
  /** What a `widget` did this frame (a new frozen object each call). */
  export interface WidgetResult extends Rect {
    /** Clicked, or Enter, Space or South while focused (never disabled). */
    readonly activated: boolean;
    /** The secondary button pressed on it, or the context-menu key while
     * it has focus. */
    readonly secondary: boolean;
    readonly hovered: boolean;
    /** The pointer came onto it or left it this frame. */
    readonly entered: boolean;
    readonly left: boolean;
    /** Held down. */
    readonly pressed: boolean;
    readonly focused: boolean;
    /** Toggles, checkboxes and radios: on after this frame's activation. */
    readonly checked?: boolean;
    /** Sliders and meters: the value after this frame's input. */
    readonly value?: number;
    /** Regions: the pointer, and while focused the keys
     * (`KeyboardEvent.code`) and gamepad controls (`"DpadLeft"`, `"South"`)
     * pressed this frame. */
    readonly pointer?: RegionPointer;
    readonly keys?: readonly string[];
  }
  export interface WidgetSpec extends WidgetOptions {
    /** What it is to input and screen readers:
     *   "button"   activates (`activated`);
     *   "toggle"   a button announced pressed or not (`checked`), flipped
     *              on activation;
     *   "checkbox" as a toggle, announced as a checkbox;
     *   "radio"    chosen on activation; in a `radiogroup` container one
     *              of the group (arrows choose);
     *   "slider"   Left/Right step `value` by `step`, a press or drag sets
     *              it (on `min + k × step`);
     *   "meter"    shows `value`; takes no focus;
     *   "image"    takes no focus; the label is its description (empty:
     *              decorative);
     *   "none"     presentation: no node, no focus (a color swatch);
     *   "region"   an area that takes the pointer (`pointer`), and keys
     *              while focused (`keys`): a radar, a campaign map. With
     *              `arrows` it keeps the arrows and the D-pad instead of
     *              moving focus with them (Tab still leaves it: give
     *              gamepad players another way out). */
    role: "button" | "toggle" | "checkbox" | "radio" | "slider" | "meter" | "image" | "none" | "region";
    /** Logical pixels. */
    size: { width: number; height: number };
    /** Draws it, after its style's box and before its focus ring, with
     * `starhermit:draw` (or `draw.box`): its rectangle (window pixels, the
     * style's `translate` applied) and state. Its drawing goes where the
     * widget is among the UI's (over widgets built before it, under those
     * after), clipped as the widget is, and counts toward the overlay's
     * items and text as `starhermit:draw` does. It draws only: building a
     * widget in it throws a TypeError. Honour `state.highContrast` and
     * `state.reducedMotion`. */
    draw?: (rect: Rect, state: WidgetState) => void;
    /** Classes (styled as the `widget` kind). */
    style?: string | readonly string[];
    disabled?: boolean;
    checked?: boolean;
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    /** Read after the name ("Unlocks at 3 stars", "Campaign map: use the
     * arrows to pan"). */
    description?: string;
    arrows?: boolean;
  }
  /** A widget the game draws, with the engine's identity (its label, or
   * `id()`), focus order, keyboard, gamepad and touch navigation, focus
   * ring and accessibility node for its `role`: a board square, a cameo, a
   * dial, a swatch, a map. Counts toward the widgets a frame. */
  export function widget(label: string, spec: WidgetSpec): WidgetResult;
  export interface MeterOptions extends WidgetOptions {
    /** The range (default 0–1); `max` below `min` is a RangeError. */
    min?: number;
    max?: number;
    /** Values marked across the bar (a threshold, a target), at most 16. */
    markers?: readonly number[];
    /** Lit cells instead of a continuous fill, 0–64 (0: continuous). */
    segments?: number;
    /** Busy without a known value: a block sweeps along (resting in the
     * middle with reduced motion), announced busy. */
    indeterminate?: boolean;
    /** Logical pixels (default 200). */
    width?: number;
  }
  /** A gauge (power, fuel, a health bar) announced as a meter named
   * `label` with its value and range. Styled as `meter`, its parts `track`
   * and `fill` (each lit segment). */
  export function meter(label: string, value: number, options?: MeterOptions): Rect;
  /** A sheet the game paints (a letter, orders, a newspaper) that screen
   * readers read as `text`, in reading order: one document node named
   * `label`. `build` lays out as a column (`layout` as a container's) and
   * may draw anything; the nodes of what it builds give way to `text`,
   * except widgets that take focus (a Sign button stays). Styled as
   * `document`. */
  export function document(label: string, text: string, build: () => void, layout?: Layout): Rect;
  /** The font the UI lays out and draws its text with: a family added with
   * `canvas.fonts` (any case) at the face nearest `weight` (synthesized
   * bold at 600 and more for a family without a bold face), falling back
   * to the system's faces, or since API_MINOR 8 a generic family
   * (`serif`, `cursive`…, see `TextOptions.font`); null returns to the
   * default faces (`system-ui`, see `starhermit:draw`). A family never
   * added throws a TypeError. */
  export function setFont(font: { family?: string; weight?: string } | null): void;
}

// ===========================================================================
declare module "starhermit:audio" {
  import type { Unsubscribe } from "starhermit:engine";

  // Two ways to make sound, both mixed by the engine on the player's volume
  // buses (Options › Audio): clip playback for sound effects and music, and
  // a synthesis graph in the Web Audio model (`context`). The game's sound
  // is muted while the window is unfocused when the player asked for that.
  // In checks (`--check`, `--render-check`) the game plays silently on the
  // checks' simulated clock, as `frame().time` does: sounds' and streams'
  // ends, a stream's `position`, sources' `ended` and `currentTime` follow
  // the frames played, not real time, so a play script sees them at the
  // same frames in every run.

  /** The player's volume group a sound plays in. */
  export type Bus = "music" | "effects" | "interface";

  // -- Clips --------------------------------------------------------------------
  /** Decoded samples registered with the mixer. A game holds at most
   * `engine.limits.audio_clips` clips (128 by default; a manifest may raise
   * it up to 1,024 since API_MINOR 18) and min(`audio_mib`, 64 MiB) of clip
   * data (RangeError). Clips reach the mixer in the order they were
   * made, a few at a time; in a browser they wait for its audio, which
   * starts with the player's first press, so load them all at the start.
   * One the mixer could not make is logged as a warning, and `play` of it
   * then throws an Error saying why. */
  export class AudioClip {
    #private;
    private constructor();
    /** Seconds. */
    readonly duration: number;
    readonly sampleRate: number;
    readonly channels: number;
    /** Releases it and stops its sounds; using it afterwards throws a
     * TypeError. */
    dispose(): void;
  }
  /** Decodes a package file (WAV, Ogg Vorbis, Ogg Opus), read without
   * waiting for it (see `PackageFiles`). Rejects with a TypeError for a bad
   * path, `NotFoundError`, `NetworkError` when the file could not be had,
   * `EncodingError` for data it cannot decode, RangeError past the budget
   * or with 128 decodes already waiting. */
  export function loadClip(path: string): Promise<AudioClip>;
  /** From samples (−1..1): one array per channel (1–8), 8–192 kHz;
   * non-finite samples throw a TypeError. */
  export function createClip(channels: readonly Float32Array[], sampleRate: number): AudioClip;
  export interface PlayOptions {
    /** 0–16 (default 1). */
    gain?: number;
    /** Playback-rate multiplier, 0.125–8 (default 1). */
    pitch?: number;
    /** −1 (left) .. 1 (right); omitted: the clip's own channels. */
    pan?: number;
    loop?: boolean;
    /** Default `"effects"`. */
    bus?: Bus;
  }
  /** A playing clip. Control calls on a finished sound do nothing.
   * `fade`, `setPitch` and `setPan` never throw for the frame's audio
   * operations: the frame keeps the last of each per sound and sends the
   * mixer that one, so setting them every step or many times a frame
   * costs nothing more (before the runtime with host API 1.18 each counted
   * as one of the frame's 1,024 operations, a RangeError past them). */
  export class Sound {
    #private;
    private constructor();
    /** False once it ended (estimated from the clip's length and pitch; a
     * looping sound plays until stopped). */
    readonly playing: boolean;
    stop(): void;
    /** Ramps the gain over `seconds` (at most 60). */
    fade(gain: number, seconds: number): void;
    setPitch(pitch: number): void;
    setPan(pan: number | null): void;
    /** It ended or was stopped. */
    onEnded(listener: () => void): Unsubscribe;
  }
  /** At most min(`engine.limits.voices`, 256) sounds at once and 1,024 audio
   * operations a frame (plays, a stream's opening, play and pause, and
   * stops and releases, which always go through; a sound's or stream's
   * fade, pitch and pan are not counted); past either a RangeError, which
   * the game can catch. An Error ("the audio clip could not be made: …") for a
   * clip the mixer could not make. Past the player's sound limit (Options ›
   * Audio, by default Auto: the device's, never below 16 however loaded
   * the machine) a sound is not refused: it runs on silently and is heard
   * once there is room, as a sound the limit displaced. */
  export function play(clip: AudioClip, options?: PlayOptions): Sound;

  // -- Streams (host API 1.14) -----------------------------------------------------
  // Long music decoded as it plays: an Ogg Opus (1–2 channels) or Ogg
  // Vorbis (1–8 channels) package or remote file, holding no clip and none
  // of the clip budget. A stream holds at most 3 seconds of decoded audio
  // (2 in the mixer, 1 on its way; in a browser 7, 6 in the mixer, so a
  // page slow to draw does not starve it); a game plays at most 4 at once,
  // each one of its sounds (`play`'s limit). A remote file streams while it arrives
  // when the package's remote index lists its pieces (packaging does, for
  // Ogg files; each 256 KiB piece is checked against its pinned SHA-256
  // before it is decoded) and stays in the device's cache, so later plays
  // and runs read it from there, offline too; one listed without pieces is
  // fetched whole first. It starts once 0.25 s is decoded; when its audio
  // runs out (a slow network) it is `buffering`, silent, and plays on once
  // 1 s is decoded. Loops are gapless and exact to the sample; `fade`
  // ramps its gain as a sound's. In a browser streams start with the
  // page's audio (the player's first press). Natively a stream decodes on
  // a thread of its own; in a browser in the game's worker between its
  // calls, so a call running longer than about 3 s makes it wait.

  /** Where a stream stands: `loading` until first heard, `playing`,
   * `paused`, `buffering` (its audio ran out; it waits, silent), and
   * finally `ended` (the file's end, without a loop), `stopped` (`stop()`)
   * or `failed` (see `error`). */
  export type StreamState =
    | "loading"
    | "playing"
    | "paused"
    | "buffering"
    | "ended"
    | "stopped"
    | "failed";
  export interface StreamOptions {
    /** Default `"music"`. */
    bus?: Bus;
    /** 0–16 (default 1). */
    gain?: number;
    /** −1 (left) .. 1 (right); omitted: the file's own channels. */
    pan?: number;
    loop?: boolean;
    /** Seconds (default 0): where a loop starts again. */
    loopStart?: number;
    /** Seconds (default the file's end): where a loop turns; past
     * `loopStart`. */
    loopEnd?: number;
    /** Seconds into the file to start at (default 0). */
    start?: number;
    /** Wait for `play()` (default false: it plays as soon as it can). */
    paused?: boolean;
  }
  /** Music decoded as it plays (`stream`). */
  export class AudioStream {
    #private;
    private constructor();
    readonly path: string;
    readonly state: StreamState;
    /** Seconds into the file the player hears (through loops and seeks;
     * where it starts until it is heard). */
    readonly position: number;
    /** Seconds; NaN until the file's last page was read (at once for a file
     * on the device, early for one fetched in pieces). */
    readonly duration: number;
    /** Seconds decoded ahead of `position`. */
    readonly buffered: number;
    /** The share of the file on the device, 0 to 1. */
    readonly downloaded: number;
    /** Why it failed: a file that is not Ogg Opus or Ogg Vorbis, damaged
     * pages, or bytes no host served as the package pins. */
    readonly error: string | null;
    /** Plays on after `pause()`, or an ended stream again from its start.
     * TypeError once stopped. */
    play(): void;
    pause(): void;
    /** Ends it and releases it (its state becomes `stopped`). */
    stop(): void;
    /** Plays on from `seconds` into the file (past what has arrived, once
     * the file up to there has; past its end, the end, or the loop's start
     * for a stream that loops). RangeError below 0. */
    seek(seconds: number): void;
    /** Ramps the gain to `gain` (0–16) over `seconds` (at most 60). As
     * with a `Sound`, the frame keeps the last `fade` and `setPan`, which
     * never count against its audio operations. */
    fade(gain: number, seconds: number): void;
    setPan(pan: number | null): void;
    /** Each change of `state`, heard as a frame begins. */
    onStateChange(listener: (state: StreamState) => void): Unsubscribe;
  }
  /** Streams a package or remote file (a `NotFoundError` for one the
   * package does not have, a TypeError for a bad path or option, a
   * RangeError past 4 streams or the game's sounds). What the file holds is
   * known only as it is read: one that cannot play fails later (`failed`).
   * Declare `engine.minor=14`. */
  export function stream(path: string, options?: StreamOptions): AudioStream;

  // -- The synthesis graph (Web Audio subset) -------------------------------------
  // Names and semantics follow Web Audio for the supported subset. Times
  // are seconds of `context.currentTime` (the mixer's clock, rendered in
  // 128-frame quanta); times before now act now; negative times throw a
  // RangeError, non-finite values a TypeError. Bounds: min(`voices`, 256)
  // nodes, 1,024 connections, 1,024 automation events per parameter and
  // 16,384 in all, curves of at most 65,536 values, 32 MiB of buffers
  // (4,096 at most) and 32 MiB of delay lines, 256 periodic waves, and an
  // estimated render cost of 20,000 units at 48 kHz (less above): a node
  // costs gain 5, constant source 4, stereo panner 5, oscillator 20, buffer
  // source 40, biquad 28, delay 25, and from its first ramp, target, curve
  // or parameter connection on 20, 14, 75, 210, 42, 280 and 42; each
  // connection 2: past one a RangeError. An automation event counts until
  // the clock passes it, except that a setValue or setTarget (`value =`
  // included) supersedes a setValue or setTarget right before it at the same
  // time, which could no longer affect any value: so
  // `setTargetAtTime(v, currentTime, tc)` once a frame holds one event while
  // the clock stands still (a browser's audio before the page's first
  // press), but events at different future times still fill the budget
  // meanwhile. Not supported: channel count settings (buffers are mono or
  // stereo), wave shapers, convolvers, compressors, analysers, 3D panners
  // and listeners, IIR filters, channel splitters and mergers, worklets,
  // media nodes and offline contexts; `AudioParam.value` reads the last
  // value set, not the automation's progress.

  export type AutomationRate = "a-rate" | "k-rate";
  export abstract class AudioParam {
    #private;
    /** Setting it is `setValueAtTime(value, currentTime)`. Computed values
     * clamp to `minValue`..`maxValue`. */
    value: number;
    readonly defaultValue: number;
    readonly minValue: number;
    readonly maxValue: number;
    /** `InvalidStateError` for a parameter fixed at k-rate. */
    automationRate: AutomationRate;
    setValueAtTime(value: number, startTime: number): AudioParam;
    linearRampToValueAtTime(value: number, endTime: number): AudioParam;
    /** RangeError for a target of 0. */
    exponentialRampToValueAtTime(value: number, endTime: number): AudioParam;
    /** A time constant of 0 jumps to the target. */
    setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParam;
    /** At least 2 values (`InvalidStateError`), duration above 0
     * (RangeError); overlapping other events is `NotSupportedError`. */
    setValueCurveAtTime(values: readonly number[] | Float32Array, startTime: number, duration: number): AudioParam;
    cancelScheduledValues(cancelTime: number): AudioParam;
    cancelAndHoldAtTime(cancelTime: number): AudioParam;
  }
  /** Where the graph's sound goes: one of the player's volume buses. */
  export abstract class AudioBusNode {
    #private;
    readonly bus: Bus;
  }
  export abstract class AudioNode {
    #private;
    readonly context: AudioContext;
    readonly numberOfInputs: number;
    readonly numberOfOutputs: number;
    /** Fan-in sums; connecting twice does nothing. Into a source node is
     * `IndexSizeError`; a cycle not passing through a delay is
     * `NotSupportedError` (Web Audio would silence it instead). */
    connect<T extends AudioNode | AudioBusNode>(destination: T): T;
    /** Adds the output (down-mixed to mono) to a parameter's value. */
    connect(destination: AudioParam): void;
    /** All connections, or one; `InvalidAccessError` if not connected. */
    disconnect(destination?: AudioNode | AudioParam | AudioBusNode): void;
    /** Disconnects the node and frees it now (non-standard): it stops
     * counting toward the graph's bounds and any later use throws
     * `InvalidStateError`. Without it, Web Audio's lifetime rules hold: a
     * source that ended is freed by itself, and any other node is freed
     * once nothing connects into it (or only freed nodes do) and the
     * script holds no reference to it (it was garbage collected). */
    release(): void;
  }
  export abstract class AudioScheduledSourceNode extends AudioNode {
    /** Once (`InvalidStateError` twice). */
    start(when?: number): void;
    /** After `start` (`InvalidStateError` before); a later stop replaces an
     * earlier one. */
    stop(when?: number): void;
    onended: (() => void) | null;
    addEventListener(type: "ended", listener: () => void): void;
    removeEventListener(type: "ended", listener: () => void): void;
  }
  export abstract class GainNode extends AudioNode {
    /** Default 1. */
    readonly gain: AudioParam;
  }
  export type OscillatorType = "sine" | "square" | "sawtooth" | "triangle" | "custom";
  export abstract class OscillatorNode extends AudioScheduledSourceNode {
    /** Setting `"custom"` is `InvalidStateError`: use `setPeriodicWave`. */
    type: OscillatorType;
    /** Hz, default 440, ±Nyquist. */
    readonly frequency: AudioParam;
    /** Cents, default 0, ±153,600. */
    readonly detune: AudioParam;
    setPeriodicWave(wave: PeriodicWave): void;
  }
  export abstract class PeriodicWave {
    #private;
  }
  export type BiquadFilterType = "lowpass" | "highpass" | "bandpass" | "lowshelf" | "highshelf" | "peaking" | "notch" | "allpass";
  export abstract class BiquadFilterNode extends AudioNode {
    type: BiquadFilterType;
    /** Hz, default 350, 0..Nyquist. */
    readonly frequency: AudioParam;
    readonly detune: AudioParam;
    /** Default 1. */
    readonly Q: AudioParam;
    /** dB, default 0 (shelf and peaking types). */
    readonly gain: AudioParam;
    /** Equal lengths, else `InvalidAccessError`. */
    getFrequencyResponse(frequencyHz: Float32Array, magResponse: Float32Array, phaseResponse: Float32Array): void;
  }
  export abstract class StereoPannerNode extends AudioNode {
    /** −1..1, default 0. */
    readonly pan: AudioParam;
  }
  export abstract class DelayNode extends AudioNode {
    /** Seconds, 0..the node's maximum. */
    readonly delayTime: AudioParam;
  }
  export abstract class ConstantSourceNode extends AudioScheduledSourceNode {
    /** Default 1. */
    readonly offset: AudioParam;
  }
  /** Mono or stereo samples for buffer sources. */
  export abstract class AudioBuffer {
    #private;
    readonly sampleRate: number;
    readonly length: number;
    readonly duration: number;
    readonly numberOfChannels: number;
    getChannelData(channel: number): Float32Array;
    copyToChannel(source: Float32Array, channelNumber: number, bufferOffset?: number): void;
    copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset?: number): void;
  }
  export abstract class AudioBufferSourceNode extends AudioScheduledSourceNode {
    /** Set once (`InvalidStateError` a second time). */
    buffer: AudioBuffer | null;
    loop: boolean;
    /** Seconds of buffer time; 0 and 0 loop the whole buffer. */
    loopStart: number;
    loopEnd: number;
    /** k-rate. */
    readonly playbackRate: AudioParam;
    readonly detune: AudioParam;
    start(when?: number, offset?: number, duration?: number): void;
  }
  /** The game's one synthesis graph: `new AudioContext()` returns `context`
   * (options are ignored), so web code ports unchanged. */
  export class AudioContext {
    #private;
    constructor(options?: { latencyHint?: string; sampleRate?: number });
    /** Seconds of mixer time, as the mixer's clock reads now (its last
     * report, a few frames old, plus the time since; also in the first
     * frames after the page or window was hidden): a source started at
     * `currentTime` starts at once, one at `currentTime + k` k seconds
     * later. It stands still while `state` is `"suspended"`. */
    readonly currentTime: number;
    readonly sampleRate: number;
    /** `"suspended"` while the game's audio waits to start: in a browser,
     * until the player's first press on the page that the browser counts
     * as a gesture (Web Audio's autoplay policy: a click, a tap or a key,
     * but not a modifier key alone; until then each press tries again);
     * `"running"` once it runs, and natively from the start. Clips, sounds,
     * streams and the graph wait meanwhile. */
    readonly state: "running" | "suspended";
    /** Fires when `state` changes (in a browser, as audio starts); natively
     * never. */
    onstatechange: ((event: { type: "statechange" }) => void) | null;
    addEventListener(type: "statechange", listener: (event: { type: "statechange" }) => void): void;
    removeEventListener(type: "statechange", listener: (event: { type: "statechange" }) => void): void;
    /** The effects bus (what web code's `destination` becomes). */
    readonly destination: AudioBusNode;
    bus(name: Bus): AudioBusNode;
    createGain(): GainNode;
    createOscillator(): OscillatorNode;
    createBiquadFilter(): BiquadFilterNode;
    createStereoPanner(): StereoPannerNode;
    /** `maxDelayTime` seconds, 0 < x < 180 (default 1; `NotSupportedError`
     * outside). */
    createDelay(maxDelayTime?: number): DelayNode;
    createConstantSource(): ConstantSourceNode;
    createBufferSource(): AudioBufferSourceNode;
    /** 1–2 channels at 3–768 kHz (`NotSupportedError` otherwise). */
    createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer;
    /** Noise for buffer sources (there is no noise node): `seconds` of
     * white, pink or brown noise, looped seamlessly when played with `loop`. */
    createNoiseBuffer(seconds: number, color?: "white" | "pink" | "brown"): AudioBuffer;
    /** Equal lengths of at least 2 (`IndexSizeError`); coefficients whose
     * unnormalized wave exceeds the float range are a RangeError. */
    createPeriodicWave(real: Float32Array | readonly number[], imag: Float32Array | readonly number[], constraints?: { disableNormalization?: boolean }): PeriodicWave;
    /** Decodes WAV, Ogg Vorbis or Ogg Opus bytes (mono or stereo); at most
     * 128 decodes wait at once (RangeError). */
    decodeAudioData(data: ArrayBuffer | Uint8Array): Promise<AudioBuffer>;
    /** Decodes a package file, read without waiting for it (see
     * `PackageFiles`); rejects as `loadClip` does. */
    loadBuffer(path: string): Promise<AudioBuffer>;
    /** Resolves once audio runs: at once unless it waits to start, else
     * with the page's first press, as `statechange` fires (a game cannot
     * start audio itself: the press does). */
    resume(): Promise<void>;
    /** Resolves at once; the graph runs while the game does. */
    suspend(): Promise<void>;
  }
  export const context: AudioContext;
}

// ===========================================================================
declare module "starhermit:platform" {
  import type { JsonValue, Unsubscribe } from "starhermit:engine";
  import type { ImageBitmap } from "starhermit:canvas";

  // The StarHermit platform for the game's own id, through the engine's SDK:
  // the runtime holds the player's credentials and socket tickets, and no
  // call ever returns a token, key or cookie. Needs the manifest's
  // `platform` capability (without it, calls reject with kind
  // `not-allowed`). Results are plain JSON objects (snapshots: call again
  // for fresh data); ids are strings; times are milliseconds since the
  // Unix epoch. Calls reject with a `PlatformError`. Requests are paced by
  // the platform's rate limits; sends that the SDK paces return false
  // instead of throwing. Leaderboard scores, achievements and match
  // results are written by the game's server script, never by clients.
  // A guest (signed out, or a run with `--guest`) makes only the platform's
  // public reads, which it answers without a sign-in: `serverTime()`,
  // `leaderboards.list()` (since API_MINOR 19's runtime) and
  // `leaderboards.entries()` by a board's id (not `friendsOnly`); every
  // other call rejects with `signed-out`.
  // Started by the StarHermit client, a game plays as the client's signed-in
  // player from its first frame (`player()` answers in `onStart`); the
  // player signs in and out in the client, and the session ends with
  // `expired` when the client goes away. In browsers a game plays as the
  // player the page's address carried (the launcher's, or the platform's
  // sign-in's) from its first frame too, and the session ends with
  // `expired` when that sign-in does (at most 12 hours). At most 64 calls wait on the
  // platform at once (more queue in the module, at most 1,024).

  export type PlatformErrorKind =
    | "not-allowed"
    | "signed-out"
    | "terms-required"
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "conflict"
    /** Since API_MINOR 19: a room refused because the player is connected
     * to another room, of this game or another (the platform's `409`, code
     * `active_room_elsewhere`; it names neither room nor game). Before 19
     * it is `conflict`, with that code. */
    | "active-room-elsewhere"
    | "precondition-failed"
    | "too-large"
    | "rate-limited"
    | "quota-exceeded"
    | "invalid"
    | "unavailable"
    | "server"
    | "transport"
    | "cancelled";
  export interface PlatformError extends Error {
    readonly name: "PlatformError";
    readonly kind: PlatformErrorKind;
    /** The HTTP status, when the platform answered. */
    readonly status?: number;
    /** The platform's error code (`"terms_version_mismatch"`). */
    readonly code?: string;
    /** Seconds to wait (rate limits). */
    readonly retryAfter?: number;
  }

  // -- The player ---------------------------------------------------------------
  export interface Player {
    readonly userId: string;
    readonly username: string;
    /** The nickname, else `"Player " + the id's first 8 characters`. */
    readonly displayName: string;
    /** BCP 47. */
    readonly language: string;
  }
  /** The signed-in player, or null for a local guest. */
  export function player(): Player | null;
  export function onPlayerChange(listener: (player: Player | null) => void): Unsubscribe;
  /** What the platform launched the game for (since API_MINOR 9). */
  export interface LaunchContext {
    /** A game session to open at once: an invite the player accepted on
     * the dashboard or in the StarHermit client, "open this game" from a
     * notification. A GUID in lower case (`sessions.get` it, or
     * `connectGame` it, rather than landing in the game's lobby). */
    readonly sessionId?: string;
  }
  /** What the platform launched this run for, or null (a launch from the
   * library, a guest, or no `platform` capability), since API_MINOR 9. Read
   * as the game starts and the same (frozen) object every call; a game
   * restarted in the same run sees it again, so check the session is still
   * on (`sessions.get`) before joining. It comes with the launch's player:
   * in browsers the page's `#session_id=` beside its `#game_token=`
   * (the runtime takes both out of the page's address before the game
   * starts), from the StarHermit client the `sessionId` of its hello; an
   * id that is not a GUID is dropped. */
  export function launchContext(): LaunchContext | null;
  /** Why the player's session ended: they signed out (in the Options
   * menu), another device took over the game, the platform needs the terms
   * accepted again, the credentials expired or were revoked. The game then
   * plays as a guest (`player()` is null) until the player signs in again. */
  export type SessionEndReason = "signed-out" | "elsewhere" | "terms-required" | "expired" | "revoked";
  export function onSessionEnded(listener: (reason: SessionEndReason) => void): Unsubscribe;
  /** Opens the runtime's own Account dialog, where the player signs in
   * (games never draw sign-in themselves, and never see credentials; in a
   * run the StarHermit client started, the dialog shows the client's
   * player, who signs in there).
   * Resolves with the player once signed in, or null when they close it.
   * In browsers signing in leaves the page for the platform's sign-in,
   * which brings the player back to a new run of the game, signed in (this
   * run's promise never settles).
   * Only while handling one of the player's presses, or during the
   * `onUpdate` and `onRender` of a frame in which a `starhermit:ui` widget
   * was activated by a press (the rule `clipboard.writeText` and pointer
   * lock follow); otherwise `NotAllowedError`. Builds without the platform
   * reject with `unavailable`. */
  export function requestSignIn(): Promise<Player | null>;
  export interface Profile {
    readonly id: string;
    readonly username: string;
    readonly nickname: string | null;
    readonly displayName: string;
  }
  export function profile(userId: string): Promise<Profile>;
  /** The player's avatar (at most 4 MB), or null. */
  export function avatar(userId: string): Promise<ImageBitmap | null>;
  export interface GameStats {
    readonly elo?: number;
    readonly wins?: number;
    readonly losses?: number;
    readonly draws?: number;
  }
  /** This game on the platform and the player's standing in it. */
  export function gameInfo(): Promise<{
    /** The game's id (a UUID). */
    readonly id: string;
    /** The game's URL slug (what invite links name). */
    readonly slug: string;
    readonly name: string;
    readonly leaderboardId: string | null;
    readonly replaysEnabled: boolean;
    readonly me: GameStats | null;
  }>;
  /** The player's shareable invite link to this game
   * (`https://dashboard.starhermit.com/game-invite/<userId>/<slug>`);
   * rejects with `signed-out` for a guest. */
  export function inviteLink(): Promise<string>;

  // -- The platform's clock (since API_MINOR 17) ---------------------------------
  // Trusted time for what the player must not move by setting the device's
  // clock (a daily challenge's seed, a cooldown): the platform's clock
  // (`GET /api/v1/time`), read the same way natively and in browsers, in a
  // run the StarHermit client started and on the platform's page. Guests
  // read it too (the platform answers it without a sign-in; signed in, the
  // player's session asks). With the platform out of reach `serverTime()`
  // rejects (`transport`, `unavailable`, `rate-limited`) and `serverNow()`
  // stays null until a reading succeeds, so the game falls back to the
  // device's clock (or refuses the daily challenge) as it chooses. A
  // guest's failed reading is no error: the runtime notes the first once,
  // at debug level (the page's console in browsers, stderr natively), and
  // a host that serves no clock (a plain loopback or self-hosted server,
  // whose `/api/v1/time` answers 404) is not asked again that run, later
  // readings rejecting as the first did (`not-found`). A browser may still
  // list that one request's 404 in its own network log.
  /** The platform's time when its answer arrived, in whole milliseconds
   * since the Unix epoch (since API_MINOR 17): the platform's reading plus
   * half the request's round trip, the platform being taken to read its
   * clock halfway through it (within half the round trip, typically tens
   * of milliseconds). One request, never retried (`rate-limited` with
   * `retryAfter` when the platform is busy); calls made while one waits
   * share its answer. Each answer is also `serverNow()`'s new reading. */
  export function serverTime(): Promise<number>;
  /** The platform's time now, in whole milliseconds since the Unix epoch,
   * without a request (since API_MINOR 17): the last `serverTime()`
   * reading carried forward on the monotonic clock (`performance.now()`),
   * so changing the device's clock does not move it; cheap enough for
   * every frame. Accurate to the reading's (half its round trip) plus the
   * monotonic clock's drift; signing in or out keeps it. Null until the
   * first reading: the first call starts one (as
   * `await serverTime()` at the start does), and later calls read again
   * after 30 minutes, when the wall and monotonic clocks part by more than
   * 5 seconds (the device slept or its clock was set; until then the time
   * is the monotonic clock's), or when a reading's answer took over 10
   * seconds to reach the game. A failed reading is tried again a minute
   * later, each in the background. */
  export function serverNow(): number | null;

  // -- Friends and presence -------------------------------------------------------
  export interface Friend {
    readonly userId: string;
    readonly username: string;
    readonly online: boolean;
    readonly currentGame: string | null;
  }
  export interface FriendRequest {
    readonly id: string;
    readonly senderUserId: string;
    readonly senderUsername: string;
    readonly createdAt: number;
  }
  /** A game's launch token reads the friend list; requests, answers and
   * removals need the player's account session (the platform refuses them
   * with `forbidden` in a run the StarHermit client started). */
  export const friends: {
    list(): Promise<Friend[]>;
    requests(): Promise<FriendRequest[]>;
    send(userId: string): Promise<void>;
    answer(requestId: string, accept: boolean): Promise<void>;
    remove(userId: string): Promise<void>;
    /** Friends coming online or going offline (while a socket is open). */
    onPresence(listener: (userId: string, online: boolean) => void): Unsubscribe;
  };

  // -- Rooms and their realtime socket ----------------------------------------------
  export type RoomStatus = "lobby" | "open" | "playing" | "closed";
  /** A seated player or AI. Players who left are not listed (the platform
   * keeps their rows with a `leftAt`; the runtime leaves them out). */
  export interface Participant {
    readonly id: string;
    readonly userId: string | null;
    /** The name taken at join (the nickname, else the username). */
    readonly username: string;
    /** The name to show (since API_MINOR 19's runtime): `username`,
     * except a username a sign-up generated, shown as `Player-` and 8
     * hex digits of the account's id (never a name from the sign-in
     * provider's profile); an AI seat's is its drawn name. */
    readonly displayName: string;
    readonly isAi: boolean;
    readonly isHost: boolean;
    readonly team: number;
    readonly slot: number;
  }
  export interface Room {
    readonly id: string;
    readonly name: string | null;
    readonly hostUserId: string;
    readonly status: RoomStatus;
    /** The room's shape as created (the platform's room config). */
    readonly teamCount: number;
    readonly seatsPerTeam: number;
    readonly backfillAfterSeconds: number | null;
    /** Set once the match started. */
    readonly gameSessionId: string | null;
    readonly participants: readonly Participant[];
    readonly joinCode: string | null;
    /** For `update`'s compare-and-set. */
    readonly revision: number;
    readonly metadata: JsonValue;
  }
  export interface NewRoom {
    /** 1–2. */
    teamCount: number;
    /** 1–100 (at most 100 seats). */
    seatsPerTeam: number;
    name?: string;
    isVisible?: boolean;
    joinInProgress?: boolean;
    aiPlayers?: number;
    backfillAfterSeconds?: number;
    /** How many of the seats still empty when the match starts become AI
     * players (the platform's backfill allowance): a count from 0 to the
     * room's seats (`teamCount × seatsPerTeam`; a RangeError past them),
     * at most that many, the emptiest team first, the rest staying empty;
     * `true` or none fills every empty seat (the platform's default);
     * `false` is 0, starting with the empty seats left empty (a game
     * fine underfilled handles them). A count since 1.16.0; earlier
     * runtimes take only a boolean. It does not change `aiPlayers`,
     * seated when the room is created. */
    backfillAiPlayers?: boolean | number;
    /** At most 16 KB of JSON. */
    metadata?: JsonValue;
  }
  export interface RoomSummary {
    readonly id: string;
    readonly name: string | null;
    readonly freeSeats: number;
    readonly joinInProgress: boolean;
  }
  export interface RoomInvite {
    readonly id: string;
    readonly roomId: string;
    readonly fromUserId: string;
    readonly fromUsername: string;
  }
  export type RoomSocketState = "connecting" | "open" | "reconnecting" | "closed";
  /** Why a socket stopped for good. */
  export type SocketStop = "signed-out" | "terms-required" | "forbidden" | "build-mismatch" | "ended" | "superseded" | "message-too-big" | "closed";
  export interface RoomSocketEvents {
    /** On the first connection and on every reconnection. */
    open: () => void;
    /** It reconnects by itself (backoff 0.5 s doubling to 30 s). */
    disconnected: (code: number, retryInMs: number) => void;
    stopped: (reason: SocketStop) => void;
    /** A participant's binary or text message (`sendData`), its bytes as
     * sent. `from` is the sender's participant id: the `id` of their
     * entry in the room's `participants` (not their `userId`), as a
     * lower-case GUID (`"00112233-4455-6677-8899-aabbccddeeff"`), which
     * the platform writes on each frame itself, so it cannot be forged:
     * trust it, never a sender named inside the payload. A guest's
     * messages reach only the host and the host's reach everyone else,
     * so a guest hears only the host's. */
    data: (from: string, payload: Uint8Array) => void;
    /** `ready`, `chat` or a host's `event` frame (an addressed one without
     * its recipients). */
    control: (from: string, kind: "ready" | "chat" | "event", frame: JsonValue) => void;
    /** The platform pushes the room on connecting and on every change,
     * carrying only its `status`, `gameSessionId` and `participants` (the
     * host marked by `isHost`, which sets `hostUserId`). The runtime merges
     * the push into the room as last known (from the game's room calls or
     * an earlier push), so `joinCode`, `metadata`, `name`, `revision` and
     * the shape (`teamCount`, `seatsPerTeam`, `backfillAfterSeconds`) stay
     * what they were: a game may replace its room with this one (since
     * API_MINOR 19's runtime; earlier ones left them null or 0). A push before
     * any room call returned the room has only what it carries: no join
     * code, null metadata and a zero shape. */
    roster: (room: Room) => void;
    result: (result: JsonValue) => void;
    presence: (userId: string, online: boolean) => void;
  }
  /** The room's realtime socket. */
  export class RoomSocket {
    #private;
    private constructor();
    readonly state: RoomSocketState;
    /** Connected with `{ targeted: true }` (since API_MINOR 19's runtime):
     * its host may name the recipients of `sendData` and `sendEvent`. */
    readonly targeted: boolean;
    on<E extends keyof RoomSocketEvents>(event: E, listener: RoomSocketEvents[E]): Unsubscribe;
    /** At most 8 KB; paced to 28 a second (burst 45): false when dropped.
     * `to` (a targeted socket's host only; since API_MINOR 19's runtime)
     * names the participants it reaches, by their `id` (as `data` events
     * name senders, either case): at most 100, an empty array reaching
     * nobody (nothing is sent); without it the host's reach everyone else
     * as always. Receivers hear it as any other. The platform closes a
     * host's socket for a malformed list, so a list that is not an array
     * of at most 100 participant ids, or `to` on a socket not connected
     * with `{ targeted: true }`, throws a TypeError; the message with its
     * recipients (1 byte, and 16 for each) past 8 KB a RangeError. A
     * guest's (or a host not yet named by a roster) is dropped: false. */
    sendData(payload: Uint8Array | string, to?: readonly string[]): boolean;
    /** Control frames: a guest may send 10 a minute. */
    sendReady(): boolean;
    sendChat(text: string): boolean;
    /** Host only: an event frame with these fields (at most 4 KB). The
     * host is the one the latest roster names, or before the first one
     * (which the platform sends on connecting) the one the game's room
     * calls last returned. `to` names its recipients on a targeted socket
     * as `sendData`'s does (an empty array: nobody); there the fields may
     * not have a `to` of their own (a TypeError: the platform would read
     * it as the recipients), which a first-protocol socket relays as the
     * game's data. */
    sendEvent(kind: string, fields?: { [key: string]: JsonValue }, to?: readonly string[]): boolean;
    close(): void;
  }
  export const rooms: {
    /** One active room per player, of any game: while the player is
     * connected to another room's socket, creating or joining one (by
     * code, quick join or an invite) rejects with `active-room-elsewhere`
     * (since API_MINOR 19; `conflict` before, with the code
     * `active_room_elsewhere`); a room they hold a seat in but no socket
     * (a tab closed mid-match) is left first, as `leave` would. */
    create(room: NewRoom): Promise<Room>;
    /** At most 50. */
    browse(options?: { inProgress?: boolean }): Promise<RoomSummary[]>;
    get(roomId: string): Promise<Room | null>;
    mine(): Promise<Room | null>;
    joinByCode(code: string): Promise<Room>;
    /** Joins an open room of this game with a free seat, preferring the
     * given shape; without `teamCount`/`seatsPerTeam` any shape matches.
     * Null when none is open. */
    quickJoin(options?: { teamCount?: number; seatsPerTeam?: number; metadata?: JsonValue; includeInProgress?: boolean }): Promise<Room | null>;
    /** Compare-and-set on `expectedRevision` (`conflict` when stale). */
    update(roomId: string, changes: Partial<Pick<NewRoom, "name" | "isVisible" | "joinInProgress" | "metadata">>, expectedRevision: number): Promise<Room>;
    /** Host only. */
    open(roomId: string): Promise<Room>;
    /** Host only; idempotent; `unavailable` while the game server wakes. */
    start(roomId: string): Promise<Room>;
    /** Stops this room's sockets with `ended`; a socket whose player left
     * elsewhere stops with `ended` when it next reconnects. */
    leave(roomId: string): Promise<void>;
    /** Host only. */
    seat(roomId: string, seats: readonly { participantId: string; team: number; slot: number }[]): Promise<Room>;
    invite(roomId: string, userId: string): Promise<void>;
    invites(): Promise<RoomInvite[]>;
    acceptInvite(inviteId: string): Promise<Room>;
    declineInvite(inviteId: string): Promise<void>;
    /** The room's socket. `{ targeted: true }` (since API_MINOR 19's
     * runtime) connects it with the platform's addressed host frames
     * (`?proto=2`, opt-in per socket): its host's `sendData` and
     * `sendEvent` may name their recipients; a guest's messages are
     * unchanged. Hidden from other guests, never from the host: what no
     * client may see belongs in a server-run match. */
    connect(roomId: string, options?: { targeted?: boolean }): RoomSocket;
  };

  // -- Sessions, matchmaking and the game socket -------------------------------------
  export interface Session {
    readonly sessionId: string;
    readonly status: "active" | "finished";
    readonly players: readonly { readonly userId: string; readonly username: string }[];
    readonly myTurn: boolean;
    readonly deadline: number | null;
    readonly chatConversationId: string | null;
  }
  export interface Queue {
    readonly key: string;
    readonly teams: number;
    readonly teamSize: number;
    readonly players: number;
  }
  export interface MatchTicket {
    readonly ticketId: string;
    readonly status: "queued" | "matched" | "cancelled" | "expired";
    readonly sessionId: string | null;
    readonly waitedSeconds: number;
    readonly maxWaitSeconds: number;
  }
  export interface SessionInvite {
    readonly inviteId: string;
    readonly status: string;
    readonly from: string;
    readonly to: string;
    readonly sessionId: string | null;
  }
  export const sessions: {
    list(): Promise<Session[]>;
    get(sessionId: string): Promise<Session | null>;
    leave(sessionId: string): Promise<void>;
    /** A session against the game's AI; resolves with its id. */
    practice(): Promise<string>;
    invite(userId: string, sessionId?: string): Promise<SessionInvite>;
    invites(): Promise<{ incoming: SessionInvite[]; outgoing: SessionInvite[] }>;
    acceptInvite(inviteId: string): Promise<string>;
    declineInvite(inviteId: string): Promise<void>;
  };
  export const matchmaking: {
    queues(): Promise<Queue[]>;
    enqueue(queues: readonly string[]): Promise<MatchTicket>;
    /** From a room (the room's players queue together). */
    enqueueRoom(roomId: string, queues: readonly string[]): Promise<MatchTicket>;
    ticket(): Promise<MatchTicket | null>;
    cancel(): Promise<void>;
  };
  export interface GameSocketEvents {
    /** On the first connection and on every reconnection (send your resync
     * command here). */
    open: () => void;
    disconnected: (code: number, retryInMs: number) => void;
    stopped: (reason: SocketStop) => void;
    /** The server script's broadcast data. */
    game: (data: JsonValue) => void;
    error: (message: string) => void;
    presence: (userId: string, online: boolean) => void;
    membership: (data: JsonValue) => void;
    achievement: (data: JsonValue) => void;
    /** Reconnected after `lostMs`: discard local prediction and resync. */
    resumed: (lostMs: number) => void;
    abandoned: (reason: string) => void;
  }
  /** The session's game socket (`ws/v1/games`): commands and realtime input
   * to the game's server script, its broadcasts back. Text frames of at
   * most 16 KB. It connects with the game's current build (`?build=`), so
   * once the game's server is redeployed with another build a reconnection
   * stops with `build-mismatch` (the player updates the game). */
  export class GameSocket {
    #private;
    private constructor();
    readonly state: RoomSocketState;
    on<E extends keyof GameSocketEvents>(event: E, listener: GameSocketEvents[E]): Unsubscribe;
    /** Sends the platform's `{"type": "cmd", "data": data}` frame; the
     * server script receives `data` as `ctx.message.data` in
     * `onPlayerMessage` (`ctx.message.from` is the player). About 20 a
     * second; false when paced. */
    sendCommand(data: JsonValue): boolean;
    /** Sends the fields as one realtime input frame with `type: "input"`
     * and `realtime: true` set (a `type` or `realtime` of the game's is
     * replaced); the server script receives the whole object as
     * `ctx.inputs[i].data` in its next `onTick`. 60 a second (burst 120);
     * false when paced. */
    sendInput(data: { [key: string]: JsonValue }): boolean;
    close(): void;
  }
  export function connectGame(sessionId: string): GameSocket;

  // -- Leaderboards, achievements, replays ------------------------------------------------
  export interface Leaderboard {
    readonly id: string;
    readonly key: string;
    readonly name: string;
    readonly scoreType: string;
    readonly sortDirection: "ascending" | "descending";
    readonly resetSchedule: string | null;
    readonly nextResetAt: number | null;
  }
  export interface LeaderboardEntry {
    readonly userId: string;
    readonly username: string;
    /** The name to show (since API_MINOR 19's runtime): the platform's,
     * else `username` with a generated sign-up name shown as `Player-`
     * and 8 hex digits of the account's id. */
    readonly displayName: string;
    readonly score: number;
    readonly rank: number;
    readonly submittedAt: number;
  }
  export const leaderboards: {
    /** The game's active boards (their ids and keys). Anyone's, guests
     * included (since API_MINOR 19's runtime: the platform answers it
     * without a sign-in; before, a guest's rejected with `signed-out`).
     * Reads only: every board is written by the game's server script,
     * never by clients. */
    list(): Promise<Leaderboard[]>;
    /** A page of a board's entries, by its id; `pageSize` 1–100. Anyone's,
     * guests included (the platform answers it without a sign-in), except
     * `friendsOnly`, which is a player's (a guest's rejects with
     * `signed-out`). An unknown id rejects with `not-found`. */
    entries(leaderboardId: string, options?: { friendsOnly?: boolean; page?: number; pageSize?: number; scope?: string; region?: string }): Promise<{ items: LeaderboardEntry[]; total: number; page: number; pageSize: number }>;
  };
  export interface Achievement {
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly points: number;
    readonly secret: boolean;
    readonly unlocked: boolean;
    readonly unlockedAt: number | null;
  }
  export const achievements: {
    list(): Promise<Achievement[]>;
  };
  export interface ReplaySummary {
    readonly sessionId: string;
    readonly players: readonly { readonly userId: string; readonly username: string }[];
    readonly finishedAt: number;
    readonly result: JsonValue;
    readonly moveCount: number;
  }
  export interface ReplayDetail extends ReplaySummary {
    readonly state: JsonValue;
  }
  /** Finished sessions the server script kept as replays (clients cannot
   * upload). */
  export const replays: {
    /** `limit` 1–50. */
    list(options?: { limit?: number }): Promise<ReplaySummary[]>;
    /** The platform's replay detail: `state` is the session state the
     * server script last returned (where a replay it recorded lives). */
    get(sessionId: string): Promise<ReplayDetail>;
  };

  // -- Chat and voice ---------------------------------------------------------------------
  export interface ChatMessage {
    readonly id: string;
    readonly senderId: string;
    readonly senderUsername: string;
    /** Data from another player: show it as text. */
    readonly content: string;
    readonly kind: "text" | "system_rename";
    readonly sentAt: number;
    readonly editedAt: number | null;
    readonly isDeleted: boolean;
  }
  export interface Conversation {
    readonly id: string;
    readonly type: "direct" | "group" | "game";
    readonly name: string | null;
    readonly unreadCount: number;
  }
  export class ChatChannel {
    #private;
    private constructor();
    /** Polled about every 5 s; new messages once each. */
    on(event: "message", listener: (message: ChatMessage) => void): Unsubscribe;
    on(event: "error", listener: (error: PlatformError) => void): Unsubscribe;
    /** Queued (at most 32 waiting) and sent at the platform's pace (10 a
     * minute); 1–4,000 characters (RangeError). False when the queue is
     * full. */
    send(text: string): boolean;
    close(): void;
  }
  export const chat: {
    conversation(conversationId: string): Promise<Conversation>;
    /** `pageSize` 1–100. */
    messages(conversationId: string, options?: { page?: number; pageSize?: number }): Promise<{ items: ChatMessage[]; page: number; pageSize: number; totalCount: number }>;
    post(conversationId: string, text: string): Promise<ChatMessage>;
    edit(conversationId: string, messageId: string, text: string): Promise<ChatMessage>;
    /** Leaves a tombstone. */
    delete(conversationId: string, messageId: string): Promise<void>;
    markRead(conversationId: string): Promise<void>;
    subscribe(conversationId: string): ChatChannel;
  };
  export type VoiceConnection = "off" | "joining" | "connecting" | "connected" | "reconnecting" | "failed";
  export interface VoiceParticipant {
    readonly userId: string;
    readonly username: string;
    readonly muted: boolean;
    readonly serverMuted: boolean;
    readonly deafened: boolean;
    readonly speaking: boolean;
    /** 0–2, this player's own setting for them. */
    readonly volume: number;
    readonly locallyMuted: boolean;
  }
  export interface VoiceStatus {
    readonly connection: VoiceConnection;
    readonly muted: boolean;
    readonly serverMuted: boolean;
    readonly deafened: boolean;
    readonly transmitting: boolean;
    /** 0–1. */
    readonly inputLevel: number;
    readonly participants: readonly VoiceParticipant[];
  }
  /** Voice chat in a conversation (at most 10 talking). Needs the `voice`
   * capability; joining asks for the microphone through the runtime's
   * prompt and lights its indicator while it is live. */
  export const voice: {
    /** Joins the conversation's voice room (made if none; rejects with
     * `not-allowed` when the player refused the microphone). Resolves with
     * the status once connected. One room at a time: a join leaves the
     * room before. */
    join(conversationId: string): Promise<VoiceStatus>;
    leave(): Promise<void>;
    setMode(mode: "push-to-talk" | "open-mic"): void;
    /** Push-to-talk: transmit while true (call from an action's press and
     * release). */
    setTransmitting(transmitting: boolean): void;
    setMuted(muted: boolean): void;
    setDeafened(deafened: boolean): void;
    /** 0–2 (the native runtime plays a voice at most at full level). */
    setVolume(userId: string, volume: number): void;
    setLocallyMuted(userId: string, muted: boolean): void;
    /** Positional voice: where a participant's voice comes from (world
     * meters, null for none) relative to the scene's camera (full level
     * within 2 m, silent past 50 m). */
    setPosition(userId: string, position: { x: number; y: number; z: number } | null): void;
    /** Pans a participant's voice (−1 left .. 1 right; null: centered), on
     * top of `setVolume`, for games that place voices themselves. */
    setPan(userId: string, pan: number | null): void;
    status(): VoiceStatus;
    onStatus(listener: (status: VoiceStatus) => void): Unsubscribe;
  };

  // -- Reports ------------------------------------------------------------------------------
  /** Reports a player or their content to moderation (`reason` at most 64
   * characters). */
  export function reportPlayer(report: { targetUserId: string; reason: string; note?: string; sessionId?: string }): Promise<{ flagId: string; status: string }>;
  /** A bug report with the runtime's version and platform attached
   * (`title` at most 200 characters). */
  export function reportBug(report: {
    title: string;
    description: string;
    sessionId?: string;
    /** The game's own state for the report (at most 16 KB as JSON;
     * RangeError past it). */
    context?: JsonValue;
  }): Promise<{ id: string; status: string }>;
}

// ===========================================================================
declare module "starhermit:world" {
  // Game logic the runtime runs natively (spec/native-logic.html). Entity
  // data lives in tables of typed columns in the game's heap; kernels are
  // ordinary functions of one row that the runtime compiles and runs over
  // whole tables without entering script; the schedule runs them each
  // frame; event queues report back; instance bindings draw a table as an
  // InstancedMesh. Since API_MINOR 1; node bindings, table history, row
  // ids, strided and sliced schedules and tracked bindings since
  // API_MINOR 3.
  import type { InstancedMesh, Object3D } from "starhermit:scene";

  /** A column's type. Scalars: f32, f64, i32, u32, u16, u8 and bool (0 or
   * 1 in a byte). Vectors (f32 components x, y, z, w): vec2, vec3, vec4,
   * quat. `ref:<table>`: a row of that table (an i32: its id when the
   * table has `ids`, else its index; reading through one that names no
   * live row gives 0). */
  export type ColumnType =
    | "f32"
    | "f64"
    | "i32"
    | "u32"
    | "u16"
    | "u8"
    | "bool"
    | "vec2"
    | "vec3"
    | "vec4"
    | "quat"
    | `ref:${string}`;
  export type FieldType = "f32" | "f64" | "i32" | "u32" | "u16" | "u8" | "bool";

  /** Rows with typed columns in one buffer of the game's heap (an 8-byte
   * header, then each column for all rows, a vector's components
   * interleaved per row as in three.js attributes). Rows 0..count are
   * live. Names are identifiers of at most 64 characters; `index` is the
   * row view's own. Limits: 1,048,576 rows, 64 columns, 1 GiB, and what
   * the heap has left (a RangeError before anything is allocated); 256
   * tables a game. Tables, kernels and queues last for the game's
   * lifetime. */
  export class Table {
    private constructor();
    readonly name: string;
    readonly capacity: number;
    readonly count: number;
    /** The column as a typed array over the table's memory (Float32Array
     * for f32 and vector columns, Float64Array, Int32Array for i32 and
     * references, Uint32Array, Uint16Array, Uint8Array for u8 and bool),
     * `capacity × components` long: writing it writes the rows, and it
     * copies nothing. TypeError for an unknown column. */
    column(name: string): Float32Array | Float64Array | Int32Array | Uint32Array | Uint16Array | Uint8Array;
    /** Adds `n` zeroed rows at the end and returns the first one's index
     * (RangeError past the capacity). */
    spawn(n?: number): number;
    /** Live row `index`'s id (with `ids`; -1 for a row that is not
     * live or a table without ids). */
    id(index: number): number;
    /** The live row an id names, or -1 (freed, or not one of this
     * table's). */
    find(id: number): number;
    /** A history column's previous fixed step, as a typed array like
     * `column` (TypeError for a column without one). */
    previous(name: string): Float32Array | Float64Array | Int32Array | Uint32Array | Uint16Array | Uint8Array;
    /** Rows `index..index + n` (all live rows by default) take their
     * current values as their previous step, so nothing blends from where
     * they were (a teleport, or rows just filled). */
    settle(index?: number, n?: number): void;
    /** Marks rows `index..index + n` (one row by default; every row
     * without arguments) changed, for `track` instance bindings: writes
     * through column views are not seen otherwise (kernel runs, spawn and
     * free are). */
    touch(index?: number, n?: number): void;
    /** Removes live rows `index..index + n`: the last rows move into the
     * gap (order is not kept: row indexes held elsewhere are the game's to
     * update, ids follow their rows). RangeError for rows that are not
     * live. */
    free(index: number, n?: number): void;
    clear(): void;
    /** A view of live row `index`: its columns as fields (`row.speed`,
     * `row.base.y`, booleans for bool columns, a read-only row of the other
     * table for a reference), `row.index`, and with a history the
     * read-only `row.prev` (`row.prev.pos.x`). RangeError past the live
     * rows. */
    row(index: number): any;
  }
  export type Blend = "lerp" | "slerp" | "angle";
  export interface TableOptions {
    /** Columns that keep their previous fixed step (a hidden copy, in the
     * table's memory): as each fixed step begins, before
     * `onFixedUpdate`, every live row's current value becomes its
     * previous one. Kernels read it as `r.prev.col`; bindings draw such a
     * column between its two steps at the frame's interpolation: `lerp`
     * component-wise (numbers and vectors), `slerp` the short way round
     * (quat and vec4), `angle` radians the short way round (f32 and
     * f64). */
    history?: Record<string, Blend>;
    /** Rows have ids (`table.id(row)`): an id follows its row when `free`
     * moves it and names nothing once the row is freed (its slot takes
     * the next generation). A `ref:` column into such a table holds ids,
     * so a reference survives frees elsewhere and a stale one reads 0 (and
     * is counted as missed). Without ids, references are row indexes. */
    ids?: boolean;
  }
  /** A table: the schema's keys, in order, are its columns. */
  export function table(name: string, capacity: number, schema: Record<string, ColumnType>, options?: TableOptions): Table;

  /** A kernel's row (the runtime checks the kernel against the schema). */
  export type Row = any;
  /** A kernel's frame values: `time` (game seconds; in the fixed stage the
   * fixed clock, the sum of the steps so far with this one), `dt` (this
   * step's or frame's seconds), `alpha` (the render interpolation in the
   * late stage, else 0) and `step` (fixed steps so far, this one included
   * in the fixed stage). */
  export interface FrameValues {
    readonly time: number;
    readonly dt: number;
    readonly alpha: number;
    readonly step: number;
  }
  export type Reduction = "sum" | "min" | "max" | "argmin" | "argmax";
  export interface KernelOptions {
    /** Values rows give the kernel's outputs (`o.total(x)`): a sum from 0,
     * a minimum or maximum (as Math.min and Math.max), or the first row
     * with the smallest or largest value (-1 for none). The scheduled
     * entry's `outputs` has them after each run. At most 64. */
    outputs?: Record<string, Reduction>;
    /** "script": a function outside the subset runs as script (with one
     * warning) instead of throwing. */
    fallback?: "script";
  }
  /** A compiled kernel over a table. */
  export class Kernel {
    private constructor();
    readonly table: Table;
    /** Compiled; false when it runs as script (`fallback`). */
    readonly native: boolean;
    /** Instructions a row at most (loops counted at their bounds). */
    readonly cost: number;
    /** The uniforms it reads and the columns it writes. */
    readonly uniforms: readonly string[];
    readonly writes: readonly string[];
  }
  /** Compiles `fn(row, uniforms, frame, outputs)` to run natively over the
   * table's live rows. A run computes exactly what calling it once per
   * row, in row order, with row views would (f64 arithmetic, stores
   * converted as typed arrays convert them, the interpreter's own Math; any
   * NaN stands for NaN). The subset: number and boolean `let` and `const`
   * locals (a `const` may also name a row or a vector); arithmetic,
   * bitwise, comparison, logical (`&&`, `||`, `??`) and conditional
   * operators; `if`/`else`; `for` loops whose test is the same for every
   * row (constants, uniforms, frame values and a counter declared in the
   * loop), at most 1,024 iterations, with `break` and `continue`; `return`;
   * `Math`'s functions and constants (not `random`), `Number.isFinite`,
   * `isNaN`, `isInteger` and `Number`'s constants; the row's fields and
   * vector components, `row.index`, a history's `row.prev`, and other
   * rows through `ref:` columns
   * (`r.target.x`: 0 when the index is not a live row of that table,
   * counted); uniforms (`u.amp`); frame values (`f.time`); outputs
   * (`o.total(x)`); `queue.emit({ … })` into a queue made with `events`;
   * helpers declared with `kernel.fn` (inlined, never recursive); and
   * constants declared with `const` and a constant value. Queues, helpers
   * and constants are the kernel's file's own or imported by name from the
   * game's files (`import { SPEED } from "./rules.ts"`, re-exports
   * followed; not namespace or default imports). A kernel writes only its
   * own row and
   * cannot read, on another row, a column it writes; it emits and gives
   * outputs outside loops. Anything else (strings, BigInt literals, …)
   * throws a SyntaxError naming the file, line and column (with
   * `fallback: "script"`, it runs as script).
   * At most 1,024 kernels. */
  export function kernel(
    table: Table,
    fn: (row: Row, uniforms: any, frame: FrameValues, outputs: any) => void,
    options?: KernelOptions,
  ): Kernel;
  export namespace kernel {
    /** Declares a helper kernels may call (`const ease = kernel.fn((x:
     * number) => x * x)`); returns `helper` itself, so it runs as script
     * too. */
    function fn<F extends (...args: any[]) => any>(helper: F): F;
  }

  /** A kernel on the schedule. */
  export class Scheduled {
    private constructor();
    readonly kernel: Kernel;
    /** The uniforms the kernel reads, each a number; set them any time
     * (the next run reads them). Other names, and values that are not
     * numbers, are a TypeError. */
    readonly uniforms: Record<string, number>;
    /** The outputs of the last run. */
    readonly outputs: Record<string, number>;
    /** Reads through references that found no live row, since
     * scheduled. */
    readonly missedGathers: number;
    cancel(): void;
  }
  /** Each runs `kernel` natively every frame without entering script:
   * `fixed` after each `onFixedUpdate`, `update` after `onUpdate`, `late`
   * after `onRender` and the scene's update (then the instance bindings).
   * A stage runs its entries in the order they were scheduled; one
   * scheduled or cancelled while the stage runs waits for the next. A run
   * is charged to its call's fuel (ten row instructions an instruction)
   * and may use at most a whole call's fuel; past that, or with a loop past
   * 1,024 iterations, it throws a RangeError (uncaught, it ends the game).
   * `uniforms` gives exactly the uniforms the kernel reads. At most 1,024
   * entries. */
  export const schedule: {
    fixed(kernel: Kernel, uniforms?: Record<string, number>, options?: ScheduleOptions): Scheduled;
    update(kernel: Kernel, uniforms?: Record<string, number>, options?: ScheduleOptions): Scheduled;
    late(kernel: Kernel, uniforms?: Record<string, number>, options?: ScheduleOptions): Scheduled;
  };
  /** A rotating subset of the rows a run, for 1/n of the cost: each row
   * runs every n-th time. `f.dt` stays the frame's (scale it by n for a
   * per-row rate); rows that move (spawn, free) may skip or repeat a turn.
   * One of the two (1 to 1,024; 1 by default). */
  export interface ScheduleOptions {
    /** Every `stride`-th live row, from one row further each run (spread
     * evenly through the table). */
    stride?: number;
    /** One of `slices` contiguous slices of the live rows (each
     * ceil(count / slices) rows), the next slice each run: with a `track`
     * binding, one range of instances a frame (the browser's "an eighth of
     * the crowd a frame"). */
    slices?: number;
  }

  /** A bounded queue of typed events that kernels and script emit. */
  export class Events {
    private constructor();
    readonly name: string;
    readonly capacity: number;
    /** Adds an event (each field converted as its type stores it; a
     * missing field is NaN as a number). A full queue drops it and counts
     * it. */
    emit(event: Record<string, number | boolean>): void;
    /** The events since the last drain, oldest first (bool fields as
     * booleans). */
    drain(): Record<string, number | boolean>[];
    /** Events dropped because the queue was full, since it was made. */
    readonly dropped: number;
  }
  /** A queue of events with these fields (1 to 16, in order) holding at
   * most `capacity` events (1,024 by default, at most 65,536). At most 64
   * queues. Room for its events (8 bytes a field) comes out of the game's
   * heap as the queue is made: a RangeError when the heap has not that
   * much left. */
  export function events(name: string, schema: Record<string, FieldType>, capacity?: number): Events;

  /** Where a bound mesh's instances come from: column names (`"col"` for a
   * whole vector or a scalar, `"col.x"` for a component) or lists of them.
   * `position` (3 values) is required; `rotation` (a quat or vec4) or
   * `yaw` (radians about +y); `scale` (a number, one value or 3); `color`
   * (3 values, linear RGB, multiplying the material's). */
  export interface InstanceMapping {
    position: string | readonly string[];
    rotation?: string | readonly string[];
    yaw?: string;
    scale?: number | string | readonly string[];
    color?: string | readonly string[];
    /** Composes only rows that changed since the last frame: rows a
     * scheduled kernel that writes columns ran on (all of them, or its
     * stride's or slice's), rows
     * spawned or moved by free, and rows marked with `Table.touch`. Other
     * script writes through column views are not seen, so a game that
     * makes them touches the rows. A mapping with a history column
     * composes every row every frame regardless (it blends). */
    track?: boolean;
  }
  export class Binding {
    private constructor();
    /** Ends the binding: the script owns the channels again, from the
     * rows' last values. */
    remove(): void;
  }
  export const bind: {
    /** Draws the table's live rows as the mesh's instances (at most the
     * mesh's count): the runtime composes each instance's matrix (as
     * three.js `Matrix4.compose`) and color from the columns natively each
     * frame, after the late stage. While bound, the mesh's own instance
     * matrices and count are not used. A row that is not finite draws
     * nothing. Columns with a history are drawn between their last two
     * fixed steps at the frame's interpolation (as are bound nodes'). A
     * mesh is bound once; at most 256 bindings. */
    instances(mesh: InstancedMesh, table: Table, mapping: InstanceMapping): Binding;
    /** Drives the nodes' local transforms from rows: node k from row
     * `first + k` (rows that are not live leave their nodes alone). The
     * runtime writes the bound channels natively each frame after the late
     * stage and the scene's update, so the binding wins; the channels it
     * does not bind stay the script's. While bound, reading a bound
     * channel in script (`position`, `rotation`, `quaternion`, `scale`,
     * `matrix`, and so `matrixWorld`, `getWorldPosition`, `lookAt` and
     * the rest) gives the row's current values, as three.js would after
     * the table was written; writing one has no effect past the next
     * frame. `visible` is not reflected in `object.visible`. A node is
     * bound once at a time; at most 65,536 nodes a binding, 256 bindings. */
    nodes(nodes: readonly Object3D[], table: Table, mapping: NodeMapping, first?: number): Binding;
  };
  /** Where bound nodes' channels come from (column names or lists of them,
   * as in `InstanceMapping`): `position` (3 values); `quaternion` (4, x y
   * z w, normalized) or `rotation` (3 Euler angles in radians, in `order`,
   * "XYZ" by default, as three.js `Euler`); `scale` (a number, one value or
   * 3); `visible` (one value, shown when truthy). At least one. */
  export interface NodeMapping {
    position?: string | readonly string[];
    quaternion?: string | readonly string[];
    rotation?: string | readonly string[];
    order?: "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";
    scale?: number | string | readonly string[];
    visible?: string;
  }

  /** Since the game started: kernel runs, row instructions, gathers that
   * found no live row, events dropped. */
  export function stats(): {
    readonly runs: number;
    readonly rowInstructions: number;
    readonly missedGathers: number;
    readonly droppedEvents: number;
  };
}

// ===========================================================================
declare module "starhermit:script" {
  import type { JsonValue, Unsubscribe } from "starhermit:engine";
  import type { RoomSocketState } from "starhermit:platform";

  /** Evaluates a classic (non-module) package script in the game's own
   * realm, synchronously, so its globals (a shared simulation published on
   * `globalThis`) become available; it runs on the calling callback's fuel.
   * Throws a TypeError for a bad path or a file that is not a script
   * (.js, .mjs, .ts or .mts), `NotFoundError`, a `SyntaxError` for a script
   * that does not parse, or what the script throws. Outside a "use strict"
   * directive (and outside classes) it runs as browsers run classic scripts
   * (sloppy mode): an assignment that fails (a frozen object's property, a
   * getter-only one) is ignored and a refused `delete` is false instead of a
   * TypeError; an assignment to an undeclared name creates a global
   * property; `this` in a function called without one is `globalThis` (a
   * primitive `this` is its wrapper object); `delete name`, repeated
   * parameter names and `arguments.callee` work. Legacy octal literals,
   * `with`, block-level function declarations seen outside their block and
   * `arguments` that follows parameter writes stay strict. */
  export function loadClassic(path: string): void;

  /** The context the platform passes a server script; local callers supply
   * it (`now` and `random` default to the host's clock and a fresh random
   * number). Every value must be JSON (TypeError otherwise). */
  export interface SessionContext {
    now?: number;
    random?: number;
    sessionId: string;
    /** `name` is the username scripts key on; `displayName` the name to
     * show (the platform's, which a local caller may leave out). */
    players: { id: string; name: string; displayName?: string; ai?: boolean }[];
    room?: {
      roomId: string;
      metadata: JsonValue;
      roster: { userId: string | null; name: string; displayName?: string; team: number; slot: number; ai: boolean }[];
    };
    presence?: { [userId: string]: { online: boolean; left: boolean } };
    sessionState: JsonValue;
    playerStates?: { [playerId: string]: JsonValue };
    /** `onPlayerMessage` only. */
    message?: { from: string; data: JsonValue };
    /** `onTick` only: the realtime inputs since the last tick. */
    inputs?: { from: string; data: JsonValue }[];
    [key: string]: unknown;
  }
  export interface ScriptResult {
    readonly ok: boolean;
    readonly error?: string;
    readonly sessionState?: JsonValue;
    readonly broadcast?: readonly { readonly to: "all" | readonly string[]; readonly data: JsonValue }[];
    /** Ends the session. */
    readonly result?: JsonValue;
    /** The script's other fields (`playerStates`, `eloUpdates`, …). */
    readonly [key: string]: unknown;
  }
  /** A server script as the platform runs it: every call evaluates it in a
   * fresh isolated realm (the parse is cached) with the platform's rules
   * (no imports, no `Date`, no `Math.random`, no timers; JSON in and out;
   * `ctx.now` and `ctx.random` from the context, and `Intl` dates read
   * `ctx.now` as the clock) and its own fuel (the manifest's `fuel_ms` per
   * call; running out throws a RangeError). A context is at most 256 KiB
   * of JSON and a result (or the declarations) at most 64 KB (RangeError).
   * Both are passed on as JSON text, so the script sees the context's
   * objects, and the caller the result's, with their keys in the order
   * they were written. Its work is the game's: the instructions it ran
   * count against the game's call, its memory comes out of the game's heap
   * (less its workers' heaps), and stopping the game stops it. The
   * script's own exceptions are rethrown with its file and line. */
  export interface PlatformScript {
    /** The script's static declarations, read once. */
    readonly tickRateHz: number | null;
    readonly replays: boolean;
    readonly achievements: JsonValue;
    /** `game.rooms` as the platform reads it (since API_MINOR 19's
     * runtime): `"host"` (in any case) keeps the game's realtime rooms
     * host-routed, so starting one starts no session and its match writes
     * no scores, achievements or ratings; anything else, or nothing, is
     * `"server"`, rooms binding a session of the script. */
    readonly rooms: "host" | "server";
    createSession(ctx: SessionContext): ScriptResult;
    onPlayerMessage(ctx: SessionContext): ScriptResult;
    onTick(ctx: SessionContext): ScriptResult;
  }
  /** Loads a package script (at most 2 MB, the platform's limit) that
   * defines `globalThis.game` with `createSession`, `onPlayerMessage` and
   * `onTick`. Throws a TypeError for a bad path, `NotFoundError`, a
   * `SyntaxError`, a TypeError when it defines no `game` with those
   * functions, or a RangeError for a `tickRateHz` that is not above 0 and
   * at most 1000. At most 16 sandboxes. */
  export function sandbox(path: string): PlatformScript;

  // -- Workers and authorities ---------------------------------------------------
  //
  // A worker is a package script in a realm of its own on a thread of its
  // own, so its work leaves the game's thread (since API_MINOR 2). It has
  // the game's standard globals as the game's realm has them: `Date` (the
  // wall clock, as the game's), `Math.random`, `Intl` in the player's
  // language, `console`, `queueMicrotask`, `performance` (the game's
  // timeline: `now()` reads as the game's would at that moment, also under
  // `starhermit check`'s simulated clock, where each message starts from
  // the game's clock as its last frame began; `timeOrigin` is the game's),
  // `TextEncoder`/`TextDecoder` and `atob`/`btoa`, plus `self`,
  // `postMessage` and `onmessage`. It has nothing of the engine: no
  // imports of built-in modules and no timers (`setTimeout`,
  // `setInterval`: the game's run on its frames; a worker works as
  // messages arrive). Runtimes up to 1.17.1 gave a worker the platform
  // sandbox's rules (no `Date`, no `Math.random`, none of the globals
  // beyond ECMAScript). An authority keeps those rules, as the
  // platform runs its server script: no imports, no `Date`, no
  // `Math.random`, no timers, and `Intl` dates read the invocation's
  // `ctx.now`. It and the game
  // exchange JSON only: a message is copied as JSON text (at most 1 MiB,
  // nesting at most 128 deep; functions and `undefined` are left out as
  // `JSON.stringify` leaves them, and a host object arrives as `{}`), and
  // what a worker sends reaches the game's listeners as each frame begins,
  // before `onFixedUpdate`, in the order it was sent.
  //
  // Limits. A game runs at most 4 workers and authorities at once (one
  // that was terminated counts until its thread has ended). Each has its
  // own heap (`heapMiB`, 32 MiB by default) reserved out of the game's:
  // while its thread lives, the game's realm may use that much less, so
  // workers never add to `engine.limits.heap_mib`; a reservation larger
  // than the game's heap has left throws a RangeError. Its call depth is
  // the manifest's `call_frames`, and every entry (the script's top level,
  // each message, an authority's each invocation) gets the manifest's
  // `fuel_ms`. At most 256 messages (4 MiB) wait for a worker and 1,024
  // (8 MiB) for the game; past that a send is refused and counted in
  // `stats.overflows`. A worker whose one entry has run three seconds is
  // reported with an `error` and the state `"not-responding"` (the game
  // may terminate it); the game's own frames never wait for it. Its
  // console lines go to the game's log, prefixed with its path. Stopping
  // the game stops its workers where they stand, and a restart waits for
  // their threads. Keep a reference to a worker you use: one the game no
  // longer holds is terminated when it is collected.

  export type WorkerState = "starting" | "running" | "not-responding" | "closed" | "failed";
  /** Why a worker ended for good: `"closed"` (terminated, or the game is
   * stopping), `"failed"` (its script did not load, or an entry ran out of
   * heap or call depth), `"ended"` (an authority's session returned a
   * `result`). */
  export type WorkerStop = "closed" | "failed" | "ended";
  export interface WorkerStats {
    /** Entries the worker ran: its top level and messages, or an
     * authority's invocations. */
    readonly entries: number;
    /** An authority's `onTick` invocations. */
    readonly ticks: number;
    /** Entries that threw, failed or were refused (`ok: false`). */
    readonly failures: number;
    /** Messages refused or dropped because a queue was full. */
    readonly overflows: number;
    /** Time the worker's thread has spent running script. */
    readonly busySeconds: number;
    /** Messages waiting for the worker. */
    readonly queued: number;
  }
  export interface WorkerEvents {
    /** The script's top level ran. */
    open: () => void;
    /** A value the worker passed to `postMessage`. */
    message: (data: JsonValue) => void;
    /** An exception from the worker's top level or `onmessage` (with its
     * file and line; the worker goes on unless it was the top level), a
     * budget that ended it, or the not-responding report. */
    error: (message: string) => void;
    stopped: (reason: WorkerStop) => void;
  }
  /** A worker's script: a classic script (or a module importing package
   * modules) that sets `globalThis.onmessage` (also `self.onmessage`) to
   * hear `{ data }` for each message the game posts, and calls
   * `postMessage(value)` (a RangeError past 1 MiB or when the game's queue
   * is full, a TypeError for what is not JSON). A message's promise jobs
   * run before the next message. An exception from `onmessage` is reported
   * and the worker goes on; running out of heap or call depth ends it. A
   * long entry is not cut short: its fuel is renewed, and past three
   * seconds the game hears it is not responding. */
  export class Worker {
    #private;
    private constructor();
    readonly state: WorkerState;
    readonly stats: WorkerStats;
    on<E extends keyof WorkerEvents>(event: E, listener: WorkerEvents[E]): Unsubscribe;
    /** Queues a message for `onmessage` (a TypeError for what is not JSON,
     * a RangeError past 1 MiB, nesting past 128, or when 256 messages or
     * 4 MiB already wait). Ignored once the worker has stopped. */
    post(message: JsonValue): void;
    /** Ends the worker where it stands; no more events arrive. */
    terminate(): void;
  }
  export interface WorkerOptions {
    /** `"classic"` (the default) or `"module"`: a module and the package
     * modules it imports (built-in modules are refused) evaluate with the
     * game's module fuel (2 s). */
    type?: "classic" | "module";
    /** The worker's heap, out of the game's (1–4096, default 32). */
    heapMiB?: number;
  }
  /** Starts a worker for a package script (at most 2 MB). Throws a
   * TypeError for a bad path or a file that is not a script,
   * `NotFoundError`, or a RangeError past 4 workers or when the game's heap
   * cannot spare `heapMiB`. A script that does not parse fails the worker
   * (an `error`, then `stopped` with `"failed"`). */
  export function worker(path: string, options?: WorkerOptions): Worker;

  /** An authority's events: those of a game socket (`starhermit:platform`'s
   * `GameSocket`) for its player, plus `ended`. */
  export interface AuthorityEvents {
    /** The session began (`createSession` returned); `game` events
     * follow. */
    open: () => void;
    /** A broadcast to `"all"` or naming the authority's player, as the
     * game socket delivers it. */
    game: (data: JsonValue) => void;
    /** A refused command's `error` (`ok: false`), or an invocation that
     * failed (an exception with its file and line, its fuel, heap or call
     * depth, a result too big): it was not applied, and the session goes
     * on. */
    error: (message: string) => void;
    /** The script returned a `result`: the session is over. `outcome` is
     * that last result's fields (`ok`, `result`, `eloUpdates`,
     * `achievements`, `scores`…) and the player states. Nothing is
     * submitted: a local session awards nothing. */
    ended: (outcome: { [key: string]: JsonValue }) => void;
    stopped: (reason: WorkerStop) => void;
  }
  export interface AuthorityOptions {
    /** The session's context as the platform would give it (`sessionId`,
     * `players`, and `room` and `presence` for a room-bound session), at
     * most 256 KiB of JSON: passed on every invocation as written.
     * `sessionState` and `playerStates` (at most 2 MiB each) are what
     * `createSession` sees, and `now` and `random` its clock and random
     * number (the host's by default). */
    context: SessionContext;
    /** The player whose commands and inputs these are (`ctx.message.from`,
     * `ctx.inputs[i].from`) and whose broadcasts the game hears; by default
     * `context.players[0].id`. */
    player?: string;
    /** Ticks a second on the worker's clock (0–240; below 0.01, 0.01, the
     * platform's least). By default the
     * script's `tickRateHz` as the platform clamps it: 0.25 when it
     * declares none (or not a number), at most 30, at least 0.01, and 0 or
     * below for none. 0: it ticks only on `tick()`. */
    rate?: number;
    /** The worker's heap, out of the game's (1–4096, default 32). */
    heapMiB?: number;
  }
  /** A platform server script run locally as the platform runs it, on a
   * worker: the session's authority for offline play and practice, with
   * the same contract (and so the same presentation path) as online play
   * through `connectGame`. Every invocation evaluates the script in a fresh
   * realm with the platform's rules, and its context is JSON text (each
   * object's keys in the order written): `createSession` once, then
   * `onPlayerMessage` for each command as it arrives and `onTick` at the
   * rate, each tick with the realtime inputs since the last one in
   * `ctx.inputs` (one pending input per sender, latest wins, except that a
   * pending `pass`, `shoot` or `tackle` is not taken back by a later frame
   * without it; omitted when there are none). `now` is the host's clock
   * and `random` a fresh number for each invocation. A result's
   * `sessionState` replaces the session state (at most 2 MiB), its
   * `playerStates` replace those players' documents, its broadcasts (each
   * at most 1 MiB) to `"all"` or naming the player reach the game, and a
   * `result` ends the session. A refusal (`ok: false`) or a failed
   * invocation changes nothing; ticks that fall behind are skipped, as the
   * platform skips over-budget ticks. Each invocation gets the manifest's
   * `fuel_ms` for evaluating the script and running the call: running out
   * fails it, as the platform fails an invocation over its time. */
  export class Authority {
    #private;
    private constructor();
    readonly state: RoomSocketState;
    /** The script's declarations (null until `open`): its own
     * `tickRateHz`, and the rate this authority ticks at. */
    readonly tickRateHz: number | null;
    readonly rate: number | null;
    readonly replays: boolean;
    readonly achievements: JsonValue;
    /** `game.rooms` as `PlatformScript.rooms` reads it (null until
     * `open`). */
    readonly rooms: "host" | "server" | null;
    readonly stats: WorkerStats;
    on<E extends keyof AuthorityEvents>(event: E, listener: AuthorityEvents[E]): Unsubscribe;
    /** `onPlayerMessage` with `ctx.message.data` = `data` (at most 16 KB of
     * JSON, as the platform's frames). About 20 a second, as the platform
     * allows; false when paced, when the queue is full, or once it has
     * stopped. */
    sendCommand(data: JsonValue): boolean;
    /** The fields as one realtime input frame with `type: "input"` and
     * `realtime: true` (as `GameSocket.sendInput`), the player's pending
     * input for the next tick. 60 a second (bursts to 120); false when
     * paced, when the queue is full, or once it has stopped. */
    sendInput(data: { [key: string]: JsonValue }): boolean;
    /** One `onTick` now, after what was sent before it, whatever the rate
     * (`rate: 0` ticks only this way); `now` and `random` replace the
     * host's for it, for deterministic replays and tests. False when the
     * queue is full or once it has stopped. */
    tick(ctx?: { now?: number; random?: number }): boolean;
    /** Ends the session's worker; no more events arrive. */
    close(): void;
  }
  /** Starts an authority for a server script (at most 2 MB) defining
   * `globalThis.game` with `createSession`, `onPlayerMessage` and, when
   * the session ticks, `onTick` (the same file the platform runs as
   * `server=`; a script declaring `tickRateHz: 0` needs no `onTick`, and
   * `tick()` on it changes nothing). Throws a TypeError for a bad path, a
   * missing `options.context` (the context's fields go there, not on the
   * options), a context that is not an object or not JSON, or no player;
   * `NotFoundError`; a RangeError for a context or state too big, a `rate`
   * outside 0–240, past 4 workers, or when the game's heap cannot spare
   * `heapMiB`. A script that does not parse, defines no `game` with those
   * functions (or no `onTick` while its rate is above 0), or fails or
   * refuses `createSession` fails the authority (an
   * `error`, then `stopped` with `"failed"`). */
  export function authority(path: string, options: AuthorityOptions): Authority;
}
