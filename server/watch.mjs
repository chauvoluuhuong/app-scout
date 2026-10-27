#!/usr/bin/env node
// Watches this Claude Code session's map server for questions asked on the map and prints each
// as one line. Two ways to run it:
// - as the plugin's monitor (monitors/monitors.json), for the whole session: Claude Code hands
//   every line to Claude as a notification;
// - with --once, as a background command Claude starts itself (where monitors don't run, as in
//   the desktop app): it exits after the first question, and Claude Code wakes Claude with its
//   output. Claude starts it again after answering.
// Usage: node server/watch.mjs [--once] [plugin data dir]
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findServer } from './lib/live.mjs';

const args = process.argv.slice(2);
const once = args.includes('--once');
const dataDir = args.find((a) => !a.startsWith('--')) || process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.app-scout');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (;;) {
  const srv = findServer(dataDir);
  if (!srv) { await sleep(3000); continue; } // no map server yet in this session
  try {
    const r = await fetch(`${srv.origin}/wait?t=${encodeURIComponent(srv.token)}&ms=25000`, { signal: AbortSignal.timeout(35000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const questions = (await r.json()).questions || [];
    for (const line of questions) process.stdout.write(line.replace(/\s*\n\s*/g, ' ') + '\n');
    if (once && questions.length) process.exit(0);
  } catch {
    await sleep(3000); // the server restarted or is gone; find it again
  }
}
