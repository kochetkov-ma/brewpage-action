# brewpage-action

[![CI](https://github.com/kochetkov-ma/brewpage-action/actions/workflows/ci.yml/badge.svg)](https://github.com/kochetkov-ma/brewpage-action/actions/workflows/ci.yml) [![check-dist](https://github.com/kochetkov-ma/brewpage-action/actions/workflows/check-dist.yml/badge.svg)](https://github.com/kochetkov-ma/brewpage-action/actions/workflows/check-dist.yml) [![Release](https://img.shields.io/github/v/release/kochetkov-ma/brewpage-action?sort=semver)](https://github.com/kochetkov-ma/brewpage-action/releases) [![Marketplace](https://img.shields.io/badge/Marketplace-Publish%20to%20BrewPage-purple)](https://github.com/marketplace/actions/publish-to-brewpage) [![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

Publish CI artefacts -- HTML reports, markdown, multi-file sites (Playwright reports, generated docs, static builds), and single files -- to [BrewPage](https://brewpage.app) from a GitHub workflow. One step, one live URL on [brewpage.app](https://brewpage.app) as a job output.

## What it does

A Node 24 TypeScript action that publishes your artefact to [BrewPage](https://brewpage.app) directly over the REST API (no CLI, no extra install). It detects the artefact kind, uploads it, and exposes the live URL, resource id, owner token, namespace, and expiry as step outputs. The owner token is masked in the log via `core.setSecret` before it is ever written or summarised.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | yes | -- | File, directory, or `.zip` to publish to [brewpage.app](https://brewpage.app). |
| `kind` | no | `auto` | Artefact kind: `html`, `markdown`, `site`, `file`, or `auto`. |
| `namespace` | no | _(empty)_ | Target namespace. Empty derives a deterministic per-repo slug from `github.repository`. The default `public` namespace is gallery-listed on [brewpage.app](https://brewpage.app) and search-indexed; set a private namespace to keep the resource unlisted. |
| `password` | no | _(empty)_ | When set, the resource is private and hidden from the [brewpage.app](https://brewpage.app) gallery. |
| `ttl-days` | no | `15` | Time to live in days (1..30) before the resource expires on [brewpage.app](https://brewpage.app). |
| `tags` | no | _(empty)_ | Comma-separated tags used for search and grouping on [brewpage.app](https://brewpage.app). |
| `owner-token` | no | _(empty)_ | `X-Owner-Token` for the resource. Empty auto-mints a token surfaced in the job summary -- persist it as a secret for redeploys. |
| `mode` | no | `auto` | Publish mode: `auto`, `create`, or `update`. `auto` auto-republishes -- with a persisted `owner-token` it discovers the matching resource for this namespace+kind via the [brewpage.app](https://brewpage.app) owner gallery and updates it (PUT), or creates one on first run. `create` always creates a new resource; `update` requires an existing resource (`update-id` or a discoverable one) and fails otherwise. |
| `update-id` | no | _(empty)_ | Id of an existing resource on [brewpage.app](https://brewpage.app). With `owner-token`, explicitly updates that resource (PUT) instead of relying on auto-discovery. Takes precedence over `mode` auto-discovery. |
| `entry` | no | _(empty)_ | Site entry file override (default `index.html`). |
| `show-top-bar` | no | _(empty)_ | HTML only: toggle the [brewpage.app](https://brewpage.app) toolbar. |
| `brewpage-url` | no | _(empty)_ | API base URL override. Empty uses `https://brewpage.app`. |
| `fail-on-error` | no | `true` | When `false`, warn instead of failing the step on error. |

## Outputs

| Output | Description |
|--------|-------------|
| `url` | Live URL of the published resource on [brewpage.app](https://brewpage.app). |
| `owner-url` | API/owner URL for managing the resource. |
| `owner-token` | Owner token (masked in logs). Persist to a secret to manage/redeploy the resource. |
| `id` | Resource id. |
| `namespace` | Namespace the resource was published to. |
| `expires-at` | Expiry timestamp. |

> **Public namespace warning.** The default/`public` namespace is gallery-listed on [brewpage.app](https://brewpage.app) and search-indexed. To keep a resource unlisted and private, set a custom `namespace` **and** a `password`.

## Usage

Four ways to publish, simplest first. All examples reference the action as `kochetkov-ma/brewpage-action@v1`.

### 1. Just publish (simplest, one-off)

Use this for a quick one-off preview. You pass only `path` (and optionally `kind`). No owner token.

```yaml
- name: Publish HTML report
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html

- run: echo "Published to ${{ steps.brewpage.outputs.url }}"  # on brewpage.app
```

**Requests made:** `GET /api/owner-token` (mints a fresh token), then a `POST` create (`/api/html`, `/api/sites`, or `/api/files` depending on kind).

**What happens:** a brand-new resource and URL are created on [brewpage.app](https://brewpage.app) on every run. The freshly minted `owner-token` is shown in the job summary and exposed as the `owner-token` output. If you want to keep updating the same URL later, save that token -- see the next scenario.

### 2. Generate an owner token once (setup for reuse)

This is the one-time prerequisite for scenarios 3 and 4. It is not an action call of its own -- just get a token and store it as the repo secret `BREWPAGE_OWNER_TOKEN`. The `owner-token` is the only credential that can update or delete the resource on [brewpage.app](https://brewpage.app); lose it and the resource is unmanageable.

**Option A -- mint a token directly and paste it into a secret:**

```bash
curl -fsS https://brewpage.app/api/owner-token
# Copy the token, then in your repo: Settings -> Secrets -> New secret
#   Name: BREWPAGE_OWNER_TOKEN   Value: <the token>
```

**Option B -- run scenario 1 once and persist the `owner-token` output.** This `gh secret set` needs a token with `secrets:write` (e.g. a fine-grained PAT in `GH_PAT`):

```yaml
- name: First publish (mints the token)
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html

- name: Persist owner token as a secret
  env:
    GH_TOKEN: ${{ secrets.GH_PAT }}
    OWNER_TOKEN: ${{ steps.brewpage.outputs.owner-token }}
  run: gh secret set BREWPAGE_OWNER_TOKEN --body "$OWNER_TOKEN"
```

### 3. Redeploy to a known resource (fastest -- one request)

Use this when you already created the resource (manually or in an earlier run) and know its `namespace` and `id`. This is the most efficient redeploy. You pass `owner-token` + `namespace` + `update-id`.

```yaml
- name: Redeploy report
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html
    owner-token: ${{ secrets.BREWPAGE_OWNER_TOKEN }}
    namespace: my-namespace
    update-id: ${{ vars.BREWPAGE_ID }}
```

**Requests made:** exactly one -- `PUT /api/{html|sites}/{ns}/{id}` with header `X-Owner-Token`. No mint, no gallery discovery (`update-id` short-circuits everything).

**What happens:** the content is replaced in place at the same URL on [brewpage.app](https://brewpage.app). The `owner-token` must own the resource (otherwise `403`), and `ns`+`id` must already exist (otherwise `404` -- `PUT` does not create). Files are immutable: `kind: file` has no `PUT`, so a new resource is created instead.

### 4. Full-auto redeploy (most automatic, one extra request)

Use this when you just want "publish and keep one stable URL" without tracking the id. This is the default `mode: auto`. You pass `owner-token` + `path`; `namespace` is optional and defaults to a deterministic per-repo slug (derived from `github.repository`).

```yaml
- name: Publish (auto-republish)
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html
    owner-token: ${{ secrets.BREWPAGE_OWNER_TOKEN }}

- run: echo "Stable URL: ${{ steps.brewpage.outputs.url }}"
```

**Requests made:** `GET /api/gallery?mine=true` with header `X-Owner-Token` (discovers your resource by namespace+kind), then `PUT` if one is found, or a `POST` create on the first run.

**What happens:** the first run finds nothing and creates the resource; every later run finds it and `PUT`s over it -- same URL on [brewpage.app](https://brewpage.app). If several resources match the same namespace+kind, it updates the oldest and warns (pass `update-id`, scenario 3, to be explicit). Files always create (immutable). A freshly minted token skips discovery.

```
  mint owner-token once          (GET /api/owner-token, or read run #1 output)
            |
            v
  run #1: no resource yet  -----> POST  -> create resource (stable URL)
            |
            v
  run #2..N: discover by owner --> GET /api/gallery?mine=true
            (match namespace + kind)
            |
            v
                            -----> PUT same resource (URL unchanged)
```

### Publish a multi-file site (directory)

```yaml
- name: Publish Playwright report
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./playwright-report
    kind: site
    entry: index.html

- run: echo "Site live at ${{ steps.brewpage.outputs.url }}"  # on brewpage.app
```

### Publish a single file

```yaml
- name: Publish artefact
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./dist/bundle.zip
    kind: file
```

> Reference the action by major tag (`@v1`) or an exact `@vX.Y.Z` -- never `@main`. Pin every other `uses:` to an exact version too.

## Ecosystem

- BrewPage -- the platform this action publishes to: <https://brewpage.app>
- REST API contract / source of truth: <https://github.com/kochetkov-ma/brewpage-openapi>

## Releases (maintainer note)

Versioning is tag-based:

1. Bump the version in `package.json`.
2. Create an annotated tag and push it: `git tag -a vX.Y.Z -m "..."` then `git push origin main && git push origin vX.Y.Z`.
3. The tag push triggers `release.yml`: checkout, `npm ci`, lint, test, build, verify the committed `dist/` matches a fresh rebuild (fails on drift), create the GitHub Release ([softprops/action-gh-release](https://github.com/softprops/action-gh-release)), and force-move the major tag `v1` to the released commit so `@v1` consumers auto-update.
4. The very first Marketplace listing requires a one-time manual acceptance of the Marketplace Terms of Service in the Release UI; subsequent releases publish automatically.

Latest release: `v1.1.0` (full-auto republish). `@v1` is the stable consumer ref and tracks the latest `v1.x`.

## License

MIT -- see [LICENSE](./LICENSE).
