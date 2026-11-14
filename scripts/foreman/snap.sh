#!/bin/sh
# scripts/foreman/snap.sh "hut:0;hut:2,3" : film strips of strikes, as PNG.
rm -rf scripts/foreman/out
SNAP="$1" npx vitest run --config scripts/foreman/vitest.config.ts --disableConsoleIntercept scripts/foreman/snap 2>&1 | grep wrote
node scripts/foreman/svg2png.mjs
