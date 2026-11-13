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
| Map page | `ui/app.html` | the map, the data set select, the side panel (details of the selection), the ask bar and the chat |

How they talk: Claude calls a tool → the server updates the session → the bus pushes the view to every open map page; a question on the map goes to Claude through the monitor, the watcher or the hook.

## Tests and evidence
- `test/analysis.test.mjs`, `test/server.test.mjs`; e2e `scripts/e2e.mjs` (see [harness](../harness/README.md)); screenshots on the `e2e-evidence` branch.

## Map page layout
- **Toolbar:** a native select "Data set" lists the saved sessions as "name · N apps · date", newest first (`sessions` action). Choosing one loads its snapshot and restores its camera; it always shows the open data set and follows a new scout by itself. It is not rebuilt while the user has it open. Export (toolbar button) exports the open data set.
- **Side panel:** the details of the selection (or of what the zoom puts in focus), numbers that open tables, Clear. No Ask Claude and no context text.
- **Ask bar** (under the map, above the lenses, shown once a data set is open): Chat button with the number of questions, a chip naming the selection (× clears it: the question is then about the whole data set), the input ("Ask Claude about <name>"), Send; Enter sends. The page sends `contextOf()` of the chip's target with the question; it is never shown. The bar is static markup that is only updated, never rebuilt, so typing, focus and cursor survive every push.
- **Chat** (above the bar): built from the session's saved questions (`D.questions`, the last 20), so every open copy shows the same. Each question shows its chip and Claude's answer; the newest unanswered one shows its status: "Sending to Claude…", "Claude has your question…", or after 8 seconds without a watcher the fallback (send any message in Claude Code, or Copy and paste it elsewhere). "Ask Claude to group" and "Plan from idea" go through the same queue (`context.request`), so their status shows in the same place. Folds with the Chat button; the state is kept in `localStorage` (`appScout.chatOpen`, read and written in try/catch); an answer push unfolds it. Suggested questions show as chips only while the chat is empty.

## Questions without a monitor or watcher
Where neither runs, the chat under the map says to send any message in Claude (the prompt hook attaches the question in Claude Code) and offers the question to copy. Claude Desktop Chat runs no monitor or hook, so there the user pastes it. The chat card that used to post it was removed in 0.4.0; see [failure 2026-11-03](../failures/2026-11-03-card-without-ipc.md).

## What the map server checks
Every request: listens on `127.0.0.1` only, `Host` is local, `Origin` (when a browser sends one) is the map page itself, and the token matches. No CORS headers. What a page sends is cut by `bounded()` before it is saved or put in a question for Claude. The side panel keeps the user's typing, focus and cursor across redraws, and the ask bar is never rebuilt. Why: [failure 2026-11-12](../failures/2026-11-12-panel-typing-and-map-server.md).

## Known limits
- Runs only where Claude starts local plugin servers (not claude.ai chat); see the README table.
