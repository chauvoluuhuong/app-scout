# The card gave up when the host refused its tool calls
Issue: [#11](https://github.com/chauvoluuhuong/app-scout/issues/11) · affected app-scout--v0.3.0, v0.3.1 · fixed on `fix/card-without-ipc`

## What broke
In Claude Code desktop the App Scout card showed only "App Scout card could not start: IPC not available for MCP tool call" and no Open map button.

## Why
That host renders MCP Apps cards but rejects their `tools/call`. The card learned everything, the map link included, from its own `dock` tool calls, and stopped at the first rejection. The link was already in the tool result the host sends to every card (`ui/notifications/tool-result`), but the card ignored it.

## How to avoid it
- A card must work from the tool result alone; its own tool calls only add to it (Send, Copy, live updates).
- Test the card in a host that refuses tool calls: `scripts/host-harness.mjs` with `?noipc`, e2e step "a host that refuses the card's tool calls still gets Open map".
