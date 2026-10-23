#!/usr/bin/env node
// App Scout MCP server: JSON-RPC 2.0 over stdio, one message per line (MCP stdio transport).
// stdout carries only protocol messages; every log goes to stderr.
import { createInterface } from 'node:readline';
import { callTool, listResources, listTools, readResource, setClientCapabilities } from './tools.mjs';
import { handleAction } from './actions.mjs';
import { startWeb } from './web/server.mjs';
import { log } from './lib/util.mjs';

const VERSION = '0.1.1';
const SUPPORTED = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

const INSTRUCTIONS = `App Scout researches the app market for the user and shows it on a live map.
Workflow: scout (topic optional, apps default 100) -> scout_status until status is "grouping" -> list_apps -> save_grouping (4-8 segments, 2-4 keywords each naming app ids, openings tied to apps) -> summarise in 3 lines.
If the user describes their own product idea, call plan_research first and let them start a focused scout from the plan.
Questions asked from the map arrive as user messages that include a session id and the selection's context; use get_view_state for more, and answer_question to show the answer on the map.
Every estimate is labelled est. with its method; never present one as a measured number.`;

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      const v = SUPPORTED.includes(params?.protocolVersion) ? params.protocolVersion : SUPPORTED[1];
      setClientCapabilities(params?.capabilities);
      return {
        protocolVersion: v,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
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
    case 'resources/list':
      return { resources: listResources() };
    case 'resources/templates/list':
      return { resourceTemplates: [] };
    case 'resources/read':
      return readResource(params?.uri);
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

startWeb(handleAction);
log(`v${VERSION} ready`);
