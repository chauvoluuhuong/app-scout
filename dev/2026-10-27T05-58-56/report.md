# E2E run

22 of 22 steps passed · branch `dev` @ `f819406` · 2026-10-27T05:58:56.115Z

| # | Step | Result |
|---|---|---|
| 01 | Map opens from the link the tool returns | ✅ show_map ends with "Map: http://127.0.0.1:4785/?s=e2e-meeting-notes&t=…" |
| 02 | Toolbar icons sit on the text line | ✅ 6 buttons, every icon within 0.0px of centre |
| 03 | The app count is per platform | ✅ selector "50 / platform" · panel "Apps found 46 · ≤50/platform" |
| 04 | First-run tour shows how to read the map | ✅  |
| 05 | Legend folds into the help icon after the tour | ✅ one encoding: size = est. revenue, brightness = users |
| 06 | Every segment name is drawn | ✅ 6 of 6 segment names on screen |
| 07 | Lenses sit in the bar under the map | ✅ All · 46 \| Leaders · 1 \| Money gaps · 0 \| Premium niche · 0 \| Unknown revenue · 30 · on: Unknown revenue · 30 |
| 08 | Apps found opens a sortable table | ✅ sorted by revenue, first row: Notability: AI Notes & Planner |
| 09 | Selecting a row shows the app on the map | ✅ Notability: AI Notes & Planner |
| 10 | Ask Claude: the monitor hands the question to Claude | ✅ monitor notification: [App Scout map question q-f6493b · session e2e-meeting-notes] "Why do users complain?" Loo… |
| 11 | A second copy of the map opens alongside | ✅ same link, same session, both pages live |
| 12 | Claude's answer reaches both pages | ✅ the asking page shows the answer in place; the second page announced it |
| 13 | Without the monitor, the next message carries the question | ✅ page said "Saved. Go back to Claude and send any message (like “ok”): A…"; the hook attached the question |
| 14 | A plan from Claude shows on every open page | ✅ pushed to both pages; the plan link opens it too |
| 15 | While a scout runs, Scout and its controls are off | ✅ Scout and the app count read "Scouting…" and are off while crawling; back on for a finished session |
| 16 | Crawl progress sits in the middle of the map | ✅ centred on the map, left of the side panel (off by -6px, 0px); Hide and Stop under it |
| 17 | A page on another App Scout server follows the crawl live | ✅ 42% → 77% → finished with 46 apps, pushed from the server that crawled to a page on port 4786 |
| 18 | Export downloads the report | ✅ attachment; filename="e2e-meeting-notes-report.md" |
| 19 | Chat: the App Scout card appears under show_map | ✅ App Scout ai meeting notes (US) Open map Ask Claude on the map, and the prompt appears here to send. |
| 20 | Chat: a question from the map waits on the card with Copy and Send | ✅ page: "Prompt ready in the chat: press Send on the App Scout card." |
| 21 | Chat: Enter on the card posts the prompt as the user message | ✅ [App Scout map question q-3ce5d2 · session e2e-meeting-notes] "Where is the money?"
Looking at: ai m… |
| 22 | Chat: after the answer a new card appears below; the old one steps aside | ✅ old card: "moved to the newest card below"; the map shows the answer |

**01 · Map opens from the link the tool returns**

![Map opens from the link the tool returns](01-map-opens-from-the-link-the-tool-returns.png)

**02 · Toolbar icons sit on the text line**

![Toolbar icons sit on the text line](02-toolbar-icons-sit-on-the-text-line.png)

**03 · The app count is per platform**

![The app count is per platform](03-the-app-count-is-per-platform.png)

**04 · First-run tour shows how to read the map**

![First-run tour shows how to read the map](04-first-run-tour-shows-how-to-read-the-map.png)

**05 · Legend folds into the help icon after the tour**

![Legend folds into the help icon after the tour](05-legend-folds-into-the-help-icon-after-the-tour.png)

**06 · Every segment name is drawn**

![Every segment name is drawn](06-every-segment-name-is-drawn.png)

**07 · Lenses sit in the bar under the map**

![Lenses sit in the bar under the map](07-lenses-sit-in-the-bar-under-the-map.png)

**08 · Apps found opens a sortable table**

![Apps found opens a sortable table](08-apps-found-opens-a-sortable-table.png)

**09 · Selecting a row shows the app on the map**

![Selecting a row shows the app on the map](09-selecting-a-row-shows-the-app-on-the-map.png)

**10 · Ask Claude: the monitor hands the question to Claude**

![Ask Claude: the monitor hands the question to Claude](10-ask-claude-the-monitor-hands-the-question-to-claude.png)

**11 · A second copy of the map opens alongside**

![A second copy of the map opens alongside](11-a-second-copy-of-the-map-opens-alongside.png)

**12 · Claude's answer reaches both pages**

![Claude's answer reaches both pages](12-claude-s-answer-reaches-both-pages.png)

**13 · Without the monitor, the next message carries the question**

![Without the monitor, the next message carries the question](13-without-the-monitor-the-next-message-carries-the-question.png)

**14 · A plan from Claude shows on every open page**

![A plan from Claude shows on every open page](14-a-plan-from-claude-shows-on-every-open-page.png)

**15 · While a scout runs, Scout and its controls are off**

![While a scout runs, Scout and its controls are off](15-while-a-scout-runs-scout-and-its-controls-are-off.png)

**16 · Crawl progress sits in the middle of the map**

![Crawl progress sits in the middle of the map](16-crawl-progress-sits-in-the-middle-of-the-map.png)

**17 · A page on another App Scout server follows the crawl live**

![A page on another App Scout server follows the crawl live](17-a-page-on-another-app-scout-server-follows-the-crawl-live.png)

**18 · Export downloads the report**

![Export downloads the report](18-export-downloads-the-report.png)

**19 · Chat: the App Scout card appears under show_map**

![Chat: the App Scout card appears under show_map](19-chat-the-app-scout-card-appears-under-show-map.png)

**20 · Chat: a question from the map waits on the card with Copy and Send**

![Chat: a question from the map waits on the card with Copy and Send](20-chat-a-question-from-the-map-waits-on-the-card-with-copy-and-send.png)

**21 · Chat: Enter on the card posts the prompt as the user message**

![Chat: Enter on the card posts the prompt as the user message](21-chat-enter-on-the-card-posts-the-prompt-as-the-user-message.png)

**22 · Chat: after the answer a new card appears below; the old one steps aside**

![Chat: after the answer a new card appears below; the old one steps aside](22-chat-after-the-answer-a-new-card-appears-below-the-old-one-steps-aside.png)
