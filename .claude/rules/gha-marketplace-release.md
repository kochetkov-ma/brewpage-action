---
paths:
  - "action.yml"
  - ".github/workflows/release.yml"
---

# Marketplace Release — Automated

Tag vX.Y.Z → CI builds dist/ + creates Release + auto-moves v1 + Marketplace publish.

## Tagging

| # | Rule | Why |
|---|------|-----|
| 1 | Use unprefixed semver vX.Y.Z | Keeps @v1 clean for Marketplace |
| 2 | Push vX.Y.Z → CI: build dist/, Release, auto-move v1 | @v1 consumers pick up automatically |
| 3 | v1 tag always = latest v1.* | Marketplace convention |

## Publishing

| # | Step |
|---|------|
| 1 | Push tag vX.Y.Z → CI validates, builds, creates Release, moves v1 |
| 2 | First release: owner accepts MKT ToS once. Then auto-updates |
| 3 | Verify: action.yml has name, description, branding (icon+color) |

## Release Metadata

| Item | Value |
|------|-------|
| Notes | Summary of changes |
| URL | https://github.com/marketplace/actions/publish-to-brewpage |
| Branding | icon: upload-cloud, color: purple |

## Commands

```bash
git tag vX.Y.Z && git push --follow-tags
```
