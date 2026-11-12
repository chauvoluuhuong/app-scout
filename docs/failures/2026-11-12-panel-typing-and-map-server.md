# Typing lost on live updates; the map server trusted its page too much
Issue: [#16](https://github.com/chauvoluuhuong/app-scout/issues/16) · affected up to app-scout--v0.3.2 · fixed on `fix/bridge-rules`

## What broke
- The side panel is rebuilt whenever the data changes. Text in "Plan from idea" was emptied and the cursor lost each time apps arrived during a crawl.
- Found by checking the map against the browser-ui-bridge rules: the server answered any web origin, stored page-supplied context and view state without a limit (the context is shown to Claude), wrote the token file readable by other users, and the page opened store links without checking the scheme.

## Why
- `panel()` sets `innerHTML`; only the question text was kept in a variable, nothing kept the focus, the cursor or the idea text.
- The token was treated as the only check. The page's own limits were the only limits.

## How to avoid it
- Anything the user can type into must survive a redraw: keep its text in a variable and restore focus and cursor in `panel()`. E2E step "Typing in the panel survives live updates".
- The server checks for itself: `Host`, `Origin`, token, and `bounded()` in `server/actions.mjs` for everything a page sends. Unit test "the map server answers only its own page…".
- Files holding the token are created with mode 600.
- Only `http(s)` links from store data are shown or opened (`webUrl()` in `ui/app.html`).
