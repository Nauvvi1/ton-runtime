# Demo flow

## Scenario 1: Successful payment
- click "Run success flow"
- action is created
- transaction submitted
- confirmation polled
- action completes

## Scenario 2: Fault injection
- click "Run fault flow"
- first attempt fails on purpose
- retry is scheduled
- second attempt succeeds
- timeline shows both attempts

## Scenario 3: Idempotency
- click "Run idempotent flow"
- same key is used twice
- second request reuses the first action

## Scenario 4: Recovery
- start a long-running confirmation flow
- terminate the process
- restart demo app
- click "Resume pending"
- action resumes and completes
