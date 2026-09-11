---
description: Plan or run a local-only browser smoke check through Playwright.
agent: build
---

Use Playwright only against explicitly local URLs. Confirm the frontend and any backend are local before acting. Do not authenticate against, mutate, or navigate to production/staging. If the local server is not running, describe the safe startup commands and wait for confirmation rather than starting a deployment stack. Request: $ARGUMENTS
