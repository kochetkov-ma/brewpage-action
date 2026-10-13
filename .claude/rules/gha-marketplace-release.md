---
paths:
  - "action.yml"
  - ".github/workflows/release.yml"
---

# Marketplace Release — Automated

Tag vX.Y.Z → CI builds dist/ + creates Release + auto-moves v1. Marketplace: listed since v1.1.2; publishing a Release there = manual owner step (Publishing #2-4).

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
| 2 | Marketplace publish = checkbox "Publish this Action to the GitHub Marketplace" on the Release edit page; only a signed-in browser can tick it → owner step, never CI or an agent. MKT ToS accepted with v1.1.2 |
| 3 | GitHub validates action.yml of the Release's tag, not of main: name, description under 125 characters, branding (icon+color). Validation fails → fix action.yml, cut a new tag |
| 4 | After each Release: open the listing URL, confirm it shows the new tag; missing → owner ticks the checkbox (#2) |

## Release Metadata

| Item | Value |
|------|-------|
| Notes | Summary of changes |
| URL | https://github.com/marketplace/actions/publish-to-brewpage (Releases: https://github.com/kochetkov-ma/brewpage-action/releases) |
| Branding | icon: upload-cloud, color: purple |

## Commands

```bash
# ANNOTATED tag. `git push --follow-tags` skips lightweight tags -> release.yml never fires.
git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main && git push origin vX.Y.Z
```
