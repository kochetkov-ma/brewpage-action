---
paths:
  - "action.yml"
  - ".github/workflows/*.yml"
  - "package.json"
---

# Version Pinning — Strict Semver

Exact pins everywhere (no @latest, ^, ~). Floating versions break reproducibility.

## Rules

| # | Artifact | Bad | Good |
|---|----------|-----|------|
| 1 | Workflow uses: | @latest, @v6, @main | @v6.4.0 exact |
| 2 | package.json | ^3.0.0, ~2.1.0 | 3.0.1 exact |
| 3 | Docker FROM | :latest, :edge | :X.Y.Z exact |

## Current Pins

| Dependency | Version | Location |
|------------|---------|----------|
| actions/setup-node | v6.4.0 | .github/workflows/*.yml |
| actions/checkout | v6.0.3 | .github/workflows/*.yml |
| @actions/core | 3.0.1 | package.json |

## Before Pinning

1. Fetch latest from registry
2. Verify published release
3. Test if critical
4. Update all refs together

### Lookups

```bash
# GitHub Actions: curl -s https://api.github.com/repos/actions/setup-node/releases/latest | jq -r .tag_name
# npm: curl -s https://registry.npmjs.org/@actions%2Fcore/latest | jq -r .version
```

## When Bumping

1. Check registry
2. Update package.json + workflows together
3. Test if breaking
4. Record reason in commit message

## Hard Rules

!=@latest | !=@main | !=^/~ in package.json | !=stale pins (security alerts bump immediately)
