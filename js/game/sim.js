// sim.js — thin ES-module wrapper over `globalThis.FootballSim`.
// The implementation lives in /server.js (loaded as a classic <script> before
// the module graph) so the browser client and the authoritative Jint server
// share exactly one code path. Do not add logic here.
//
// Units are meters, seconds. Pitch centered on origin: x ∈ [-L/2, L/2] is the
// length (goals at each end), z ∈ [-W/2, W/2] the width. Team 0 attacks +x in
// half 1; teams swap sides at half time.

const S = globalThis.FootballSim;
if (!S) throw new Error('FootballSim missing: load /server.js before the module graph.');

export const WALK_SPEED = S.WALK_SPEED;
export const RUN_SPEED = S.RUN_SPEED;
export const SPRINT_SPEED = S.SPRINT_SPEED;
export const BALL_SLOWDOWN = S.BALL_SLOWDOWN;
export const CONTROL_RADIUS = S.CONTROL_RADIUS;
export const STEAL_RADIUS = S.STEAL_RADIUS;
export const TACKLE_RANGE = S.TACKLE_RANGE;
export const GRAVITY = S.GRAVITY;
export const BALL_R = S.BALL_R;
export const RESTITUTION = S.RESTITUTION;
export const AI_NAME_POOL = S.AI_NAME_POOL;

export function takeAiName(rng) { return S.takeAiName(rng); }
export function pitchFor(teamSize) { return S.pitchFor(teamSize); }
export function roleForSlot(slot, teamSize) { return S.roleForSlot(slot, teamSize); }
export function formationAnchor(slot, teamSize) { return S.formationAnchor(slot, teamSize); }
export function makeRng(seed) { return S.makeRng(seed); }
export function createMatch(opts) { return S.createMatch(opts); }
export function makePersonality(rng) { return S.makePersonality(rng); }
export function resetKickoff(state, kickoffTeam) { return S.resetKickoff(state, kickoffTeam); }
export function attackSign(state, team) { return S.attackSign(state, team); }
export function emptyInput() { return S.emptyInput(); }
export function stepMatch(state, inputs, dt) { return S.stepMatch(state, inputs, dt); }
export function dist(a, b) { return S.dist(a, b); }
export function clamp(v, lo, hi) { return S.clamp(v, lo, hi); }
export function openness(state, p) { return S.openness(state, p); }
