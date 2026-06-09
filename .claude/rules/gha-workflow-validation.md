---
paths:
  - "action.yml"
  - ".github/workflows/*.yml"
  - "src/**/*.ts"
---

# CI Checks & Validation

YAML syntax, metadata, lint, test, build, check-dist sync.

## CI Checks

| # | Check | Command | Pass |
|---|-------|---------|------|
| 1 | YAML syntax | npx --yes js-yaml action.yml > /dev/null | Parses cleanly |
| 2 | Metadata | grep -E "^(name\|description\|runs):" | All 3 keys present |
| 3 | Lint | npm run lint | No ESLint errors |
| 4 | Test | npm test | All TS tests pass |
| 5 | Build | npm run build | dist/index.js created |
| 6 | check-dist | git diff --exit-code dist/ | dist/ synced with src/ |

Runs on: push main, PRs.

## Release Checks

| Trigger | Output |
|---------|--------|
| Push v* tag | Auto: build + Release + v1 move |
| First release only | Owner accepts MKT ToS once |

## Smoke Test

Before release: add workflow_dispatch calling uses: ./ locally. Verify outputs, no credential leaks (core.setSecret working).

## Hard Rules

!=skip YAML/metadata/lint/tests | !=commit without check-dist passing | !=bypass CI on release
