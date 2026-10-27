# App Scout

App Scout is a Claude plugin for researching the app market before you build your next app. Ask Claude to scout, and App Scout collects up to 100 apps per platform (or as many as you choose) from each of the **App Store, Google Play, Chrome Web Store, Google Workspace Marketplace and GitHub**, shows them on a live map, and lets Claude group them into segments, keywords and openings. You move from the overview into any segment, keyword or app, see the numbers behind it, and ask Claude about exactly what you're looking at. Every research session is saved, so you can come back to it later or export it.

## What you get

- **A live map.** Each dot is an app. Close dots are similar apps. Dot size is estimated monthly revenue, brightness is users (ranked within each store), and a hollow ring means the revenue is unknown. Zoom from segments to keywords to app names.
- **Crawl progress you can see.** In the middle of the map while the scout runs (Hide moves it out of the way; the percentage stays in the top bar). Per store: apps found, details read, reviews read, and when a store asks us to slow down.
- **Overview mode.** Ask for nothing and it reads the overall charts; give it a topic and it searches for it.
- **Plan mode.** Describe your idea; Claude proposes customers, product forms and segments to scout; you edit the plan and start a focused scout.
- **Ask Claude from the map.** Every selection (category, segment, keyword, app, opening) has an Ask Claude button that sends your question with its full context: the path, the numbers on screen and the items around it. How it reaches Claude depends on where you use it: in the Claude Code terminal a background monitor hands it over right away; in the Claude Code desktop app Claude keeps a small background watcher running that does the same; in Claude Desktop Chat the App Scout card in the conversation shows the prompt and you press **Send** (or Enter). If none of these is running, the map tells you to send any message in the chat, and your question rides along with it.
- **Detail tables.** Every number in the side panel opens a sortable table.
- **Lenses.** In the bar under the map: leaders, money gaps (many users, little revenue), premium niches and unknown revenue. Dot size is always estimated revenue and brightness is users.
- **Sessions and export.** Saved after every step. Export as a Markdown report, a CSV of apps, or JSON with everything.
- **One map, open anywhere.** Each tool ends with the map's link. Claude opens it in the Claude desktop app's built-in browser when it can, and the same link works in any browser. Every open copy updates live and follows a new scout or plan by itself.

## Install

From Claude Code:

```bash
claude plugin marketplace add chauvoluuhuong/app-scout
claude plugin install app-scout@app-scout
```

Then ask: `scout the app market`, `scout ai meeting notes apps with 200 apps`, or `/app-scout:plan a meeting notes app for Vietnamese small teams`.

Requirements: Node.js 18 or later on your computer. App Scout has no npm dependencies.

## Where it works

App Scout's MCP server runs on your computer, so it loads where Claude starts local plugin servers:

| Surface | What you get |
|---|---|
| Claude Code desktop app (Code tab) | Every tool and skill; Claude opens the live map in the app's built-in browser, and the same link works in your own browser |
| Claude Code (terminal, IDE) and Cowork sessions on your computer | Every tool and skill, and the live map in your browser through the link each tool returns |
| Chat on claude.ai, desktop and mobile | Not supported: chat doesn't start local plugin servers |

## Tools

| Tool | What it does |
|---|---|
| `scout` | Starts a scout (topic optional; `apps` is the most to collect per platform, default 100) and shows the map |
| `scout_status` | Waits for the crawl and reports progress per store |
| `list_apps` | A compact list of the collected apps for Claude to group and analyse |
| `save_grouping` | Saves Claude's segments, keywords, openings and complaint notes; the map redraws |
| `plan_research` | Shows an editable research plan from your idea |
| `show_map`, `list_sessions` | Reopen saved research |
| `get_view_state`, `answer_question` | Read what you're looking at and show Claude's answers on the map |
| `export_session` | Write a session to Markdown, CSV or JSON |

Skills: `/app-scout:scout`, `/app-scout:plan`, `/app-scout:resume`.

## What App Scout runs, sends and stores

This section lists everything the plugin does on your computer and on the network.

- **It runs one local process:** `node server/index.mjs`, the MCP server. Its source is plain, readable JavaScript in `server/`; there is no build step and no bundled or minified code.
- **It reads public pages and APIs, and nothing else:**
  - `itunes.apple.com` (Search, Lookup, RSS charts and customer-review feeds) and `apps.apple.com` (public listing pages, for in-app purchase prices)
  - `play.google.com` (public search, category and listing pages)
  - `chromewebstore.google.com` (public search, category and listing pages)
  - `workspace.google.com/marketplace` (public search, category and listing pages)
  - `api.github.com` (public repository search, without a token)

  Requests go one at a time per site with a 1.2–3 second gap, and the crawler waits when a site answers 429 or 503. It never rotates IP addresses, solves CAPTCHAs or disguises its traffic.
- **It sends nothing about you anywhere.** No analytics, no telemetry, no account, no API keys. The only outbound requests are the store reads above, and they carry only your search topic.
- **It opens a local web server on `127.0.0.1`** (port 4777, or the next free one up to 4797) for the map page, its buttons, exports, and a WebSocket that keeps every open copy of the map in sync with the server. It listens on your own computer only, checks the `Host` header, and requires a random token generated at each start on every request. While it runs it writes its port and token to `live/<pid>.json` in the data directory, and removes the file when it stops.
- **It runs a background monitor and a prompt hook in your Claude Code session.** The `map-questions` monitor (`server/watch.mjs`) waits on that local server and prints each question you ask on the map, which Claude Code shows to Claude. Where monitors don't run (the desktop app), tool results ask Claude to start the same script with `--once` as a background command; it exits after the first question, which wakes Claude. The `UserPromptSubmit` hook (`server/hook.mjs`) adds questions the monitor didn't deliver to your next message. Both find the server of their own session through the `live/` files and talk only to `127.0.0.1`; they print nothing when there is no question.
- **It shows a card in chat apps that render MCP Apps** (Claude Desktop Chat): `ui/dock.html`, with the map link and, when you ask on the map, the prepared prompt with Copy and Send. It talks only to App Scout through the chat app, and posts a message only when you press Send.
- **It stores data on your computer only:** sessions, preferences and exports as JSON and text files in the plugin's data directory (`~/.claude/plugins/data/app-scout…`, or `~/.app-scout` when run on its own). Uninstalling the plugin removes that directory unless you keep it. Several App Scout servers can share that directory (Claude Desktop starts one per chat): each one watches the `sessions` folder, so a map page open on any of them follows a scout running in another, and none writes an older copy of a session over a newer one.
- **Store data you collect** stays on your computer. Please respect each store's terms when you use or share it.

## Estimates

Revenue is estimated with the same method as the app-market-research skill: user base (installs or users; for the App Store, ratings × 50–100) × 30% active × 1–4% paying × the lowest monthly price found in the app's in-app purchases. It's shown as a range with its method and a confidence level (L for App Store, M for published installs), and it's never a measured number. Apps with no price signal show as hollow rings.

## Development

```bash
npm test                                  # unit and protocol tests, offline
node scripts/e2e.mjs                      # end-to-end: the real server and two map pages in headless Chrome, screenshots in e2e-out/
node scripts/try.mjs "meeting notes" 20   # run a real scout through the MCP server
node scripts/serve-dev.mjs                # serve the browser map for the dev sessions (token "dev")
node scripts/host-harness.mjs             # a minimal MCP Apps chat host for the App Scout card, on http://127.0.0.1:4790
claude plugin validate . --strict
```

## License

MIT. See [LICENSE](LICENSE).
