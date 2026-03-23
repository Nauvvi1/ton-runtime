# Architecture

## Layers

1. Public API
   - `TonRuntime`
   - `execute()`
   - `resumePending()`

2. Execution engine
   - state transitions
   - retries
   - confirmation polling
   - crash-safe recovery

3. Persistence
   - actions
   - attempts
   - timeline
   - locks

4. TON integration
   - adapter interface
   - MCP implementation
   - mock implementation

5. Observability
   - logger
   - runtime events
   - metrics

## State machine

Action statuses:
- `pending`
- `running`
- `retry_scheduled`
- `waiting_confirmation`
- `completed`
- `failed`
- `cancelled`

## Idempotency model

For repeated `idempotencyKey`:
- completed action -> return stored result
- active action -> return current state
- failed action -> return failed record unless the caller creates a new key

## Recovery model

`resumePending()` scans unfinished records and replays them through the original registry-backed handler or waits for transaction confirmation if the action is already in confirmation state.
