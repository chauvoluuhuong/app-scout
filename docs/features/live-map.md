# Live map
Ask Claude to scout; App Scout crawls five stores and shows the apps on a map in the browser, with a card in chat apps that render MCP Apps. Usage and tools: [README](../../README.md).

## Components
| Component | File(s) | Role |
|---|---|---|
| MCP server and tools | `server/index.mjs`, `server/tools.mjs` | tools Claude calls; starts the web server |
| Crawl and analysis | `server/pipeline.mjs`, `server/stores/`, `server/analysis.mjs` | collect apps, estimates |
| Sessions | `server/sessions.mjs`, `server/export.mjs` | saved research, exports |
| Map page and sync | `server/web/`, `server/bus.mjs`, `server/viewmodel.mjs` | page, WebSocket, shared state across servers |
| Map questions | `server/watch.mjs`, `server/hook.mjs`, `monitors/` | deliver questions from the map to Claude |
| Chat card | `ui/dock.html`, `ui/app.html` | MCP Apps card |

How they talk: Claude calls a tool → the server updates the session → the bus pushes the view to every open map page; a question on the map goes to Claude through the monitor, the watcher or the hook.

## Tests and evidence
- `test/analysis.test.mjs`, `test/server.test.mjs`; e2e `scripts/e2e.mjs` (see [harness](../harness/README.md)); screenshots on the `e2e-evidence` branch.

## Chat card in hosts without tool calls
Some hosts render the card but refuse its tool calls (Claude Code desktop: "IPC not available"). The card then takes the map link from the tool result and shows only Open map and the link; Send and Copy need tool calls and are off. Why: [failure 2026-11-03](../failures/2026-11-03-card-without-ipc.md).

## Known limits
- Runs only where Claude starts local plugin servers (not claude.ai chat); see the README table.
