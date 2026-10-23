# App Scout

App Scout is a Claude plugin for researching the app market before you build your next app. Ask Claude to scout, and App Scout collects up to 100 apps (or as many as you choose) from the **App Store, Google Play, Chrome Web Store, Google Workspace Marketplace and GitHub**, shows them on a live map, and lets Claude group them into segments, keywords and openings. You move from the overview into any segment, keyword or app, see the numbers behind it, and ask Claude about exactly what you're looking at. Every research session is saved, so you can come back to it later or export it.

## What you get

- **A live map.** Each dot is an app. Close dots are similar apps. Dot size is estimated monthly revenue, brightness is users (ranked within each store), and a hollow ring means the revenue is unknown. Zoom from segments to keywords to app names.
- **Crawl progress you can see.** Per store: apps found, details read, reviews read, and when a store asks us to slow down.
- **Overview mode.** Ask for nothing and it reads the overall charts; give it a topic and it searches for it.
- **Plan mode.** Describe your idea; Claude proposes customers, product forms and segments to scout; you edit the plan and start a focused scout.
- **Ask Claude from the map.** Every selection (category, segment, keyword, app, opening) has an Ask Claude button that sends your question with its full context: the path, the numbers on screen and the items around it.
- **Detail tables.** Every number in the side panel opens a sortable table.
- **Lenses.** Leaders, money gaps (many users, little revenue), premium niches and unknown revenue.
- **Sessions and export.** Saved after every step. Export as a Markdown report, a CSV of apps, or JSON with everything.
- **Open in browser.** The same map opens in a browser tab, full screen, and stays in sync with the chat.

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
| Claude Code (terminal, IDE, desktop Code tab) | Every tool and skill, and the live map in your browser through the link each tool returns |
| Cowork sessions on your computer | Every tool and skill; the map shows inside the conversation where MCP Apps render, and Open in browser always works |
| Chat on claude.ai, desktop and mobile | Not supported: chat doesn't start local plugin servers |

## Tools

| Tool | What it does |
|---|---|
| `scout` | Starts a scout (topic optional, `apps` default 100) and shows the map |
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
- **It opens a local web server on `127.0.0.1`** (port 4777, or the next free one up to 4797) for the Open in browser page, its buttons, exports, and a WebSocket that keeps the chat and the browser in sync. It listens on your own computer only, checks the `Host` header, and requires a random token generated at each start on every request.
- **It stores data on your computer only:** sessions, preferences and exports as JSON and text files in the plugin's data directory (`~/.claude/plugins/data/app-scout…`, or `~/.app-scout` when run on its own). Uninstalling the plugin removes that directory unless you keep it.
- **Store data you collect** stays on your computer. Please respect each store's terms when you use or share it.

## Estimates

Revenue is estimated with the same method as the app-market-research skill: user base (installs or users; for the App Store, ratings × 50–100) × 30% active × 1–4% paying × the lowest monthly price found in the app's in-app purchases. It's shown as a range with its method and a confidence level (L for App Store, M for published installs), and it's never a measured number. Apps with no price signal show as hollow rings.

## Development

```bash
npm test                                  # unit and protocol tests, offline
node scripts/try.mjs "meeting notes" 20   # run a real scout through the MCP server
node scripts/serve-dev.mjs                # serve the browser map for the dev sessions (token "dev")
node scripts/host-harness.mjs <session>   # a minimal MCP Apps host on http://127.0.0.1:4790
claude plugin validate . --strict
```

## License

MIT. See [LICENSE](LICENSE).
