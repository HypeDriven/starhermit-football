#!/bin/sh
# Runs the native client's logic tests: compiles engine/src/logic and
# engine/tests with TypeScript into a temporary directory and runs them with
# Node's test runner (Node 22+). Set TSC to the compiler command, e.g.
#   TSC="node /path/to/typescript/bin/tsc" engine/tests/run.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
tsc=${TSC:-tsc}
out=$(mktemp -d "${TMPDIR:-/tmp}/football-engine-tests.XXXXXX")
trap 'rm -rf "$out"' EXIT INT TERM
$tsc -p "$here/tsconfig.json" --outDir "$out"
printf '{"type":"module"}\n' > "$out/package.json"
FOOTBALL_REPO=$(cd "$here/../.." && pwd) node --test "$out"/engine/tests/*.test.js
