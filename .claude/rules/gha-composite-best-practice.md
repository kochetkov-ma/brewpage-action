---
paths:
  - "action.yml"
  - ".github/workflows/*.yml"
---

# REST Publish Best Practices

Direct REST API (POST /api/html, /api/files, /api/sites) via native fetch, no CLI.

## API Calls

| # | Practice | Why |
|---|----------|-----|
| 1 | Use Node 24 fetch + FormData + Blob | Zero deps, built-in |
| 2 | Reference SPEC (brewpage-openapi) for contract | SPEC = single source |
| 3 | POST /api/html for HTML/markdown | Create resource |
| 4 | POST /api/files for binary | File upload |
| 5 | POST /api/sites for multi-file (Playwright, static) | Batch upload |
| 6 | PUT /api/sites/{ns}/{id} to republish | Update with owner-token + id |

## Credential Masking

| # | Rule |
|---|------|
| 1 | core.setSecret(ownerToken) instant, BEFORE setOutput/log/summary | Retroactive masking impossible |
| 2 | Write owner-token output after masking | Masks subsequent logs only |

## Inputs/Outputs

| # | Rule |
|---|------|
| 1 | Keep action.yml, README.md, CLAUDE.md in sync |
| 2 | Validate owner-token + update-id pair. One without other = error |
| 3 | Outputs: url, owner-token (masked), id via core.setOutput() |

## Hard Rules

!=external publish lib | !=mask after output | !=skip pair validation | !=remove action.yml metadata
