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
| `update-id` | no | _(empty)_ | Id of an existing resource on [brewpage.app](https://brewpage.app). With `owner-token`, updates that resource (PUT) instead of creating a new one. |
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

### First publish (no owner token)

On the first run leave `owner-token` empty. The action mints a token and prints it in the job summary. Read the `owner-token` output and store it as a repo secret so future runs can update the same resource.

```yaml
- name: Publish HTML report
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html
    kind: html

- name: Show live URL
  run: echo "Published to ${{ steps.brewpage.outputs.url }}"

# Persist the minted owner token to a repo secret (one-time).
# Requires a token with secrets:write, e.g. a fine-grained PAT in GH_PAT.
- name: Save owner token as a secret
  env:
    GH_TOKEN: ${{ secrets.GH_PAT }}
    OWNER_TOKEN: ${{ steps.brewpage.outputs.owner-token }}
    RESOURCE_ID: ${{ steps.brewpage.outputs.id }}
  run: |
    gh secret set BREWPAGE_OWNER_TOKEN --body "$OWNER_TOKEN"
    gh variable set BREWPAGE_ID --body "$RESOURCE_ID"
```

> The minted `owner-token` is the only credential that can manage, update, or delete the resource on [brewpage.app](https://brewpage.app). Losing it makes the resource unmanageable. Copy it from the job summary if you do not automate the secret step above.

### Redeploy / update an existing resource

Pass the saved `owner-token` plus the `update-id` to update the same resource in place (PUT) instead of creating a new one.

```yaml
- name: Redeploy report
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./report.html
    kind: html
    owner-token: ${{ secrets.BREWPAGE_OWNER_TOKEN }}
    update-id: ${{ vars.BREWPAGE_ID }}
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

Versioning is automated:

1. Merges to `main` feed [release-please](https://github.com/googleapis/release-please), which opens/maintains a release PR.
2. Merging that PR creates the `vX.Y.Z` tag.
3. `release.yml` builds `dist/`, creates the GitHub Release, moves the major tag `v1` to the new commit so `@v1` consumers pick it up, and updates the Marketplace listing.
4. The very first Marketplace listing requires a one-time manual acceptance of the Marketplace Terms of Service in the Release UI; subsequent releases publish automatically.

## License

MIT -- see [LICENSE](./LICENSE).
