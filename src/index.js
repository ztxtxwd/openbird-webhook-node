/**
 * openbird-webhooks — Receive and handle OpenBird webhook events
 *
 * Three usage modes:
 *
 *   1. Auto-listen (simplest)
 *      createServer({ port: 3000, onMessage(event) { ... } })
 *
 *   2. Manual listen
 *      const server = createServer({ onMessage(event) { ... } })
 *      server.listen(3000)
 *
 *   3. Middleware (embed into existing server)
 *      const { middleware } = createServer({ onMessage(event) { ... } })
 *      // use middleware(req, res) in your own http/express server
 */

import http from 'node:http';

/**
 * @typedef {Object} OpenBirdEvent
 * @property {string} type - Event type (e.g. 'im.message.receive_v1')
 * @property {string|null} event_id - Unique event ID
 * @property {number} timestamp - Unix timestamp (ms)
 * @property {Object} data - Event payload
 */

/**
 * @typedef {Object} ServerOptions
 * @property {number} [port] - If set, auto-listen on this port
 * @property {string} [host='0.0.0.0'] - Listen host
 * @property {string} [path='/'] - URL path to accept webhooks on
 * @property {function(OpenBirdEvent): void|Promise<void>} [onEvent] - Called for every event
 * @property {function(OpenBirdEvent): void|Promise<void>} [onMessage] - Called for im.message.* events
 */

/**
 * Create an OpenBird webhook receiver
 * @param {ServerOptions} [options={}]
 * @returns {{ listen: function, close: function, middleware: function, on: function }}
 */
export function createServer(options = {}) {
  const {
    port,
    host = '0.0.0.0',
    path: acceptPath = '/',
  } = options;

  // Event handlers: type pattern -> handler[]
  const handlers = new Map();
  // Catch-all handlers
  const catchAllHandlers = [];

  // Register options-based handlers
  if (options.onEvent) {
    catchAllHandlers.push(options.onEvent);
  }
  if (options.onMessage) {
    addHandler('im.message.*', options.onMessage);
  }

  function addHandler(pattern, handler) {
    if (!handlers.has(pattern)) {
      handlers.set(pattern, []);
    }
    handlers.get(pattern).push(handler);
  }

  function matchPattern(pattern, type) {
    if (pattern === '*') return true;
    if (pattern === type) return true;
    // Wildcard: 'im.message.*' matches 'im.message.receive_v1'
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return type.startsWith(prefix + '.');
    }
    return false;
  }

  async function dispatch(event) {
    const type = event.type || '';

    // Catch-all handlers
    for (const handler of catchAllHandlers) {
      try {
        await handler(event);
      } catch (err) {
        console.error('[openbird-webhooks] Handler error:', err);
      }
    }

    // Pattern-matched handlers
    for (const [pattern, patternHandlers] of handlers) {
      if (matchPattern(pattern, type)) {
        for (const handler of patternHandlers) {
          try {
            await handler(event);
          } catch (err) {
            console.error('[openbird-webhooks] Handler error:', err);
          }
        }
      }
    }
  }

  /**
   * HTTP request handler — can be used as middleware
   */
  function middleware(req, res) {
    // Only accept POST on the configured path
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname !== acceptPath) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      let event;
      try {
        event = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      // Respond 200 immediately, then dispatch
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));

      await dispatch(event);
    });
  }

  // Create Node.js HTTP server (lazy — only materialized on .listen())
  let httpServer = null;

  function getOrCreateServer() {
    if (!httpServer) {
      httpServer = http.createServer(middleware);
    }
    return httpServer;
  }

  function listen(listenPort, listenHost) {
    const p = listenPort ?? port;
    const h = listenHost ?? host;
    if (p === undefined || p === null) {
      throw new Error('Port is required. Pass it to createServer({ port }) or .listen(port).');
    }
    const server = getOrCreateServer();
    return new Promise((resolve) => {
      server.listen(p, h, () => {
        const addr = server.address();
        console.log(`[openbird-webhooks] Listening on ${addr.address}:${addr.port}${acceptPath}`);
        resolve(server);
      });
    });
  }

  function close() {
    if (httpServer) {
      return new Promise((resolve) => httpServer.close(resolve));
    }
  }

  /**
   * Register a handler for a specific event type pattern
   * @param {string} pattern - Event type or pattern (e.g. 'im.message.*', '*')
   * @param {function(OpenBirdEvent): void|Promise<void>} handler
   */
  function on(pattern, handler) {
    if (pattern === '*') {
      catchAllHandlers.push(handler);
    } else {
      addHandler(pattern, handler);
    }
    return api; // chainable
  }

  const api = { listen, close, middleware, on };

  // Auto-listen if port is provided in options
  if (port) {
    listen();
  }

  return api;
}
