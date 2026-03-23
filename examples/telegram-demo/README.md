# Telegram demo idea

For the hackathon presentation you can wire `ton-runtime` to a small Telegram bot:
- `/pay` -> starts `execute()`
- `/fault` -> starts injected failure flow
- `/resume` -> calls `resumePending()`
- `/status <actionId>` -> shows timeline

A minimal implementation can use `grammy`, but it is intentionally not bundled here to keep the scaffold lightweight.
