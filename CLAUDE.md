[DICT: ACT=GitHub Action, BP=BrewPage, CLI=brewpage-cli npm pkg, MKT=GitHub Marketplace, NS=namespace, OT=owner-token, REL=release, REPO=repository, SPEC=openapi/openapi.yaml in brewpage-openapi, WF=workflow]

# CLAUDE.md — brewpage-action

Agent scope: develop THIS REPO only — the "Publish to BP" ACT. Read before touching anything.

## 1. Purpose

Single composite ACT (`action.yml` @ REPO root). Publishes CI artefacts (HTML reports, Playwright reports, generated docs, build outputs) to BP from inside a GH WF in one step. Exposes live URL + resource id + OT as job outputs.

BP: proprietary HTML/KV/JSON/file hosting @ <https://brewpage.app>. This REPO ships only ACT glue — not the platform.

MKT listing: `Publish to BrewPage`. ACT ref: `kochetkov-ma/brewpage-action@v1`.

> WARN: pre-release (v0), BLOCKED. Publish step calls `npx brewpage` (CLI), which is not yet published to npm. Composite scaffold, inputs, outputs, validation, OT masking are complete + MKT-ready, but ACT cannot publish end-to-end until CLI ships OR ACT switches to direct REST (sec 4). State this plainly — !=pretend ACT works end-to-end.

## 2. Cross-links

| What | Where |
|------|-------|
| API contract / src of truth | `kochetkov-ma/brewpage-openapi` — <https://github.com/kochetkov-ma/brewpage-openapi>, SPEC |
| Live platform / default API base | <https://brewpage.app> |
| CLI dep (pre-release) | `kochetkov-ma/brewpage-cli` — <https://github.com/kochetkov-ma/brewpage-cli> (npm pkg `brewpage`) |

For any endpoint/param/header/response-field question: read SPEC. !=guess REST shape.

Relevant publish ops in SPEC:
- `POST /api/html` (`create_1`) — HTML/markdown. Params: `?ns=`, `?ttl=` (1..30d), `?format=html|markdown`, `?tags=`; headers `X-Password`, `X-Owner-Token`. Returns `HtmlUploadResponse`.
- `POST /api/files` (`upload`) — binary file upload.
- `POST /api/sites` (`uploadSite`) — multi-file static sites (`kind: site`, e.g. Playwright report dir). `PUT /api/sites/{ns}/{id}` republishes.
- Reads/mgmt: `GET /{ns}/{id}` (`resolve`), `GET /api/stats`, DELETE ops, `republishSite`.

Backend (Spring/Kotlin), frontend, infra: NOT in any of these REPOs. SPEC is the only contract.

## 3. Architecture

`runs.using: composite` — no Docker image, no JS entrypoint; declarative metadata + bash steps.

Flow: `inputs → setup-node → validate update-token/update-id pair → publish step → outputs`

### Inputs (keep in lockstep with `action.yml`)

| Input | Req | Default | Description |
|-------|-----|---------|-------------|
| `path` | yes | — | File, dir, or zip to publish. |
| `kind` | no | `auto` | `html` \| `markdown` \| `site` \| `file` \| `auto` |
| `namespace` | no | `public` | Target NS. `public` = gallery-listed + search-indexed. |
| `password` | no | _(empty)_ | Set → resource marked private. |
| `ttl-days` | no | `15` | TTL in days (1..30). |
| `update-token` | no | _(empty)_ | OT of existing resource to update. Pair with `update-id`. |
| `update-id` | no | _(empty)_ | Id of existing resource to update. Pair with `update-token`. |
| `brewpage-url` | no | _(empty)_ | Override API base URL. Empty = `https://brewpage.app`. |
| `token` | no | _(empty)_ | Optional owner/publish token for authenticated publishing. |

`update-token` / `update-id` validated in dedicated bash step; fails fast with `::error::` if exactly one supplied.

### Outputs (keep in lockstep with `action.yml`)

| Output | Description |
|--------|-------------|
| `url` | Live URL of published resource. |
| `owner-token` | OT for managing resource. Masked in logs. |
| `id` | Resource id. |

Publish step builds `brewpage publish <path> --json ...`, captures stdout, parses `url`/`ownerToken`/`id` via `jq`.

### Hard rules — !=regress

1. **Mask OT before writing anywhere.** Emit `echo "::add-mask::$owner_token"` BEFORE writing `owner-token=...` to `$GITHUB_OUTPUT` and before any log line that could contain it. `::add-mask::` only redacts lines printed AFTER it. OT = only credential that can manage/delete/republish a resource — leaking | losing it → resource unmanageable forever.
2. **Preserve NS `public` warning.** Default NS `public` = listed in BP homepage gallery + search-indexed. Private resources require custom NS + password. Mirror stance from `brewpage-openapi` SPEC preamble; keep warning in `action.yml` + `README.md`.

Use `echo "name=value" >> $GITHUB_OUTPUT`. !=deprecated `::set-output::` WF cmd.

## 4. Open architecture decision (unresolved — !=bake in a side)

Publish step currently: `npx --yes brewpage@<pinned> publish ...`. CLI not on npm → ACT blocked. Two live options:

- **Option A — keep CLI dep.** Once CLI ships, pin to exact ver (`brewpage@X.Y.Z`, !=`@latest`); bump explicitly per ACT REL; record CLI ver in REL notes. Pro: one place owns publish logic. Con: ACT stays blocked until CLI ships + carries Node+npm install on every run.
- **Option B — call BP REST API directly** via `curl`+`jq`; ACT self-contained + immediately usable. Contract: SPEC (sec 2 for ops/params/headers). Pro: no external pkg, works now. Con: ACT re-implements artefact-kind routing (`html`|`file`|`site`) that CLI would centralise.

Decision NOT made. When resolved: update this section + record decision in `brewpage-openapi/ECOSYSTEM-PLAN.md`.

## 5. Release / MKT flow

- Tags: unprefixed semver `vX.Y.Z` (e.g. `v1.0.0`). One pkg per REPO → no tag prefix → keeps `@v1` major ref clean for Actions MKT.
- MKT publish: manual. No auto-publish. `.github/workflows/release.yml` fires on `v*` tags, prints reminder only. Owner drafts GH Release for tag → ticks "Publish this Action to the GitHub Marketplace" → confirms category+branding → publishes. 2FA may be REQ. !=auto-publish unverified ACT from CI.
- After each REL: move major tag `v1` to new commit so `@v1` consumers pick it up.
- `gh` CLI authed as `kochetkov-ma`; REPO is public.
- MKT metadata REQ in `action.yml`: `name`, `description`, `branding` (cur: `icon: upload-cloud`, `color: purple`). All three mandatory for MKT listing — !=remove.

## 6. Ecosystem context

This REPO = one node in `kochetkov-ma/brewpage-*` multi-repo ecosystem, coordinated from `brewpage-openapi`. Strategy (locked 2026-05-20 in `brewpage-openapi/ECOSYSTEM-PLAN.md`): per-repo distribution, not monorepo.

Per-repo rationale (!=consolidate back to monorepo):
- One MKT/npm listing per REPO.
- SEO entity-graph: distinct REPOs → distinct discoverable entities → AI-search discovery.
- Per-repo stars/issues/topics.
- Clean `@v1` ACT semantics (monorepo `@v1` would point at root, not subfolder).

Mandatory cross-link rule: every REPO, README, MKT page must back-link to <https://brewpage.app> + <https://github.com/kochetkov-ma/brewpage-openapi>. Keep in `README.md`.

Sibling modules (each `kochetkov-ma/brewpage-*` REPO): `brewpage-cli` (direct dep), `brewpage-client-ts`, `brewpage-client-python`, `brewpage-cli-python`, `homebrew-tap`, `brewpage-vscode`, `brewpage-chrome`, `brewpage-docs`, `brewpage-hf-space`, `brewpage-cookbook` (first prod consumer — dogfoods this ACT). MCP server (`brewpage-mcp`) ships from `brewpage-openapi` as explicit exception.

## 7. Drift + conventions

When inputs/outputs change, update ALL THREE in same change:
1. `action.yml` (real inputs/outputs)
2. `README.md` (inputs table, outputs table, usage examples)
3. `modules/action/README.md` in `brewpage-openapi` REPO (reference snapshot — lists planned inputs/outputs, !=drift)

**Version pinning — no exceptions.** Pin every `uses:` in this REPO's WFs + any CLI ver to exact `vX.Y.Z` / `X.Y.Z`. Forbidden: `@latest`, floating major shorthand `@v4`, `@main`. Current pins: `actions/setup-node@v6.4.0`, `actions/checkout@v6.0.3`, CLI as `brewpage@0.1.0` — keep this discipline when adding/bumping. (Consumers may still ref ACT as `@v1` — that is published major-tag contract, separate from how THIS REPO pins its own deps.)

License: MIT (`LICENSE`).

## 8. Commands

```bash
# Validate action.yml is well-formed YAML (CI does this):
npx --yes js-yaml action.yml > /dev/null

# Assert REQ MKT metadata present (CI mirror):
for key in name description runs; do grep -qE "^${key}:" action.yml || echo "MISSING: $key"; done

# Manual local smoke test (once CLI/REST path works):
# Add workflow_dispatch WF that does `uses: ./`; trigger from Actions tab. Do BEFORE tagging.

# Cut a REL (manual MKT publish follows in Release UI):
git tag vX.Y.Z && git push --follow-tags
# Move major tag:
git tag -f v1 && git push -f origin v1
```

CI: `.github/workflows/ci.yml` (YAML validation + metadata check on push/PR), `.github/workflows/release.yml` (tag-driven MKT reminder). No unit-test suite — validation = YAML parse + metadata assertion + manual `workflow_dispatch` smoke test before tagging.

## Links

- BP — <https://brewpage.app>
- OpenAPI contract (src of truth) — <https://github.com/kochetkov-ma/brewpage-openapi>
- CLI dep — <https://github.com/kochetkov-ma/brewpage-cli>
