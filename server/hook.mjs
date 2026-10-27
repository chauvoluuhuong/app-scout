#!/usr/bin/env node
// The plugin's UserPromptSubmit hook (hooks/hooks.json), the backup to the monitor: when the
// user sends any message, questions asked on the map that Claude hasn't received yet are
// printed, and Claude Code adds them to the message's context. Quiet and quick otherwise.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findServer } from './lib/live.mjs';

const dataDir = process.env.CLAUDE_PLUGIN_DATA || join(homedir(), '.app-scout');
try {
  const srv = findServer(dataDir);
  if (srv) {
    const r = await fetch(`${srv.origin}/pending?t=${encodeURIComponent(srv.token)}`, { signal: AbortSignal.timeout(1500) });
    const { questions = [] } = r.ok ? await r.json() : {};
    if (questions.length) process.stdout.write(`Questions the user asked on the App Scout map:\n${questions.join('\n')}\n`);
  }
} catch {
  // never block the user's message
}
