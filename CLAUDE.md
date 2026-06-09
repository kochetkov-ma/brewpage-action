# CLAUDE.md

This file orients a Claude Code agent whose ONLY job is developing THIS repo: the
**Publish to BrewPage** GitHub Action. Read it before touching anything here.

## 1. Repository purpose

This repo is a single **composite GitHub Action** (`action.yml` lives at the repo
root). It publishes CI artefacts -- HTML reports, Playwright reports, generated
docs, build outputs -- to BrewPage from inside a GitHub workflow, in one step, and
exposes the resulting live URL (plus resource id and owner token) as job outputs.

BrewPage itself is a proprietary HTML / KV / JSON / file hosting platform at
<https://brewpage.app>. This repo only ships the GitHub Action glue. It does NOT
contain the platform.

Marketplace listing name: `Publish to BrewPage`. Action ref:
`kochetkov-ma/brewpage-action@v1`.

> **Status: pre-release (v0), BLOCKED.** The publish step shells out to
> `npx brewpage`, the `brewpage-cli` npm package, which is **not yet published to
> npm**. The composite scaffold, inputs, outputs, validation, and owner-token
> masking are complete and Marketplace-ready, but the action cannot actually
> publish until that CLI ships OR the action is switched to call the REST API
> directly (see section 4). Say this plainly -- do not pretend the action works
> end-to-end yet.

## 2. Where the platform and contract live (cross-links)

This repo is intentionally thin. The authority lives elsewhere:

| What | Where |
|------|-------|
| **API contract / source of truth** | `kochetkov-ma/brewpage-openapi` -- <https://github.com/kochetkov-ma/brewpage-openapi>, spec file `openapi/openapi.yaml` |
| **Live platform / default API base URL** | <https://brewpage.app> |
| **CLI dependency (pre-release)** | `kochetkov-ma/brewpage-cli` -- <https://github.com/kochetkov-ma/brewpage-cli> (npm package `brewpage`) |

**For any endpoint, query parameter, header, or response-field question: READ THE
SPEC in `brewpage-openapi/openapi/openapi.yaml`. Do not guess the REST shape.**
Relevant publish operations there:

- `POST /api/html` (`operationId: create_1`) -- HTML / markdown pages. Params:
  `?ns=`, `?ttl=` (1..30 days), `?format=html|markdown`, `?tags=`; headers
  `X-Password`, `X-Owner-Token`. Returns `HtmlUploadResponse`.
- `POST /api/files` (`operationId: upload`) -- binary file upload.
- `POST /api/sites` (`operationId: uploadSite`) -- multi-file static sites (the
  `kind: site` case, e.g. a Playwright report directory). `PUT /api/sites/{ns}/{id}`
  republishes.
- Reads/management: `GET /{ns}/{id}` (`resolve`), `GET /api/stats`, the
  `DELETE` operations, and `republishSite`.

The backend (Spring/Kotlin), frontend, and infra are NOT in any of these repos.
The OpenAPI spec is the only contract you get.

## 3. Architecture of the action

It is a `runs.using: composite` action. There is no Docker image and no JS
runtime entrypoint -- just declarative metadata plus bash steps. Flow:

```
inputs  -->  setup-node  -->  validate update-token/update-id pair  -->  publish step  -->  outputs
```

### Inputs (from `action.yml`, keep this table in lockstep with the file)

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | yes | -- | File, directory, or zip to publish. |
| `kind` | no | `auto` | `html` \| `markdown` \| `site` \| `file` \| `auto`. |
| `namespace` | no | `public` | Target namespace. `public` is gallery-listed and search-indexed. |
| `password` | no | _(empty)_ | When set, the resource is marked private. |
| `ttl-days` | no | `15` | Time to live in days (1..30). |
| `update-token` | no | _(empty)_ | Owner token of an existing resource to update. Pair with `update-id`. |
| `update-id` | no | _(empty)_ | Id of an existing resource to update. Pair with `update-token`. |
| `brewpage-url` | no | _(empty)_ | Override the API base URL. Empty = `https://brewpage.app`. |
| `token` | no | _(empty)_ | Optional owner/publish token for authenticated publishing. |

The `update-token` / `update-id` pair is validated in a dedicated bash step that
fails fast with `::error::` if exactly one of the two is supplied.

### Outputs (from `action.yml`)

| Output | Description |
|--------|-------------|
| `url` | Live URL of the published resource. |
| `owner-token` | Owner token for managing the resource. Masked in logs. |
| `id` | Resource id. |

The publish step builds a `brewpage publish <path> --json ...` argument array,
captures stdout, and parses `url` / `ownerToken` / `id` with `jq`.

### Two hard rules -- do not regress these

1. **Mask the owner token BEFORE writing it anywhere.** The publish step emits
   `echo "::add-mask::$owner_token"` to stdout BEFORE writing `owner-token=...`
   to `$GITHUB_OUTPUT` and before any log line that could contain it. Ordering
   matters: `::add-mask::` only redacts lines printed AFTER it. The owner token
   is the only credential that can manage / delete / republish a resource --
   leaking or losing it makes the resource unmanageable forever.
2. **Preserve the `namespace: public` warning.** Default namespace `public` is
   listed in the BrewPage homepage gallery and is search-indexed. Anyone setting
   a private resource must use a custom namespace and/or a password. Mirror the
   stance taken in the `brewpage-openapi` spec preamble -- keep this warning in
   `action.yml` and `README.md`; downstream users and LLMs read it as guidance.

Use `echo "name=value" >> $GITHUB_OUTPUT` for outputs. Never use the deprecated
`::set-output::` workflow command.

## 4. Open architecture decision (unresolved -- do not bake in a side)

The publish step currently shells out to `npx --yes brewpage@<pinned> publish ...`.
Because `brewpage-cli` is not on npm yet, the action is blocked. Two live options:

- **Option A -- keep the CLI dependency.** Once `brewpage-cli` ships, pin the
  action to an exact CLI version (`brewpage@X.Y.Z`, never `@latest`) and bump it
  explicitly per action release; record the CLI version in the release notes.
  Pro: one place owns the publish logic (the CLI). Con: the action stays blocked
  until the CLI ships, and carries a Node + npm install on every run.
- **Option B -- call the BrewPage REST API directly** via `curl` + `jq`, making
  the action self-contained and immediately usable. The full contract for this
  lives in `brewpage-openapi/openapi/openapi.yaml` (see section 2 for the
  operations and their params/headers). Pro: no external package, works now.
  Con: the action re-implements artefact-kind routing (`html` vs `file` vs
  `site`) that the CLI would otherwise centralise.

**This choice is NOT made yet.** When you resolve it, update this section and
record the decision (the `brewpage-openapi` repo tracks ecosystem decisions in
`ECOSYSTEM-PLAN.md`).

## 5. Release / Marketplace flow

- Tags are **unprefixed semver**: `vX.Y.Z` (e.g. `v1.0.0`). This repo holds one
  package, so no tag prefix -- this keeps the `@v1` major ref clean for the
  Actions Marketplace.
- Marketplace publishing is **manual**. There is NO auto-publish. `.github/workflows/release.yml`
  fires on `v*` tags and only prints a reminder. The owner drafts a GitHub
  Release for the tag, ticks "Publish this Action to the GitHub Marketplace",
  confirms category + branding, and publishes. 2FA may be required on the account.
  Never attempt to auto-publish an unverified action from CI.
- After each release, **move the major tag** (`v1`) to the new commit so
  `@v1` consumers pick it up.
- `gh` CLI is authed as `kochetkov-ma`; this repo is public.
- Marketplace metadata required in `action.yml`: `name`, `description`, and
  `branding` (currently `icon: upload-cloud`, `color: purple`). All three are
  mandatory for a Marketplace listing -- do not remove them.

## 6. Ecosystem context and goals

This repo is ONE node in the `kochetkov-ma/brewpage-*` multi-repo ecosystem,
coordinated from `brewpage-openapi`. The ecosystem strategy (locked 2026-05-20 in
`brewpage-openapi/ECOSYSTEM-PLAN.md`) is **per-repo distribution, not a monorepo**.

Why per-repo matters (do not "consolidate" this back into a monorepo):

- One Marketplace / npm listing per repo.
- SEO entity-graph: distinct repos build distinct discoverable entities, which
  drives AI-search discovery.
- Per-repo stars / issues / topics.
- Clean `@v1` Action semantics (a monorepo `@v1` would point at repo root, not a
  subfolder).

**Mandatory cross-link rule.** Every repo, README, and Marketplace page must
back-link to <https://brewpage.app> (home) and to
<https://github.com/kochetkov-ma/brewpage-openapi> (contract source of truth).
Keep those links in `README.md`.

Sibling modules (each its own `kochetkov-ma/brewpage-*` repo): `brewpage-cli`
(`cli-node`, the direct dependency), `brewpage-client-ts`, `brewpage-client-python`,
`brewpage-cli-python`, `homebrew-tap`, `brewpage-vscode`, `brewpage-chrome`,
`brewpage-docs`, `brewpage-hf-space`, `brewpage-cookbook` (the first production
consumer -- it dogfoods this action to publish its site). They exist; your focus
is this action. The MCP server (`brewpage-mcp`) ships from `brewpage-openapi` as
an explicit exception.

## 7. Conventions and files that drift

When inputs or outputs change, update all three in the SAME change:

1. `action.yml` (the real inputs/outputs).
2. `README.md` here (inputs table, outputs table, usage examples).
3. The stub `modules/action/README.md` in the `brewpage-openapi` repo (the
   reference snapshot -- it lists planned inputs/outputs and must not drift).

**Version pinning is a hard rule (no exceptions).** Pin every `uses:` in this
repo's workflows and any CLI version to an exact `vX.Y.Z` / `X.Y.Z`. Forbidden:
`@latest`, the floating major shorthand `@v4`, and `@main`. The action currently
pins `actions/setup-node@v6.4.0`, `actions/checkout@v6.0.3`, and the CLI as
`brewpage@0.1.0` -- keep this discipline when adding or bumping anything.
(Consumers of the action may still reference it as `@v1` -- that is the published
major-tag contract, which is separate from how this repo pins its own deps.)

License: MIT (`LICENSE`).

## 8. Common commands

```bash
# Validate action.yml is well-formed YAML (this is what CI does):
npx --yes js-yaml action.yml > /dev/null

# Assert required Marketplace metadata is present (CI mirror):
for key in name description runs; do grep -qE "^${key}:" action.yml || echo "MISSING: $key"; done

# Manual local smoke test of a consuming workflow (once the CLI/REST path works):
#   add a workflow_dispatch workflow that does `uses: ./` to consume the action
#   from this checkout, then trigger it from the Actions tab. Do this BEFORE tagging.

# Cut a release (manual Marketplace publish follows in the Release UI):
git tag vX.Y.Z && git push --follow-tags
# then move the major tag:
git tag -f v1 && git push -f origin v1
```

CI lives in `.github/workflows/ci.yml` (YAML validation + metadata check on push
and PR) and `.github/workflows/release.yml` (tag-driven Marketplace reminder).
There is no unit-test suite -- validation is the YAML parse plus the metadata
assertion, and a manual `workflow_dispatch` smoke test before tagging.

## Links

- BrewPage -- <https://brewpage.app>
- OpenAPI contract (source of truth) -- <https://github.com/kochetkov-ma/brewpage-openapi>
- CLI dependency -- <https://github.com/kochetkov-ma/brewpage-cli>
