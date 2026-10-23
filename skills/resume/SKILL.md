---
name: resume
description: Continue an earlier App Scout research session where the user left off, or export one. Use it when someone says continue my research, open my last scout, show my sessions, or export my research.
---

# Resume a research session

1. Call `list_sessions`. If the user named a session, pick it; otherwise use the newest and say which one in one line.
2. Call `show_map` with its id. The map opens at the camera, focus, lens and size setting the user left.
3. Call `get_view_state` and answer any questions from the map that are still open (`answer_question`).
4. To export, call `export_session` with `format` md (report), csv (apps table) or json (everything), and give the user the file path.
