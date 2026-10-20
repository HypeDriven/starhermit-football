// Copied unchanged below this note from starhermit-engine
// crates/starhermit-runtime/api/starhermit.d.ts at commit da27a93 (2026-10-20,
// main): host API v1 with the football port's decisions, R2's rendering,
// system fonts (through the generic families only), WebP, starhermit:world
// (tables with history and row ids, kernels, strided and sliced schedules,
// events, instance and node bindings) and the post effects at three.js r176
// parity (API_MINOR 4: renderer.ao, bloom, grade and antialias, noAO).
// Refresh it from the runtime when the contract changes; the sha256 of the
// original file is
// f5a04398dead02e3c4f0d6b226030c0567a8ad45c70247f5fdc5c2f49448ba81.

// StarHermit host API, version 1: the built-in modules a script game imports
// by name (`import { onUpdate } from "starhermit:engine"`). The runtime
// (`starhermit`) is the only trusted code; a game package is data, and every
// host object it receives is an opaque handle the runtime validates on each
// call.
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
// - Version. `engine.API_VERSION` is this file's major version (the
//   manifest's `engine.api=1`); minor versions only add members.
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
// Of `Intl` and the locale-aware members, these follow the player's
// language (BCP 47 tags; others fall back to it): `String.prototype.
// localeCompare` and `Intl.Collator` (Unicode root collation with
// `sensitivity` and `numeric`), `String.prototype.normalize`,
// `Number.prototype.toLocaleString` and `Intl.NumberFormat` (`style`
// decimal, percent and unit, fraction and integer digit options,
// `useGrouping`), `Date.prototype.toLocaleDateString`/`TimeString`/
// `String` and `Intl.DateTimeFormat` (`dateStyle`, `timeStyle`, the
// numeric and short/long field options, `timeZone` "UTC" or the system's),
// `Intl.PluralRules` (`select`) and `Intl.RelativeTimeFormat`. Other `Intl`
// members are absent.
//
// The project's tsconfig should use `"lib": ["ES2022"]` and `"types": []`:
// the runtime is not a browser and has no DOM. The globals below are the
// only ones beyond ECMAScript.

/** Logging to the runtime's log (and, with `--dev`, the terminal). At most
 * 64 lines a frame of at most 1,024 bytes each are kept; the rest are
 * dropped. Game text is printed as data: control and bidirectional
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

// ===========================================================================
declare module "starhermit:engine" {
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
    | "NotAllowedError";

  // -- Lifecycle ------------------------------------------------------------
  // Each registers one callback (a second call replaces the first); register
  // them while the entry module evaluates. Every call into the game (a
  // callback, an event, a timer, a promise job) gets the manifest's fuel
  // (`engine.limits.fuel_ms`, 32 ms of the reference machine's instructions
  // by default, scaled to the frame; `onStart` gets eight times it). A call
  // that spends its fuel is paused, not ended: it continues with fresh fuel
  // on the following frames while the game draws nothing new, and once it
  // has run three seconds the player sees the not-responding screen, where
  // Wait lets it go on and Stop ends the game. Long work should be sliced
  // across frames (`fuelLeft()` says how much of this call's fuel remains).
  // Running out of heap (`engine.limits.heap_mib`) or call frames ends the
  // game at once, as an uncaught exception or rejected promise from a
  // callback does, on the runtime's error screen with its message and
  // location.

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
  /** The window was minimized or hidden: no frames until `onResume`. */
  export function onSuspend(callback: () => void): void;
  /** Frames resume; the game clock does not catch up the time suspended. */
  export function onResume(callback: () => void): void;
  /** The player quits or the runtime closes: a last chance to save. It runs
   * briefly (at most one call's fuel); storage writes made here persist. */
  export function onQuit(callback: () => void): void;
  /** The window gained or lost focus (held input was released). */
  export function onFocus(callback: (focused: boolean) => void): Unsubscribe;
  /** The runtime's own interface opened or closed over the game (Options,
   * a permission prompt, an error): while it is open no input reaches the
   * game and `input` reports nothing held. */
  export function onOverlay(callback: (open: boolean) => void): Unsubscribe;

  /** Fixed steps per second, 1–240 (60 until set); RangeError otherwise.
   * A change takes effect from the next frame. */
  export function setFixedRate(hz: number): void;
  export function fixedRate(): number;
  /** The fuel the running call has left, in milliseconds of the reference
   * machine's instructions (0 when spent: the call is then paused at its
   * next check). */
  export function fuelLeft(): number;

  // -- Frame ----------------------------------------------------------------
  export type QualityTier = "low" | "balanced" | "high" | "ultra";
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
    /** The window's drawable size in physical pixels. */
    readonly width: number;
    readonly height: number;
    /** Physical pixels per logical pixel. */
    readonly scale: number;
    /** Insets (physical pixels) that system UI or display cutouts cover. */
    readonly safeArea: SafeArea;
    /** The player's graphics quality setting. */
    readonly quality: QualityTier;
    readonly focused: boolean;
    /** The runtime's interface is open over the game. */
    readonly overlayOpen: boolean;
    readonly fixedRate: number;
  }
  /** This frame's information (the same object all frame). */
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
  }
  export function stats(): FrameStats;

  // -- The game ---------------------------------------------------------------
  export type Capability = "platform" | "voice" | "clipboard" | "storage";
  /** The manifest's limits after `engine.limits.*` (which only lower them). */
  export interface Limits {
    readonly fuelMs: number;
    readonly heapMib: number;
    readonly callFrames: number;
    readonly gpuMib: number;
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
    /** The manifest's actions in declaration order (`control.*`). */
    readonly actions: readonly { readonly name: string; readonly label: string }[];
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
  }
  /** The budgets: the manifest's limits within the engine's (1,008 meshes,
   * 120 textures and 56 MiB of texture data, 128 clips and 64 MiB of clip
   * data in the mixer) less what the runtime keeps for its interface. */
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
  }
  export function usage(): Usage;
  export function budgets(): Budgets;

  /** Opens the runtime's Options menu (the player can always press F1). */
  export function openMenu(): void;
  /** Ends the game (runs `onQuit`, then the runtime closes). */
  export function quit(): void;

  // -- Package files ----------------------------------------------------------
  /** Read-only access to the game's own package. Paths are package-relative
   * with `/` separators (`"levels/one.json"`, `"./a.txt"`, `"a/../b"` are
   * normalized); absolute paths, backslashes, escapes above the root and
   * names a package may not hold throw a TypeError. A read returns at most
   * 64 MiB (RangeError). Reads are synchronous: packages are local. */
  export interface PackageFiles {
    exists(path: string): boolean;
    /** Bytes, or null for a missing file. */
    size(path: string): number | null;
    /** Throws an Error named `NotFoundError` for a missing file. */
    readBytes(path: string): Uint8Array;
    /** UTF-8 (a leading BOM is dropped); invalid UTF-8 throws a TypeError. */
    readText(path: string): string;
    /** Parses JSON; invalid JSON throws a SyntaxError. */
    readJson(path: string): JsonValue;
    /** The files directly in a directory (`""` for the root), sorted. */
    list(directory: string): string[];
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
    /** Writes text (at most 1 MiB, RangeError) to the system clipboard.
     * Only while handling one of the player's presses (an action, key,
     * pointer button or touch start, not an auto-repeat), or during the
     * `onUpdate` and `onRender` of a frame in which a `starhermit:ui`
     * widget was activated by a press; otherwise throws `NotAllowedError`.
     * Needs the `clipboard` capability. (Runtimes without a system
     * clipboard backend reject with `NotSupportedError`.) */
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
    /** The player's text size multiplier (1 by default). */
    readonly textScale: number;
    /** High-contrast colors asked for. */
    readonly highContrast: boolean;
  }
  export function preferences(): Preferences;
  export function onPreferencesChange(listener: (preferences: Preferences) => void): Unsubscribe;
}

// ===========================================================================
declare module "starhermit:input" {
  import type { Unsubscribe } from "starhermit:engine";

  // -- Actions ----------------------------------------------------------------
  // The manifest's `control.<action>=` lines declare actions (at most 32)
  // with default keys; `engine.gamepad.<action>=` adds gamepad controls. The
  // player rebinds them in the Options menu, so games read actions, not
  // keys, for gameplay. Up to 8 player slots share the keyboard (slot 0)
  // and gamepads.

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
  /** The label of an action's first binding as the player's keyboard layout
   * shows it (`"Space"`, `"Z"`, `"A button"`), for on-screen prompts. */
  export function bindingLabel(action: string, device?: "keyboard" | "gamepad"): string;
  export interface Binding {
    readonly device: "keyboard" | "mouse" | "gamepad";
    /** The `KeyboardEvent.code`, mouse button or gamepad control name. */
    readonly code: string;
    /** As the player's layout shows it. */
    readonly label: string;
  }
  /** Every binding of an action, in the player's order. */
  export function bindings(action: string): readonly Binding[];
  /** The player rebound something (in the runtime's Options menu). */
  export function onBindingsChange(listener: () => void): Unsubscribe;
  /** Opens the runtime's Options menu at the controls, where the player
   * rebinds (the game cannot rebind by itself). */
  export function requestRebind(action?: string): void;
  /** The pointer the player mostly uses now: `"coarse"` after touch,
   * `"fine"` after a mouse or pen, `"none"` before either (gamepad or
   * keyboard play). Changes as the player switches. */
  export function primaryPointer(): "fine" | "coarse" | "none";

  // -- Keys and text ----------------------------------------------------------
  /** `KeyboardEvent.code` names (`"KeyW"`, `"ArrowLeft"`, `"Space"`). F1 is
   * the runtime's and never reaches the game. */
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

  // -- Touch ------------------------------------------------------------------
  export type TouchPhase = "start" | "move" | "end" | "cancel";
  export interface TouchEvent {
    readonly id: number;
    readonly phase: TouchPhase;
    readonly x: number;
    readonly y: number;
    /** The first finger down. */
    readonly primary: boolean;
  }
  export function onTouch(listener: (event: TouchEvent) => void): Unsubscribe;
  export type TouchAnchor = "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** On-screen controls drawn by the runtime and fed into the actions
   * (sized and faded by the player's settings). Offsets and radii are
   * logical pixels from the anchor corner. */
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
   * (TypeError). */
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
   * when signed in (the platform's per-game settings: keys match
   * `[A-Za-z0-9._:-]{1,128}`, within the platform's key and byte limits).
   * Engine settings
   * (audio, graphics, bindings) are the runtime's and not visible here. */
  export interface GameSettings {
    get(key: string): JsonValue | undefined;
    /** Throws a TypeError for an invalid key, RangeError past the limits. */
    set(key: string, value: JsonValue): void;
    delete(key: string): void;
    keys(): string[];
    /** Changes from another device or from the account arriving. */
    onChange(listener: (key: string, value: JsonValue | undefined) => void): Unsubscribe;
  }
  export const settings: GameSettings;

  /** Where the save is now. */
  export type SaveStatus = "saved-to-account" | "saved-on-device" | "pending" | "unavailable" | "session-only";
  export type SyncState = "signed-out" | "loading" | "ready" | "uploading" | "read-blocked" | "conflict" | "error";
  export interface Save {
    /** The game's own schema version (`save(data, { schema })`). */
    readonly schema: number;
    readonly savedAt: number;
    readonly data: JsonValue;
  }
  export type Resolution = "keep-local" | "take-remote" | { readonly merged: JsonValue };
  /** The game's save: one per game and player, kept on the device and, when
   * signed in, synced to the account (uploads are debounced, at most every
   * 30 s, queued while offline). At most 10 MiB of JSON (RangeError). The
   * previous save is kept as a recovery checkpoint. */
  export interface CloudSave {
    /** The current save, or null when there is none (yet). */
    load(): Save | null;
    /** The save before the current one. */
    previous(): Save | null;
    /** Replaces the save; it is written to the device at once. */
    save(data: JsonValue, options?: { schema?: number }): void;
    status(): SaveStatus;
    state(): SyncState;
    /** Writes pending changes now (resolves when stored or queued). */
    flush(): Promise<SaveStatus>;
    /** The account holds a different save than this device: resolve it
     * (until then the account's copy is not overwritten). */
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
  // holds at most 131,072 objects, 65,536 mesh instances (a Mesh counts 1,
  // an InstancedMesh its capacity), 1,024 InstancedMeshes (each is drawn
  // from a GPU instance buffer of its own) and 16,384 sprites, in the scene
  // or not, and 4,096 materials: creating past one throws a RangeError.
  // Lights past 16 besides ambient light are left out of the frame
  // (`engine.stats()` counts them with the skipped objects). GPU memory
  // counts against `engine.limits.gpu_mib` within the engine's mesh and
  // texture budgets (`engine.budgets()`).

  // -- Math -------------------------------------------------------------------
  export class Vector2 {
    constructor(x?: number, y?: number);
    x: number;
    y: number;
    set(x: number, y: number): this;
    copy(v: Vector2): this;
    clone(): Vector2;
    add(v: Vector2): this;
    sub(v: Vector2): this;
    multiplyScalar(s: number): this;
    length(): number;
    normalize(): this;
  }
  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
    setScalar(s: number): this;
    copy(v: Vector3): this;
    clone(): Vector3;
    add(v: Vector3): this;
    addScaledVector(v: Vector3, s: number): this;
    sub(v: Vector3): this;
    multiply(v: Vector3): this;
    multiplyScalar(s: number): this;
    applyQuaternion(q: Quaternion): this;
    applyMatrix4(m: Matrix4): this;
    dot(v: Vector3): number;
    cross(v: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    length(): number;
    lengthSq(): number;
    distanceTo(v: Vector3): number;
    normalize(): this;
    lerp(v: Vector3, alpha: number): this;
    equals(v: Vector3): boolean;
    /** World point to the camera's normalized device coordinates, as
     * three.js: x and y −1..1 on screen, z −1 (near) to 1 (far); z > 1 is
     * past the far plane or behind the camera. */
    project(camera: Camera): this;
    /** The inverse of `project`. */
    unproject(camera: Camera): this;
  }
  export type EulerOrder = "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY";
  /** Rotation in radians about each axis, applied in `order`. An object's
   * `rotation` and `quaternion` are linked as in three.js: writing either,
   * by a method or a plain field write (`rotation.y = 1`), updates the
   * other at once. */
  export class Euler {
    constructor(x?: number, y?: number, z?: number, order?: EulerOrder);
    x: number;
    y: number;
    z: number;
    order: EulerOrder;
    set(x: number, y: number, z: number, order?: EulerOrder): this;
    copy(e: Euler): this;
    setFromQuaternion(q: Quaternion, order?: EulerOrder): this;
  }
  export class Quaternion {
    constructor(x?: number, y?: number, z?: number, w?: number);
    x: number;
    y: number;
    z: number;
    w: number;
    set(x: number, y: number, z: number, w: number): this;
    copy(q: Quaternion): this;
    clone(): Quaternion;
    identity(): this;
    setFromAxisAngle(axis: Vector3, angle: number): this;
    setFromEuler(euler: Euler): this;
    setFromUnitVectors(from: Vector3, to: Vector3): this;
    multiply(q: Quaternion): this;
    premultiply(q: Quaternion): this;
    slerp(q: Quaternion, t: number): this;
    invert(): this;
    normalize(): this;
  }
  /** Column-major 4×4, as three.js. */
  export class Matrix4 {
    constructor();
    elements: number[];
    identity(): this;
    copy(m: Matrix4): this;
    compose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    decompose(position: Vector3, quaternion: Quaternion, scale: Vector3): this;
    multiply(m: Matrix4): this;
    makeTranslation(x: number, y: number, z: number): this;
    makeRotationFromQuaternion(q: Quaternion): this;
    makeScale(x: number, y: number, z: number): this;
    makeRotationX(angle: number): this;
    makeRotationY(angle: number): this;
    makeRotationZ(angle: number): this;
    premultiply(m: Matrix4): this;
    multiplyMatrices(a: Matrix4, b: Matrix4): this;
    setPosition(x: number, y: number, z: number): this;
    invert(): this;
    fromArray(array: ArrayLike<number>, offset?: number): this;
    toArray(array?: number[] | Float32Array, offset?: number): number[] | Float32Array;
  }
  /** Linear-light RGB, 0–1 (three.js color management): hex numbers and CSS
   * strings given to it are sRGB and converted. */
  export class Color {
    constructor(color?: ColorLike | Color);
    constructor(r: number, g: number, b: number);
    r: number;
    g: number;
    b: number;
    set(color: ColorLike | Color): this;
    setRGB(r: number, g: number, b: number): this;
    setHex(hex: number): this;
    setHSL(h: number, s: number, l: number): this;
    getHex(): number;
    copy(c: Color): this;
    clone(): Color;
    lerp(c: Color, alpha: number): this;
    multiplyScalar(s: number): this;
  }
  export type ColorInput = ColorLike | Color;

  // -- Constants (three.js names) ----------------------------------------------
  export type Side = "front" | "back" | "double";
  export const FrontSide: "front";
  export const BackSide: "back";
  export const DoubleSide: "double";
  export type Blending = "normal" | "additive";
  export const NormalBlending: "normal";
  export const AdditiveBlending: "additive";
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
  /** Color spaces, kept for ports: color maps are read as sRGB, data maps
   * (normal, roughness, metalness, occlusion) as plain values, output is
   * sRGB. */
  export const NoColorSpace: "";
  export const SRGBColorSpace: "srgb";
  export const LinearSRGBColorSpace: "srgb-linear";

  // -- Textures ---------------------------------------------------------------
  /** An RGBA8 image on the GPU (sRGB-encoded), at most 4,096 pixels on a
   * side (RangeError), counted against the game's image budget (about
   * 56 MiB; mipmaps add a third): prefer repeating a small image over one
   * large one (see `starhermit:canvas`). UVs follow three.js: (0, 0) is the
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
     * upload counts against the frame's 96 MiB upload bound); each `true`
     * counts in `version`, and an environment made from the texture is
     * made again. */
    needsUpdate: boolean;
    readonly version: number;
    /** Releases the GPU image; materials using it draw without it. Using a
     * disposed texture throws a TypeError. */
    dispose(): void;
  }
  /** A canvas's pixels; set `needsUpdate` after drawing to show changes. */
  export class CanvasTexture extends Texture {
    constructor(canvas: OffscreenCanvas);
    readonly canvas: OffscreenCanvas;
  }
  /** Straight-alpha RGBA pixels, rows top to bottom (`width × height × 4`
   * values, else TypeError): bytes (sRGB-encoded) or linear floats
   * (`FloatType`; shown sRGB-encoded and clamped as an image, kept linear
   * and above 1 as an environment). */
  export class DataTexture extends Texture {
    constructor(data: Uint8Array | Uint8ClampedArray | Float32Array, width: number, height: number, format?: number, type?: number);
    readonly data: Uint8Array | Float32Array;
    readonly type: number;
    readonly image: { readonly width: number; readonly height: number; readonly data: Uint8Array | Float32Array };
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
   * floats for light above white, a CanvasTexture or a package image) or a
   * CubeTexture. It is made off the game's thread and lights the scene a
   * few frames later (see `environmentReady`); a game holds at most 8
   * (RangeError), each counting about 1.4 MiB against the image budget,
   * and images waiting for their prefilters hold at most 256 MiB together
   * (RangeError; cube faces are squares of at most 2,048). `fromScene` throws a TypeError: there is no render-to-texture. */
  export class PMREMGenerator {
    constructor(renderer?: Renderer);
    fromEquirectangular(texture: Texture): { readonly texture: Texture; readonly width: number; readonly height: number; dispose(): void };
    fromCubemap(cube: CubeTexture): { readonly texture: Texture; readonly width: number; readonly height: number; dispose(): void };
    fromScene(): never;
    compileEquirectangularShader(): void;
    compileCubemapShader(): void;
    dispose(): void;
  }
  /** Whether an environment value (a PMREM texture, or a texture or cube
   * texture given to `scene.environment` or `envMap`) has finished
   * prefiltering; false while its images decode or it prefilters, and for
   * null. */
  export function environmentReady(value: Texture | null): boolean;
  /** Loads package images (PNG or WebP; an animated WebP's first frame)
   * through the engine's decoders. */
  export class TextureLoader {
    constructor();
    /** Rejects with a TypeError for a bad path, an Error named
     * `NotFoundError` for a missing file and `EncodingError` for an image it
     * cannot decode; RangeError past the texture budget or with 128 loads
     * already waiting. */
    loadAsync(path: string): Promise<Texture>;
    load(path: string, onLoad?: (texture: Texture) => void, onError?: (error: Error) => void): Texture;
  }

  // -- Geometry ----------------------------------------------------------------
  /** Vertex data for meshes. Uploaded on first use; at most 1,048,576
   * vertices and 3,145,728 indices (RangeError); attributes are copied when
   * set. */
  export class BufferAttribute {
    constructor(array: Float32Array | Uint16Array | Uint32Array, itemSize: number);
    readonly array: Float32Array | Uint16Array | Uint32Array;
    readonly itemSize: number;
    readonly count: number;
    /** Set after changing `array` to re-upload the geometry (or, for an
     * instanced mesh's `instanceMatrix` and `instanceColor`, the instances,
     * in one host call). */
    needsUpdate: boolean;
    /** Limits the next upload to `count` items from `offset` (three.js's
     * `updateRange`/`addUpdateRange`). */
    addUpdateRange(offset: number, count: number): void;
    clearUpdateRanges(): void;
  }
  export class Float32BufferAttribute extends BufferAttribute {
    constructor(array: ArrayLike<number>, itemSize: number);
  }
  export type AttributeName = "position" | "normal" | "uv" | "color";
  export class BufferGeometry {
    constructor();
    /** `position` (3), `normal` (3), `uv` (2) and `color` (3 or 4, linear);
     * other names throw a TypeError. */
    setAttribute(name: AttributeName, attribute: BufferAttribute): this;
    getAttribute(name: AttributeName): BufferAttribute | undefined;
    setIndex(index: BufferAttribute | readonly number[] | null): this;
    getIndex(): BufferAttribute | null;
    computeVertexNormals(): void;
    /** Model-space bounding sphere (for culling, picking and shadows). */
    computeBoundingSphere(): void;
    translate(x: number, y: number, z: number): this;
    rotateX(angle: number): this;
    rotateY(angle: number): this;
    rotateZ(angle: number): this;
    scale(x: number, y: number, z: number): this;
    /** Transforms positions (and normals by the inverse transpose). */
    applyMatrix4(matrix: Matrix4): this;
    applyQuaternion(quaternion: Quaternion): this;
    /** Each triangle its own three vertices (no index). */
    toNonIndexed(): BufferGeometry;
    clone(): BufferGeometry;
    /** Releases the GPU mesh (it is made again if drawn). */
    dispose(): void;
    /** Which vertices `Points` draw (meshes draw all). */
    readonly drawRange: { start: number; count: number };
    setDrawRange(start: number, count: number): void;
  }
  /** One geometry from several (three.js's `BufferGeometryUtils.
   * mergeGeometries`): they must share their attributes (all indexed or
   * none); null when they do not. Bounded as any geometry (RangeError). */
  export function mergeGeometries(geometries: readonly BufferGeometry[]): BufferGeometry | null;
  // three.js's built-in shapes with its parameters, defaults and vertex
  // layout; their `position`, `normal` and `uv` attributes and index are
  // readable (and writable) like any geometry's. Segment counts are at most
  // 1,024 (RangeError).
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
    /** Blends (sorted farthest first, drawn after opaque objects). */
    transparent?: boolean;
    /** Above 0, pixels whose alpha is below it are discarded (masked). */
    alphaTest?: number;
    blending?: Blending;
    side?: Side;
    /** Default: written unless blended. */
    depthWrite?: boolean;
    depthTest?: boolean;
    /** Whether the scene's fog applies (default true). */
    fog?: boolean;
    /** Multiply by the geometry's `color` attribute. */
    vertexColors?: boolean;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
    visible?: boolean;
  }
  /** Common to all materials; changes apply from the next frame. */
  export abstract class Material {
    #private;
    color: Color;
    map: Texture | null;
    opacity: number;
    transparent: boolean;
    alphaTest: number;
    blending: Blending;
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
    clone(): this;
    dispose(): void;
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
    /** Scales the environment's light (default 1). */
    envMapIntensity: number;
  }
  export interface MeshPhysicalMaterialParameters extends MeshStandardMaterialParameters {
    /** 0–1 (default 0). */
    clearcoat?: number;
    /** 0–1 (default 0). */
    clearcoatRoughness?: number;
  }
  /** A standard material with a clear coat over it (three.js
   * `MeshPhysicalMaterial`: `clearcoat`, `clearcoatRoughness`; its other
   * physical properties are kept but not drawn). */
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
  }
  /** Diffuse light only (three.js `MeshLambertMaterial`), cheaper than
   * standard shading. */
  export class MeshLambertMaterial extends Material {
    constructor(parameters?: MeshLambertMaterialParameters);
    emissive: Color;
    emissiveMap: Texture | null;
    emissiveIntensity: number;
    normalMap: Texture | null;
    normalScale: Vector2;
    aoMap: Texture | null;
    aoMapIntensity: number;
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
  /** Unlit: shows `color` × `map` whatever lights the scene. */
  export class MeshBasicMaterial extends Material {
    constructor(parameters?: MaterialParameters);
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
     * they sort farthest first (three.js `renderOrder`). */
    renderOrder: number;
    castShadow: boolean;
    receiveShadow: boolean;
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
  }
  export class Group extends Object3D {
    constructor();
  }
  export class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: Material);
    geometry: BufferGeometry;
    material: Material;
  }
  /** One geometry and material drawn `count` times with per-instance
   * transforms and colors (each instance counts toward the scene's 65,536). */
  export class InstancedMesh extends Mesh {
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
    setMatrixAt(index: number, matrix: Matrix4): void;
    getMatrixAt(index: number, target: Matrix4): void;
    /** Multiplies the material color (default white). */
    setColorAt(index: number, color: Color): void;
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
  /** A quad facing the view; `scale.x`/`scale.y` are its size (world units)
   * and `center` the point placed at its position (0–1 from bottom-left).
   * Sprites cast no shadows. */
  export class Sprite extends Object3D {
    constructor(material?: SpriteMaterial);
    material: SpriteMaterial;
    readonly center: Vector2;
  }

  // -- Cameras ------------------------------------------------------------------
  export abstract class Camera extends Object3D {
    near: number;
    far: number;
    /** As three.js, for the window's current aspect. */
    readonly projectionMatrix: Matrix4;
    readonly projectionMatrixInverse: Matrix4;
    readonly matrixWorldInverse: Matrix4;
  }
  /** Looks down its -Z. `fov` is the vertical field of view in degrees
   * (three.js); the aspect follows the window. `far` may be Infinity. */
  export class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    fov: number;
    /** Ignored: the window's aspect is used. */
    aspect: number;
    /** Kept for ports; projection changes apply without it. */
    updateProjectionMatrix(): void;
  }
  /** The view is centered: `top - bottom` sets its height in world units and
   * the width follows the window's aspect (`left`/`right` are kept but not
   * used for the extent). */
  export class OrthographicCamera extends Camera {
    constructor(left?: number, right?: number, top?: number, bottom?: number, near?: number, far?: number);
    left: number;
    right: number;
    top: number;
    bottom: number;
    zoom: number;
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
    /** The shadow map's size, 64–4096 (the quality setting may lower it):
     * a number, or three.js's vector (its larger side). */
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
  /** None before `near`, rising smoothly to full at `far`. */
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
    /** The clear color behind everything (default black); null keeps black. */
    background: Color | null;
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
  /** A color grade with a vignette, after bloom and before the output's
   * tone mapping (as a three.js `ShaderPass` before `OutputPass` sees the
   * light), on linear light clamped to 0–1: an S-curve (`c²(3 − 2c)`)
   * blended in by `contrast`, saturation around Rec. 601 luma, the result
   * times `shadows`' tint turning into `highlights'` by a smoothstep of
   * that luma from `split[0]` to `split[1]`, clamped, all blended with the
   * ungraded light by `amount`; then light times `1 − vignette.amount ×
   * smoothstep(inner, outer, d)`, `d` the length of the offset from the
   * frame's center in texture coordinates (0–1 across) with each axis
   * times `vignette.scale`. Fields left out change nothing (the clamp
   * aside). */
  export interface GradeSettings {
    /** 0–1, default 0. */
    contrast?: number;
    /** 0–4, default 1. */
    saturation?: number;
    /** Linear RGB, each 0–4, default [1, 1, 1]. */
    shadows?: readonly [number, number, number];
    highlights?: readonly [number, number, number];
    /** Rising, each 0–1, default [0, 1]. */
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
   * FXAA or SMAA; the player's graphics settings decide the render scale,
   * the shadow maps' largest size and the frame rate, and a game usually
   * picks its effects by `frame().quality`. Light is linear and may exceed
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
    /** Default "off". */
    antialias: AntialiasMode;
    /** three.js `toneMapping` (`NoToneMapping`, `LinearToneMapping`,
     * `ReinhardToneMapping`, `CineonToneMapping`, `ACESFilmicToneMapping`,
     * `AgXToneMapping`, `NeutralToneMapping`) with `toneMappingExposure`
     * (default 1), applied to everything the scene draws. */
    toneMapping: number;
    toneMappingExposure: number;
    /** Kept for ports; output is sRGB. */
    outputColorSpace: string;
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
    readonly ray: { readonly origin: Vector3; readonly direction: Vector3 };
    set(origin: Vector3, direction: Vector3): void;
    /** From normalized device coordinates (−1..1, y up) through a camera. */
    setFromCamera(coords: Vector2, camera: Camera): void;
    intersectObject(object: Object3D, recursive?: boolean): Intersection[];
    intersectObjects(objects: readonly Object3D[], recursive?: boolean): Intersection[];
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
  // a game's images share about 56 MiB of GPU memory, mipmaps adding a
  // third; a 4096 × 4096 image with mipmaps alone would take 85 MiB. Draw
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
    /** RangeError past the size bounds; 0 is allowed (draws nothing). */
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
   * copied). ImageData and canvases are copied at once. */
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
     * engine's pixel font (`starhermit pixel`) last. Characters a
     * face lacks draw with the next face that has them. Default
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
    /** Rejects with an Error named `NetworkError` for a missing file and
     * `SyntaxError` for data it cannot read. */
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
  // draws above it.
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
  // `★` depend on the system. The runtime ships no font file and reads
  // fonts only from the system's font directories; games name them only
  // by the generic families (a system family's own name, such as `Arial`,
  // is not a family here, so text cannot tell which fonts the system has).
  // Exact metrics (widths,
  // line heights) differ between systems, as on the web: measure text
  // (`measureText`) rather than assume widths.

  export interface Clip {
    /** Only the part inside this window rectangle draws. */
    clip?: { x: number; y: number; width: number; height: number };
  }
  export function rect(x: number, y: number, width: number, height: number, color: ColorLike, options?: Clip): void;
  /** An outline `lineWidth` pixels wide inside the rectangle. */
  export function strokeRect(x: number, y: number, width: number, height: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  export function roundRect(x: number, y: number, width: number, height: number, radius: number, color: ColorLike, options?: Clip): void;
  /** A rounded outline `lineWidth` pixels wide inside the rectangle. */
  export function strokeRoundRect(x: number, y: number, width: number, height: number, radius: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  export function line(x1: number, y1: number, x2: number, y2: number, color: ColorLike, lineWidth?: number, options?: Clip): void;
  /** A filled simple polygon (3 to 256 points, `[x, y]` pairs, convex or
   * not; self-intersecting outlines fill as their triangulation falls). */
  export function polygon(points: readonly (readonly [number, number])[], color: ColorLike, options?: Clip): void;
  /** Turns a text or image about `origin` (default its top-left corner, in
   * window pixels). */
  export interface Rotation {
    /** Radians, clockwise on screen. */
    rotation?: number;
    origin?: { x: number; y: number };
  }
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
    /** Wrap at this width in pixels. */
    maxWidth?: number;
    direction?: "ltr" | "rtl";
  }
  /** `y` is the top of the first line. */
  export function text(text: string, x: number, y: number, options?: TextOptions): void;
  /** The size `text` draws at with these options: the same faces (the
   * weight's), letter spacing, wrap width and direction, so a width
   * measured here is the width drawn. */
  export function measureText(text: string, options?: Pick<TextOptions, "size" | "font" | "weight" | "letterSpacing" | "maxWidth" | "direction">): { width: number; height: number };
  export interface ImageOptions extends Clip, Rotation {
    /** Part of the source in its own pixels (default all of it). */
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
  // contrast and reduced-motion settings, and builds an accessibility tree
  // screen readers read. Labels are the widgets' identities unless `id()`
  // names them, so keep them stable or set ids for translated labels. At
  // most 4,096 widgets a frame (RangeError).

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
    /** Across the axis. */
    align?: Align;
    /** Along the axis. */
    justify?: Align;
    width?: number;
    height?: number;
    background?: ColorLike;
    /** Clip children to the container. */
    clip?: boolean;
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
  /** A tone colors a label's text from the theme (`"muted"`, `"accent"`)
   * or by an explicit color. */
  export type Tone = "normal" | "muted" | "accent" | "danger";
  export function label(text: string, options?: { tone?: Tone; color?: ColorLike }): Rect;
  export function heading(text: string): Rect;
  /** Wrapped text at most `width` logical pixels wide. */
  export function paragraph(text: string, width?: number): Rect;
  export function image(alt: string, texture: Texture, size: { width: number; height: number }, uv?: { min: [number, number]; max: [number, number] }): Rect;
  /** `value` 0–1. */
  export function progress(value: number, width?: number): Rect;
  /** True on the frame it was activated. A disabled button shows muted,
   * stays in the focus order for screen readers (announced unavailable)
   * and never activates. An activation by a press counts as that press
   * for `clipboard.writeText` and pointer lock during this frame. */
  export function button(label: string, options?: { disabled?: boolean; tone?: Tone }): boolean;
  /** Returns the value after this frame's input. */
  export function checkbox(label: string, checked: boolean): boolean;
  export function slider(label: string, value: number, options: { min: number; max: number; step?: number; width?: number }): number;
  /** A dropdown; returns the chosen index. */
  export function select(label: string, index: number, options: readonly string[]): number;
  /** Left/right arrows through the options; returns the index. */
  export function cycle(label: string, index: number, options: readonly string[]): number;
  /** Returns the edited text (at most `maxChars`, default 256; IME
   * composition is supported). `placeholder` shows while it is empty. */
  export function textField(id: string, value: string, options?: { maxChars?: number; width?: number; placeholder?: string }): string;
  /** Whether Enter was pressed in the text field `id` this frame (the field
   * keeps focus; `setFocus(null)` leaves it). */
  export function submitted(id: string): boolean;
  /** Tab strip plus the chosen tab's content; returns the chosen index. */
  export function tabs(label: string, index: number, labels: readonly string[], content: (index: number) => void): number;
  export function scrollArea(label: string, size: { width: number; height: number }, build: () => void): Rect;
  /** A modal dialog while `open`: input reaches nothing behind it. Returns
   * whether it is still open (Back or Escape closes it). */
  export function dialog(label: string, title: string, open: boolean, build: () => void): boolean;
  /** Back (Escape, East) pressed this frame and not taken by a dialog. */
  export function back(): boolean;
  /** A text field or similar has the keyboard: game shortcuts should wait. */
  export function capturingKeys(): boolean;
  /** Whether the pointer is over a widget (the game should not act on its
   * clicks). */
  export function pointerOver(): boolean;
  /** The focused widget's label (null when nothing has focus). */
  export function focused(): string | null;
  /** Focuses the widget with this label from the next frame (null: none). */
  export function setFocus(id: string | null): void;
  /** The language widgets announce (BCP 47) and its direction (right-to-left
   * mirrors the layout); default the player's language. */
  export function setLanguage(tag: string, direction?: "ltr" | "rtl"): void;
  /** A subtree in another language. */
  export function lang(tag: string, build: () => void): void;
  /** Colors (sRGB) and sizes (logical pixels) over the player's settings
   * (a high-contrast setting still wins). */
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
  }
  export function setTheme(theme: Theme): void;
  /** The font the UI lays out and draws its text with: a family added with
   * `canvas.fonts` (any case) at the face nearest `weight` (synthesized
   * bold at 600 and more for a family without a bold face), falling back
   * to the system's faces; null returns to the default faces (`system-ui`,
   * see `starhermit:draw`). A family never added throws a TypeError. */
  export function setFont(font: { family?: string; weight?: string } | null): void;
}

// ===========================================================================
declare module "starhermit:audio" {
  import type { Unsubscribe } from "starhermit:engine";

  // Two ways to make sound, both mixed by the engine on the player's volume
  // buses (Options › Audio): clip playback for sound effects and music, and
  // a synthesis graph in the Web Audio model (`context`). The game's sound
  // is muted while the window is unfocused when the player asked for that.

  /** The player's volume group a sound plays in. */
  export type Bus = "music" | "effects" | "interface";

  // -- Clips --------------------------------------------------------------------
  /** Decoded samples registered with the mixer. A game holds at most
   * min(`engine.limits.audio_clips`, 128) clips and min(`audio_mib`, 64 MiB)
   * of clip data (RangeError). */
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
  /** Decodes a package file (WAV, Ogg Vorbis, Ogg Opus). Rejects with a
   * TypeError for a bad path, `NotFoundError`, `EncodingError` for data it
   * cannot decode, RangeError past the budget or with 128 decodes already
   * waiting. */
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
  /** A playing clip. Control calls on a finished sound do nothing. */
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
   * operations a frame (stops and releases always go through); past either
   * a RangeError. */
  export function play(clip: AudioClip, options?: PlayOptions): Sound;

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
  // connection 2: past one a RangeError. Not supported: channel count settings (buffers are mono or
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
    /** Seconds of mixer time. */
    readonly currentTime: number;
    readonly sampleRate: number;
    readonly state: "running" | "suspended";
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
    /** Decodes a package file. */
    loadBuffer(path: string): Promise<AudioBuffer>;
    /** Resolve at once (the graph runs while the game does); kept for web
     * code that resumes after a gesture. */
    resume(): Promise<void>;
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

  export type PlatformErrorKind =
    | "not-allowed"
    | "signed-out"
    | "terms-required"
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "conflict"
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
  /** Why the player's session ended: they signed out (in the Options
   * menu), another device took over the game, the platform needs the terms
   * accepted again, the credentials expired or were revoked. The game then
   * plays as a guest (`player()` is null) until the player signs in again. */
  export type SessionEndReason = "signed-out" | "elsewhere" | "terms-required" | "expired" | "revoked";
  export function onSessionEnded(listener: (reason: SessionEndReason) => void): Unsubscribe;
  /** Opens the runtime's own Account dialog, where the player signs in
   * (games never draw sign-in themselves, and never see credentials).
   * Resolves with the player once signed in, or null when they close it.
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
    readonly username: string;
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
    backfillAiPlayers?: boolean;
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
    /** A participant's binary or text message. */
    data: (from: string, payload: Uint8Array) => void;
    /** `ready`, `chat` or a host's `event` frame. */
    control: (from: string, kind: "ready" | "chat" | "event", frame: JsonValue) => void;
    roster: (room: Room) => void;
    result: (result: JsonValue) => void;
    presence: (userId: string, online: boolean) => void;
  }
  /** The room's realtime socket. */
  export class RoomSocket {
    #private;
    private constructor();
    readonly state: RoomSocketState;
    on<E extends keyof RoomSocketEvents>(event: E, listener: RoomSocketEvents[E]): Unsubscribe;
    /** At most 8 KB; paced to 28 a second (burst 45): false when dropped. */
    sendData(payload: Uint8Array | string): boolean;
    /** Control frames: a guest may send 10 a minute. */
    sendReady(): boolean;
    sendChat(text: string): boolean;
    /** Host only: an event frame with these fields (at most 4 KB). */
    sendEvent(kind: string, fields?: { [key: string]: JsonValue }): boolean;
    close(): void;
  }
  export const rooms: {
    /** One active room per player (`conflict` otherwise). */
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
    leave(roomId: string): Promise<void>;
    /** Host only. */
    seat(roomId: string, seats: readonly { participantId: string; team: number; slot: number }[]): Promise<Room>;
    invite(roomId: string, userId: string): Promise<void>;
    invites(): Promise<RoomInvite[]>;
    acceptInvite(inviteId: string): Promise<Room>;
    declineInvite(inviteId: string): Promise<void>;
    connect(roomId: string): RoomSocket;
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
   * most 16 KB. */
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
    readonly score: number;
    readonly rank: number;
    readonly submittedAt: number;
  }
  export const leaderboards: {
    list(): Promise<Leaderboard[]>;
    /** `pageSize` 1–100. */
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
     * `not-allowed` when the player refused the microphone). */
    join(conversationId: string): Promise<VoiceStatus>;
    leave(): Promise<void>;
    setMode(mode: "push-to-talk" | "open-mic"): void;
    /** Push-to-talk: transmit while true (call from an action's press and
     * release). */
    setTransmitting(transmitting: boolean): void;
    setMuted(muted: boolean): void;
    setDeafened(deafened: boolean): void;
    setVolume(userId: string, volume: number): void;
    setLocallyMuted(userId: string, muted: boolean): void;
    /** Positional voice: where a participant's voice comes from (world
     * meters, null for none) relative to the scene's camera. */
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
   * outputs outside loops. Anything else throws a SyntaxError naming the
   * file, line and column (with `fallback: "script"`, it runs as script).
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
   * that does not parse, or what the script throws. */
  export function loadClassic(path: string): void;

  /** The context the platform passes a server script; local callers supply
   * it (`now` and `random` default to the host's clock and a fresh random
   * number). Every value must be JSON (TypeError otherwise). */
  export interface SessionContext {
    now?: number;
    random?: number;
    sessionId: string;
    players: { id: string; name: string; ai?: boolean }[];
    room?: {
      roomId: string;
      metadata: JsonValue;
      roster: { userId: string | null; name: string; team: number; slot: number; ai: boolean }[];
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
  // own, so its work leaves the game's thread (since API_MINOR 2). It gets the platform
  // sandbox's rules and nothing of the host: no imports of built-in
  // modules, no `Date`, no `Math.random`, no timers, and `Intl` dates read
  // the epoch (an authority's: the invocation's `ctx.now`). It and the game
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
   * `globalThis.game` with `createSession`, `onPlayerMessage` and `onTick`
   * (the same file the platform runs as `server=`). Throws a TypeError for
   * a bad path, a context that is not an object or not JSON, or no player;
   * `NotFoundError`; a RangeError for a context or state too big, a `rate`
   * outside 0–240, past 4 workers, or when the game's heap cannot spare
   * `heapMiB`. A script that does not parse, defines no `game` with those
   * functions, or fails or refuses `createSession` fails the authority (an
   * `error`, then `stopped` with `"failed"`). */
  export function authority(path: string, options: AuthorityOptions): Authority;
}
