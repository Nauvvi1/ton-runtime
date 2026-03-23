# API

## `TonRuntime`

### Constructor

```ts
new TonRuntime(config: TonRuntimeConfig)
```

### Methods

#### `execute<T>(actionName, handler, options?)`

Runs a persisted action.

#### `resumePending()`

Resumes unfinished actions.

#### `getAction(actionId)`

Returns one action.

#### `getActionByIdempotencyKey(key)`

Returns action by idempotency key.

#### `listActions(filter?)`

Lists actions.

#### `listTimeline(actionId)`

Lists timeline for one action.

#### `registerAction(name, handler)`

Registers a named handler for recovery flows.

#### `destroy()`

Shuts down the runtime.

## Storage interface

Implementations must support:
- action CRUD
- attempt CRUD
- timeline append/list
- action lock acquire/release
