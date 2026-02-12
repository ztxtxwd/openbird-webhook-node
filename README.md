# openbird-webhook-node

Receive [OpenBird](../../) webhook events in Node.js. Zero dependencies.

## Install

```bash
npm install openbird-webhook-node
```

## Quick Start

```js
import { createServer } from 'openbird-webhook-node'

createServer({
  port: 3000,
  onMessage(event) {
    console.log(event.data.sender.id, event.data.content.text)
  },
})
```

That's it. An HTTP server is now listening on port 3000, receiving events from OpenBird and calling your callback.

## Usage

### Option callbacks

Pass `onMessage` (fires on `im.message.*` events) or `onEvent` (fires on all events) directly:

```js
createServer({
  port: 3000,
  onMessage(event) {
    // Only chat messages
  },
  onEvent(event) {
    // Everything, including system events
  },
})
```

### `.on()` with pattern matching

For fine-grained control, use `.on(pattern, handler)`:

```js
const receiver = createServer()

receiver.on('im.message.receive_v1', (event) => {
  // Exact match
})

receiver.on('im.message.*', (event) => {
  // Wildcard — matches any im.message.xxx
})

receiver.on('system.*', (event) => {
  // All system events
})

receiver.on('*', (event) => {
  // Catch-all
})

await receiver.listen(3000)
```

`.on()` is chainable:

```js
createServer()
  .on('im.message.*', handleMessage)
  .on('system.*', handleSystem)
  .listen(3000)
```

### Embed into an existing server

Use `.middleware` as a standard `(req, res)` handler:

```js
import http from 'node:http'
import { createServer } from 'openbird-webhook-node'

const receiver = createServer({ onMessage(event) { /* ... */ } })

const server = http.createServer((req, res) => {
  if (req.url === '/webhook') {
    return receiver.middleware(req, res)
  }
  res.writeHead(404).end()
})

server.listen(3000)
```

Works with Express too:

```js
app.post('/webhook', (req, res) => receiver.middleware(req, res))
```

## API

### `createServer(options?)`

Returns `{ listen, close, middleware, on }`.

**Options:**

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | — | If set, auto-starts the server on this port |
| `host` | `string` | `'0.0.0.0'` | Listen host |
| `path` | `string` | `'/'` | URL path to accept webhooks on |
| `onEvent` | `function` | — | Called for every event |
| `onMessage` | `function` | — | Called for `im.message.*` events |

### `.on(pattern, handler)`

Register a handler for events matching `pattern`. Returns `this` for chaining.

**Pattern syntax:**

| Pattern | Matches |
|---|---|
| `'im.message.receive_v1'` | Exact match |
| `'im.message.*'` | Any type starting with `im.message.` |
| `'*'` | All events |

### `.listen(port?, host?)`

Start the HTTP server. Returns `Promise<http.Server>`.

### `.close()`

Stop the HTTP server. Returns `Promise<void>`.

### `.middleware(req, res)`

Raw HTTP handler. Use this to embed into your own server.

## Event Structure

Events are JSON objects posted by OpenBird:

```json
{
  "type": "im.message.receive_v1",
  "event_id": "evt_7604769001905884091",
  "timestamp": 1739347200000,
  "data": {
    "id": "7604769001905884091",
    "conversation": {
      "id": "7599271773103737795",
      "type": "group"
    },
    "sender": {
      "id": "7128839302827827201",
      "type": "user"
    },
    "content": {
      "type": "text",
      "text": "hello"
    },
    "thread_id": null
  }
}
```

### Event Types

| Type | Description |
|---|---|
| `im.message.receive_v1` | New chat message |
| `system.event.unknown` | Unrecognized push event |

## License

MIT
