---
name: postgres-h2-testing
description: Use when changing Flyway migrations, PostgreSQL persistence, H2-compatible integration tests, transactions, indexes, or schema contracts.
compatibility: OpenCode project-local
---

# PostgreSQL and H2 tests

Treat Flyway SQL and Java mappings as a contract. Check PostgreSQL behavior first, then H2 compatibility in the configured test profile. Prefer test isolation and explicit assertions. Never connect to production or staging and never copy connection strings or credentials into prompts or files.

Official references: https://www.postgresql.org/docs/current/ and https://h2database.com/html/main.html
