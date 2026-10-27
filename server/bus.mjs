// In-process event bus: the crawl publishes, the WebSocket server and scout_status listen.
const subs = new Set();

export function publish(event) {
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      // a broken listener must never stop the crawl
    }
  }
}

export function subscribe(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

/** Resolve on the next event for `sessionId` (any session when null) matching `pred`, or after `ms`. */
export function waitFor(sessionId, pred, ms) {
  return new Promise((resolve) => {
    const off = subscribe((e) => {
      if ((sessionId == null || e.session === sessionId) && pred(e)) {
        clearTimeout(t);
        off();
        resolve(e);
      }
    });
    const t = setTimeout(() => {
      off();
      resolve(null);
    }, ms);
  });
}
