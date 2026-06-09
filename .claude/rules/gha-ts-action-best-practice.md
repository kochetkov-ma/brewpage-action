---
paths:
  - "src/**/*.ts"
  - "action.yml"
  - ".github/workflows/*.yml"
  - "package.json"
---

# TypeScript Action Best Practices

Node24 action (runs.using: node24, main: dist/index.js) with REST API publish.

## Implementation

| # | Practice | Why |
|---|----------|-----|
| 1 | Use TS/JS for testable logic | Composite (bash) = simple validation only |
| 2 | Commit dist/index.js | CI enforces check-dist sync |
| 3 | Use native fetch/FormData/Blob (Node 24) | Zero HTTP deps, @actions/core only |
| 4 | core.setSecret(token) before setOutput/log/summary | Retroactive masking impossible |
| 5 | Write job summary via core.summary | Structured output in UI |

## Inputs/Outputs

| # | Rule |
|---|------|
| 1 | Keep action.yml, README.md, CLAUDE.md in sync. Update all three together |
| 2 | Each input: req/default/description. Each output: core.setOutput(key, value) |
| 3 | Validate owner-token + update-id pair. One without other = fail fast |

## Versions

| # | Artifact | Bad | Good |
|---|----------|-----|------|
| 1 | Workflow uses: | @latest, @v6, @main | @v6.4.0 exact |
| 2 | package.json | ^3.0.0, ~2.1.0 | 3.0.1 exact |

## Marketplace

| # | Rule |
|---|------|
| 1 | action.yml: name, description, branding (icon+color) — all 3 required |
| 2 | Release: tag vX.Y.Z → auto-move v1 for @v1 consumers |

## Hard Rules

!=regress to composite | !=skip dist/ | !=external HTTP lib | !=mask after output written
