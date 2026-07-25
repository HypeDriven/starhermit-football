// snapformat.js — shared field layout for the server's snapshot/replay arrays.
// server.js buildSnapshot() (live snaps) and recordReplayFrame() (archived
// replay frames) emit b/pl in exactly this layout; both client parsers
// (match.js live interpolation, replayview.js playback) go through these
// helpers so the two can never drift. Keep in sync with server.js.

// pl row: [id, team, x, z, vx, vz, facing, anim, animSpeed, phase, kickT,
//          tackleT, stunT, diveT, diveDir, celebrateT, isAi, name, y]
export function parsePlayerRow(e) {
  return {
    id: e[0], team: e[1], x: e[2], z: e[3], vx: e[4], vz: e[5], facing: e[6],
    anim: e[7], animSpeed: e[8], phase: e[9], kickT: e[10], tackleT: e[11],
    stunT: e[12], diveT: e[13], diveDir: e[14], celebrateT: e[15],
    isAi: e[16], name: e[17], y: e[18] || 0,
  };
}

// b row: [x, y, z, vx, vy, vz, owner] (owner -1 = loose ball)
export function parseBallRow(b) {
  return {
    x: b[0], y: b[1], z: b[2], vx: b[3], vy: b[4], vz: b[5],
    owner: b[6] >= 0 ? b[6] : null,
  };
}
