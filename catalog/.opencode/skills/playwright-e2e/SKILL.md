---
name: playwright-e2e
description: Use when verifying a large frontend feature through the UI with Playwright against a local test environment only.
compatibility: OpenCode project-local
---

# Local Playwright E2E

Use the configured Playwright MCP only for local URLs. First confirm the URL is localhost/127.0.0.1 and inspect the rendered page before acting. Capture console errors and meaningful assertions. Never use production/staging, real user credentials, destructive actions, or real external services. If Playwright is unavailable, report that and do not install globally.

Official reference: https://playwright.dev/docs/intro
