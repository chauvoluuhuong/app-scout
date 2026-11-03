# Docs map
Read in this order: AGENTS.md → this file → the feature you are touching → its plan and failures.

| Folder | What's inside |
|---|---|
| plans/ | agreed approaches, newest first |
| features/ | what exists and how it works |
| harness/ | how to run the tests and the e2e |
| infrastructure/ | what runs where |
| failures/ | what broke, why, how to avoid it |
| integrations/, releases/, learnings/, ideas/ | created when the first entry is needed (templates: build-app-workflow `references/docs-structure.md`) |

## Features
- [Live map](features/live-map.md) — the local server, the browser map and the chat card

## Plans
- [2026-10-29 Adopt build-app-workflow](plans/2026-10-29-adopt-build-app-workflow.md) — done

## Failures
- [2026-11-03 Card without tool calls](failures/2026-11-03-card-without-ipc.md) — the card gave up in Claude Code desktop · issue #11

## Integrations
The public store pages and APIs App Scout reads are listed in the README's "What App Scout runs, sends and stores".
