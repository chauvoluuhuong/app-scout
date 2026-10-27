---
name: scout
description: Research the app market on a live map. Crawls the App Store, Google Play, Chrome Web Store, Google Workspace Marketplace and GitHub (up to 100 apps per platform by default), then you group the apps into segments, keywords and openings that the map draws. Use it when someone wants to scout apps or tools, see what is trending or earning in a category, map competitors, find gaps for their next app, or says "scout", "market map", "app ideas", "nghiên cứu thị trường app", "app nào đang hot", even with no topic at all.
---

# App Scout

App Scout's MCP server does the crawling, keeps every research session, and shows a live map: a local web page whose link (`Map: http://127.0.0.1:…`) ends the tool results. The first time you get a link, open it in your built-in browser if you have one (the Claude desktop app's browser pane), and always give the user the link too. Open copies update by themselves; don't reopen it for every result. Your job is the judgment: grouping, naming, openings, and answers.

## Overview mode (the default)

1. **Start.** Call `scout`. Leave `topic` out when the user asks for nothing specific: the server reads the overall charts. `apps` is the most apps to collect from each platform, not the total: keep it at 100 unless the user names a number ("50 apps" means up to 50 per platform). Use `market: "vn"` when the user writes in Vietnamese or asks about Vietnam.
2. **Wait.** Call `scout_status` with the session id until the status is `grouping` (or `ready`). Each call waits up to 40 seconds; tell the user in one short line what is happening, not after every call.
3. **Read.** Call `list_apps` (page with `offset` past 150 apps).
4. **Group.** Call `save_grouping`:
   - 4–8 **segments** with short shared names ("Meeting assistant", "PDF tools"), each with a one-sentence `insight` grounded in the numbers (apps, users, estimated revenue, top grossing, review complaints).
   - 2–4 **keywords** per segment, each listing its `app_ids`. Every app should land in a keyword; anything that fits nowhere can stay out and lands in "Other".
   - 2–4 **openings**: a gap the data supports (many users but little revenue, a store where a segment is thin, a repeated complaint, a language or market no one serves). Tie each to the `app_ids` that show it and list the `evidence`.
   - `app_notes` with the main complaint for leaders whose low reviews you saw.
5. **Report** in three lines: what is trending, where the money is, the clearest opening. The map carries the detail; don't repeat it.

## Plan mode (the user has an idea)

When the user describes their own product idea, call `plan_research` before scouting: 2–4 customer types, the product forms that fit (mobile app, Chrome extension, web app, Workspace add-on), and 2–5 segments to scout, each with 1–4 phrases a buyer would type into a store. The user edits the plan in the map and starts a focused scout; then continue from step 2 above with the new session id (call `list_sessions` if you don't have it).

## Questions from the map

The map's **Ask Claude** button sends the question with the selection's context (path, metrics, nearby items). It reaches you as text starting `[App Scout map question q-… · session …]`: a notification from the plugin's `map-questions` monitor, the output of the background watcher (start the `watch.mjs --once` command a tool result gives you, in the background, and again after each answer), a message the user sent from the App Scout card, or text attached to the user's next message. `scout_status` and `show_map` also list unanswered ones, and `get_view_state` returns them in full. Answer it right away, in the chat, using `list_apps` or `get_view_state` when you need more, then call `answer_question` with the session and question id so the answer appears on the map. Messages that ask you to regroup or split a segment mean: call `list_apps`, then `save_grouping` again.

## Sessions

Every step is saved. "Continue my research" → `list_sessions`, then `show_map` with the session id. `export_session` writes Markdown, CSV or JSON.

## Rules

- Every revenue figure is an **estimate** (`est.`, with its method in the data). Never present one as a measured number.
- Name the store behind a number when you quote it ("1M+ installs on Google Play").
- If a store failed or was slowed, say which in one line and carry on with what came back.
