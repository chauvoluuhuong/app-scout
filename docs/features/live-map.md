# Live map
Ask Claude to scout; App Scout crawls five stores and shows the apps on a map in the browser. There is no card in the chat: the chat card (`ui/dock.html`) was removed in 0.4.0. Usage and tools: [README](../../README.md).

## Components
| Component | File(s) | Role |
|---|---|---|
| MCP server and tools | `server/index.mjs`, `server/tools.mjs` | tools Claude calls; starts the web server |
| Crawl and analysis | `server/pipeline.mjs`, `server/stores/`, `server/analysis.mjs` | collect apps, estimates |
| Sessions | `server/sessions.mjs`, `server/export.mjs` | saved research, exports |
| Map page and sync | `server/web/`, `server/bus.mjs`, `server/viewmodel.mjs` | page, WebSocket, shared state across servers |
| Map questions | `server/watch.mjs`, `server/hook.mjs`, `monitors/` | deliver questions from the map to Claude |
| Map page | `ui/app.html` | the map, its panel and Ask Claude |

How they talk: Claude calls a tool → the server updates the session → the bus pushes the view to every open map page; a question on the map goes to Claude through the monitor, the watcher or the hook.

## Tests and evidence
- `test/analysis.test.mjs`, `test/server.test.mjs`; e2e `scripts/e2e.mjs` (see [harness](../harness/README.md)); screenshots on the `e2e-evidence` branch.

## Questions without a monitor or watcher
Where neither runs, the map says to send any message in the chat (the prompt hook attaches the question in Claude Code) and offers the question to copy. Claude Desktop Chat runs no monitor or hook, so there the user pastes it. The chat card that used to post it was removed in 0.4.0; see [failure 2026-11-03](../failures/2026-11-03-card-without-ipc.md).

## What the map server checks
Every request: listens on `127.0.0.1` only, `Host` is local, `Origin` (when a browser sends one) is the map page itself, and the token matches. No CORS headers. What a page sends is cut by `bounded()` before it is saved or put in a question for Claude. The panel keeps the user's typing, focus and cursor across redraws. Why: [failure 2026-11-12](../failures/2026-11-12-panel-typing-and-map-server.md).

## Known limits
- Runs only where Claude starts local plugin servers (not claude.ai chat); see the README table.
