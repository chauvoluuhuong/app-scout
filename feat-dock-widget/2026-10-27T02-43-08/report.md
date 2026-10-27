# E2E run

19 of 19 steps passed · branch `feat/dock-widget` @ `3777a44` · 2026-10-27T02:43:08.254Z

| # | Step | Result |
|---|---|---|
| 01 | Map opens from the link the tool returns | ✅ show_map ends with "Map: http://127.0.0.1:4781/?s=e2e-meeting-notes&t=…" |
| 02 | Toolbar icons sit on the text line | ✅ 6 buttons, every icon within 0.0px of centre |
| 03 | First-run tour shows how to read the map | ✅  |
| 04 | Legend folds into the help icon after the tour | ✅ one encoding: size = est. revenue, brightness = users |
| 05 | Every segment name is drawn | ✅ 6 of 6 segment names on screen |
| 06 | Lenses sit in the bar under the map | ✅ All · 46 \| Leaders · 1 \| Money gaps · 0 \| Premium niche · 0 \| Unknown revenue · 30 · on: Unknown revenue · 30 |
| 07 | Apps found opens a sortable table | ✅ sorted by revenue, first row: Notability: AI Notes & Planner |
| 08 | Selecting a row shows the app on the map | ✅ Notability: AI Notes & Planner |
| 09 | Ask Claude: the monitor hands the question to Claude | ✅ monitor notification: [App Scout map question q-9ccacf · session e2e-meeting-notes] "Why do users complain?" Loo… |
| 10 | A second copy of the map opens alongside | ✅ same link, same session, both pages live |
| 11 | Claude's answer reaches both pages | ✅ the asking page shows the answer in place; the second page announced it |
| 12 | Without the monitor, the next message carries the question | ✅ page said "Saved. Go back to Claude and send any message (like “ok”): A…"; the hook attached the question |
| 13 | A plan from Claude shows on every open page | ✅ pushed to both pages; the plan link opens it too |
| 14 | While a scout runs, Scout and its controls are off | ✅ Scout and the app count read "Scouting…" and are off while crawling; back on for a finished session |
| 15 | Export downloads the report | ✅ attachment; filename="e2e-meeting-notes-report.md" |
| 16 | Chat: the App Scout card appears under show_map | ✅ App Scout ai meeting notes (US) Open map Ask Claude on the map, and the prompt appears here to send. |
| 17 | Chat: a question from the map waits on the card with Copy and Send | ✅ page: "Prompt ready in the chat: press Send on the App Scout card." |
| 18 | Chat: Enter on the card posts the prompt as the user message | ✅ [App Scout map question q-138b6b · session e2e-meeting-notes] "Where is the money?"
Looking at: ai m… |
| 19 | Chat: after the answer a new card appears below; the old one steps aside | ✅ old card: "moved to the newest card below"; the map shows the answer |

**01 · Map opens from the link the tool returns**

![Map opens from the link the tool returns](01-map-opens-from-the-link-the-tool-returns.png)

**02 · Toolbar icons sit on the text line**

![Toolbar icons sit on the text line](02-toolbar-icons-sit-on-the-text-line.png)

**03 · First-run tour shows how to read the map**

![First-run tour shows how to read the map](03-first-run-tour-shows-how-to-read-the-map.png)

**04 · Legend folds into the help icon after the tour**

![Legend folds into the help icon after the tour](04-legend-folds-into-the-help-icon-after-the-tour.png)

**05 · Every segment name is drawn**

![Every segment name is drawn](05-every-segment-name-is-drawn.png)

**06 · Lenses sit in the bar under the map**

![Lenses sit in the bar under the map](06-lenses-sit-in-the-bar-under-the-map.png)

**07 · Apps found opens a sortable table**

![Apps found opens a sortable table](07-apps-found-opens-a-sortable-table.png)

**08 · Selecting a row shows the app on the map**

![Selecting a row shows the app on the map](08-selecting-a-row-shows-the-app-on-the-map.png)

**09 · Ask Claude: the monitor hands the question to Claude**

![Ask Claude: the monitor hands the question to Claude](09-ask-claude-the-monitor-hands-the-question-to-claude.png)

**10 · A second copy of the map opens alongside**

![A second copy of the map opens alongside](10-a-second-copy-of-the-map-opens-alongside.png)

**11 · Claude's answer reaches both pages**

![Claude's answer reaches both pages](11-claude-s-answer-reaches-both-pages.png)

**12 · Without the monitor, the next message carries the question**

![Without the monitor, the next message carries the question](12-without-the-monitor-the-next-message-carries-the-question.png)

**13 · A plan from Claude shows on every open page**

![A plan from Claude shows on every open page](13-a-plan-from-claude-shows-on-every-open-page.png)

**14 · While a scout runs, Scout and its controls are off**

![While a scout runs, Scout and its controls are off](14-while-a-scout-runs-scout-and-its-controls-are-off.png)

**15 · Export downloads the report**

![Export downloads the report](15-export-downloads-the-report.png)

**16 · Chat: the App Scout card appears under show_map**

![Chat: the App Scout card appears under show_map](16-chat-the-app-scout-card-appears-under-show-map.png)

**17 · Chat: a question from the map waits on the card with Copy and Send**

![Chat: a question from the map waits on the card with Copy and Send](17-chat-a-question-from-the-map-waits-on-the-card-with-copy-and-send.png)

**18 · Chat: Enter on the card posts the prompt as the user message**

![Chat: Enter on the card posts the prompt as the user message](18-chat-enter-on-the-card-posts-the-prompt-as-the-user-message.png)

**19 · Chat: after the answer a new card appears below; the old one steps aside**

![Chat: after the answer a new card appears below; the old one steps aside](19-chat-after-the-answer-a-new-card-appears-below-the-old-one-steps-aside.png)
