[DICT: ACT=GitHub Action, BP=BrewPage, MKT=GitHub Marketplace, NS=namespace, OT=owner-token, REL=release, REPO=repository, SPEC=openapi/openapi.yaml in brewpage-openapi, WF=workflow]

# CLAUDE.md — brewpage-action

Agent scope: develop THIS REPO only — the "Publish to BP" ACT. Read before touching anything.

## 1. Purpose

Node24 TypeScript ACT (`runs.using: node24`, `main: dist/index.js` — committed bundle). NOT composite. Publishes CI artefacts (HTML reports, Playwright reports, generated docs, build outputs) to BP from inside a GH WF in one step. Exposes live URL + resource id + OT as job outputs. Works end-to-end via direct BP REST — no external CLI.

BP: proprietary HTML/KV/JSON/file hosting @ <https://brewpage.app>. This REPO ships only ACT glue — not the platform.

MKT listing: `Publish to BrewPage`. ACT ref: `kochetkov-ma/brewpage-action@v1`.

## 2. Cross-links

| What | Where |
|------|-------|
| API contract / src of truth | `kochetkov-ma/brewpage-openapi` — <https://github.com/kochetkov-ma/brewpage-openapi>, SPEC |
| Live platform / default API base | <https://brewpage.app> |

For any endpoint/param/header/response-field question: read SPEC. !=guess REST shape.

Endpoints the ACT actually calls (SPEC):
- `GET /api/owner-token` — mint an OT when caller supplies none.
- `POST /api/html` (create) / `PUT /api/html/{ns}/{id}` (update) — HTML/markdown. Params: `?ns=`, `?ttl=` (1..30d), `?format=html|markdown`, `?tags=`; headers `X-Password`, `X-Owner-Token`. Returns `HtmlUploadResponse`.
- `POST /api/files` — binary file upload (immutable; no PUT update).
- `POST /api/sites` (create) / `PUT /api/sites/{ns}/{id}` (update) — multi-file static sites (`kind: site`, e.g. Playwright report dir).

Backend (Spring/Kotlin), frontend, infra: NOT in any of these REPOs. SPEC is the only contract.

## 3. Architecture

`runs.using: node24`, `main: dist/index.js` — single committed bundle (Rollup). No Docker image, no composite bash steps. TS source in `src/`, runtime dep `@actions/core` only; HTTP via native `fetch`/`FormData`/`Blob` (Node 24 undici).

Flow: `inputs → mint-or-reuse OT (setSecret) → detect kind + resolve NS → route create (POST) | update (PUT) → outputs + job summary`

### Inputs (keep in lockstep with `action.yml`)

| Input | Req | Default | Description |
|-------|-----|---------|-------------|
| `path` | yes | — | File, dir, or `.zip` to publish. |
| `kind` | no | `auto` | `html` \| `markdown` \| `site` \| `file` \| `auto` |
| `namespace` | no | _(empty)_ | Empty derives per-repo slug from `github.repository`. `public` = gallery-listed + search-indexed. |
| `password` | no | _(empty)_ | Set → resource private (hidden from gallery). |
| `ttl-days` | no | `15` | TTL in days (1..30). |
| `tags` | no | _(empty)_ | Comma-separated tags. |
| `owner-token` | no | _(empty)_ | OT for the resource. Empty auto-mints one (surfaced in job summary). |
| `update-id` | no | _(empty)_ | Id of existing resource. With `owner-token` → updates via PUT. |
| `entry` | no | _(empty)_ | Site entry file override (default `index.html`). |
| `show-top-bar` | no | _(empty)_ | HTML only: toggle the BP toolbar. |
| `brewpage-url` | no | _(empty)_ | API base URL override. Empty = `https://brewpage.app`. |
| `fail-on-error` | no | `true` | When `false`, warn instead of failing the step on error. |

Update routing handled in TS (`src/main.ts`): `owner-token` + `update-id` present → PUT (update existing); else POST (create new).

### Outputs (keep in lockstep with `action.yml`)

| Output | Description |
|--------|-------------|
| `url` | Live URL of published resource. |
| `owner-url` | API/owner URL for managing the resource. |
| `owner-token` | OT for managing resource. Masked in logs. |
| `id` | Resource id. |
| `namespace` | NS the resource was published to. |
| `expires-at` | Expiry timestamp. |

### Hard rules — !=regress

1. **Mask OT before writing anywhere.** Call `core.setSecret(ownerToken)` BEFORE `core.setOutput('owner-token', ...)` and before any log/summary line that could contain it. Masking only redacts output emitted AFTER the `setSecret` call. OT = only credential that can manage/delete/republish a resource — leaking | losing it → resource unmanageable forever.
2. **Preserve NS `public` warning.** Default/`public` NS = listed in BP homepage gallery + search-indexed. Private resources require custom NS + password. Mirror stance from `brewpage-openapi` SPEC preamble; keep warning in `action.yml` + `README.md`.

`@actions/core` (`setOutput`) writes `$GITHUB_OUTPUT`. !=deprecated `::set-output::` WF cmd.

## 4. Architecture decision (RESOLVED)

Decided this session: ACT calls BP REST directly via native `fetch`/`FormData`/`Blob` (Node 24 undici) — zero HTTP deps, only runtime dep `@actions/core`. NO CLI. Artefact-kind routing (`html`|`markdown`|`site`|`file`) lives in TS (`src/`). Rationale: self-contained, works now, no external pkg to ship/version-pin.

Follow-up (different repo): record this decision in `brewpage-openapi/ECOSYSTEM-PLAN.md`.

## 5. Release / MKT flow

TAG-BASED (no release-please, no release PR). Flow:
- Bump VER in `package.json`. Create annotated tag: `git tag -a vX.Y.Z -m "..."` → `git push origin main && git push origin vX.Y.Z`. Unprefixed semver `vX.Y.Z` (e.g. `v1.0.0`). One pkg per REPO → no tag prefix → keeps `@v1` major ref clean for Actions MKT.
- Tag push fires `release.yml` → checkout, `npm ci`, lint, test, build, verify committed `dist/` == fresh rebuild (FAILS on drift), creates GitHub Release (`softprops/action-gh-release`), force-moves major tag `v1` to released commit so `@v1` consumers auto-update.
- Only the FIRST MKT listing needs a one-time manual ToS acceptance in the Release UI; subsequent releases publish automatically.
- Current RELs: `v0.1.0`, `v1.0.0`. `@v1` = stable consumer ref.
- MKT metadata REQ in `action.yml`: `name`, `description`, `branding` (cur: `icon: upload-cloud`, `color: purple`). All three mandatory — !=remove.

## 6. Ecosystem context

This REPO = one node in `kochetkov-ma/brewpage-*` multi-repo ecosystem, coordinated from `brewpage-openapi`. Strategy (locked 2026-05-20 in `brewpage-openapi/ECOSYSTEM-PLAN.md`): per-repo distribution, not monorepo.

Per-repo rationale (!=consolidate back to monorepo):
- One MKT/npm listing per REPO.
- SEO entity-graph: distinct REPOs → distinct discoverable entities → AI-search discovery.
- Per-repo stars/issues/topics.
- Clean `@v1` ACT semantics (monorepo `@v1` would point at root, not subfolder).

Mandatory cross-link rule: every REPO, README, MKT page must back-link to <https://brewpage.app> + <https://github.com/kochetkov-ma/brewpage-openapi>. Keep in `README.md`.

Sibling modules (each `kochetkov-ma/brewpage-*` REPO): `brewpage-cli`, `brewpage-client-ts`, `brewpage-client-python`, `brewpage-cli-python`, `homebrew-tap`, `brewpage-vscode`, `brewpage-chrome`, `brewpage-docs`, `brewpage-hf-space`, `brewpage-cookbook` (first prod consumer — dogfoods this ACT). MCP server (`brewpage-mcp`) ships from `brewpage-openapi` as explicit exception.

## 7. Drift + conventions

When inputs/outputs change, update ALL THREE in same change:
1. `action.yml` (real inputs/outputs)
2. `README.md` (inputs table, outputs table, usage examples)
3. `modules/action/README.md` in `brewpage-openapi` REPO (reference snapshot — lists planned inputs/outputs, !=drift). Follow-up (different repo): still needs syncing to the new contract.

**Version pinning — no exceptions.** Every `package.json` dep pinned exact (`X.Y.Z`, no `^`/`~`); every WF `uses:` pinned exact `vX.Y.Z`. Forbidden: `@latest`, floating major shorthand `@v4`, `@main`. Current WF pins: `actions/checkout@v6.0.3`, `actions/setup-node@v6.4.0`, `softprops/action-gh-release@v3.0.0`, `actions/upload-artifact@v7.0.1`. (Consumers may still ref ACT as `@v1` — published major-tag contract, separate from how THIS REPO pins its own deps.)

**Commit `dist/`.** The node24 ACT runs the committed bundle, not source. Every change to `src/` → `npm run build` → commit `dist/`. `check-dist.yml` CI rebuilds and fails on `git diff --exit-code dist/` drift, so a stale bundle never ships.

License: MIT (`LICENSE`).

## 8. Commands

```bash
# Install deps + full pipeline (lint + test + build):
npm ci && npm run all

# Rebuild the committed bundle after any src/ change:
npm run build

# check-dist: fail if committed dist/ drifts from a fresh rebuild (CI mirror):
npm run build && git diff --exit-code dist/

# Validate action.yml is well-formed YAML (CI does this):
npx --yes js-yaml action.yml > /dev/null

# Release (TAG-BASED): bump package.json VER, then:
git tag -a vX.Y.Z -m "..." && git push origin main && git push origin vX.Y.Z
# Tag push triggers release.yml (npm ci + lint + test + build + dist/ drift check
# + GitHub Release + force-move major tag v1).
```

CI (runs on `pull_request` + `workflow_dispatch` only — NO push trigger): `ci.yml` (npm ci + lint + test + build + js-yaml validation), `check-dist.yml` (rebuild + dist/ drift guard). `release.yml` fires on `v*` tag push (build + dist/ drift check + GitHub Release + major-tag move + MKT publish).

## Links

- BP — <https://brewpage.app>
- OpenAPI contract (src of truth) — <https://github.com/kochetkov-ma/brewpage-openapi>
