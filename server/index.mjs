#!/usr/bin/env node
// App Scout MCP server: JSON-RPC 2.0 over stdio, one message per line (MCP stdio transport).
// stdout carries only protocol messages; every log goes to stderr.
import { createInterface } from 'node:readline';
import { callTool, listTools } from './tools.mjs';
import { handleAction, hasQuestions, takeQuestions } from './actions.mjs';
import { startWeb } from './web/server.mjs';
import { log } from './lib/util.mjs';

const VERSION = '0.2.0';
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `App Scout researches the app market for the user and shows it on a live map: a local web page whose link ("Map: http://127.0.0.1:...") ends the result of scout, show_map, plan_research and scout_status.
Showing the map: the first time a result carries a map link in this conversation, open it. If you have a built-in browser (for example the Claude desktop app's browser pane), open the link there. Always also give the user the link so they can open it in their own browser too. Any number of pages can be open at once (in-app and in the browser); they share one state and update live, and open pages switch to a new scout by themselves, so don't reopen the link for every result.
Workflow: scout (topic optional, apps default 100) -> scout_status until status is "grouping" -> list_apps -> save_grouping (4-8 segments, 2-4 keywords each naming app ids, openings tied to apps) -> summarise in 3 lines.
If the user describes their own product idea, call plan_research first and let them start a focused scout from the plan on the map.
Questions the user asks on the map reach you as lines starting "[App Scout map question q-… · session …]" with the map context: as a notification from the plugin's map-questions monitor, or attached to the user's next message. Answer each one in the chat right away (use list_apps or get_view_state if you need more), then call answer_question with its session and question_id so every open page shows the answer. scout_status and show_map also list unanswered ones.
Every estimate is labelled est. with its method; never present one as a measured number.`;

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const v = SUPPORTED.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED[1];
      return {
        protocolVersion: v,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'app-scout', title: 'App Scout', version: VERSION },
        instructions: INSTRUCTIONS,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      return { tools: listTools() };
    case 'tools/call':
      return callTool(params?.name, params?.arguments);
    case 'prompts/list':
      return { prompts: [] };
    default:
      if (id === undefined) return undefined; // notifications need no reply
      throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }
}

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  if (msg.id === undefined) {
    handle(msg).catch((e) => log('notification failed:', e.message));
    return;
  }
  try {
    const result = await handle(msg);
    send({ jsonrpc: '2.0', id: msg.id, result: result ?? {} });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } });
  }
});
rl.on('close', () => process.exit(0));

startWeb(handleAction, { has: hasQuestions, take: takeQuestions });
log(`v${VERSION} ready`);
