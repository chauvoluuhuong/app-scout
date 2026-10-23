---
name: plan
description: Turn a product idea into an App Scout research plan the user can edit on the map, then run a focused scout on the segments they keep. Use it when someone describes an app they want to build and wants to know who to target, which stores to launch in, or who they would compete with, including "ý tưởng app này có ai làm chưa" or "nên bán trên marketplace nào".
---

# Plan research from an idea

1. Restate the idea in one line, then call `plan_research` with:
   - `customers`: 2–4 candidate customer types (who pays, not only who uses).
   - `forms`: the product forms that fit, such as mobile app, Chrome extension, web app, Workspace add-on.
   - `segments`: 2–5 segments worth scouting, each with 1–4 search `phrases` a buyer would type into a store. Include the direct competitors' segment and one adjacent segment.
   - `apps`: 100 unless the user asked for another number.
2. Tell the user in one line to adjust the chips on the map and press **Start focused scout**.
3. When the scout runs, follow the `scout` skill from "Wait" onwards: `scout_status`, `list_apps`, `save_grouping`, then a three-line verdict: target customer, where to launch, the opening to attack.
