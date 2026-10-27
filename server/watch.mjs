#!/usr/bin/env node
// The plugin's monitor (monitors/monitors.json): runs in the background for the whole Claude
// Code session and long-polls this session's map server. Each question asked on the map is
// printed as one line, which Claude Code delivers to Claude as a notification, so Claude
// answers without the user going back to the chat. Prints nothing else.
// Usage: node server/watch.mjs <plugin data dir>
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findServer } from './lib/live.mjs';

const dataDir = process.argv[2] || process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.app-scout');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (;;) {
  const srv = findServer(dataDir);
  if (!srv) { await sleep(3000); continue; } // no map server yet in this session
  try {
    const r = await fetch(`${srv.origin}/wait?t=${encodeURIComponent(srv.token)}&ms=25000`, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    for (const line of (await r.json()).questions || []) process.stdout.write(line.replace(/\s*\n\s*/g, ' ') + '\n');
  } catch {
    await sleep(3000); // the server restarted or is gone; find it again
  }
}
