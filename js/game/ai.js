// ai.js — thin ES-module wrapper over `globalThis.FootballSim`.
// The implementation lives in /server.js (loaded as a classic <script> before
// the module graph) so the browser client and the authoritative Jint server
// share exactly one code path. Do not add logic here.
//
// AI brains for every AI seat. Utility scoring re-evaluated at ~6 Hz per
// player; steering runs every tick through the same input shape human clients
// send, so AI footballers obey exactly the same physics as humans. The
// decision cache lives in state.aiPlans (per match).

const S = globalThis.FootballSim;
if (!S) throw new Error('FootballSim missing: load /server.js before the module graph.');

export function computeAiInput(state, p, dt, difficulty) { return S.computeAiInput(state, p, dt, difficulty); }
export function clearAiPlans(state) { return S.clearAiPlans(state); }
