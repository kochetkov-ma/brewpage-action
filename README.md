# brewpage-action

Publish CI artefacts -- HTML reports, Playwright reports, generated docs, build outputs -- to [BrewPage](https://brewpage.app) from a GitHub workflow. One step, one live URL as a job output.

[![Marketplace](https://img.shields.io/badge/marketplace-Publish%20to%20BrewPage-purple)](https://github.com/marketplace/actions/publish-to-brewpage)

## Status

> **Pre-release (v0) -- BLOCKED on `brewpage-cli`.**
> This action shells out to `npx brewpage`, the [`brewpage-cli`](https://github.com/kochetkov-ma/brewpage-cli) npm package, which is **not yet published to npm**. The action cannot actually publish until that CLI ships. The composite scaffold, inputs, outputs, and masking discipline are complete and Marketplace-ready; only the underlying CLI is missing.

## What it does

Runs `npx brewpage publish <path>` with your inputs mapped to flags, captures the result, and exposes the live URL, resource id, and owner token as step outputs. The owner token is masked in the log via `::add-mask::` before it is ever written.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `path` | yes | -- | File, directory, or zip to publish. |
| `kind` | no | `auto` | Artefact kind: `html`, `markdown`, `site`, `file`, or `auto`. |
| `namespace` | no | `public` | Target namespace. `public` is listed in the gallery and search-indexed; set a private namespace to keep it unlisted. |
| `password` | no | _(empty)_ | Optional password. When set, the resource is marked private. |
| `ttl-days` | no | `15` | Time to live in days (1..30). |
| `update-token` | no | _(empty)_ | Owner token of an existing resource to update. Must be paired with `update-id`. |
| `update-id` | no | _(empty)_ | Id of an existing resource to update. Must be paired with `update-token`. |
| `brewpage-url` | no | _(empty)_ | Override the BrewPage API base URL. Empty uses the CLI default (`https://brewpage.app`). |
| `token` | no | _(empty)_ | Optional owner/publish token for authenticated publishing. |

## Outputs

| Output | Description |
|--------|-------------|
| `url` | Live URL of the published resource. |
| `owner-token` | Owner token for managing the resource (masked in logs). Store it as a secret -- losing it makes the resource unmanageable. |
| `id` | Resource id. |

## Usage

```yaml
- name: Publish Playwright report
  id: brewpage
  uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./playwright-report
    kind: site

- name: Show URL
  run: echo "Report: ${{ steps.brewpage.outputs.url }}"
```

Update an existing resource:

```yaml
- uses: kochetkov-ma/brewpage-action@v1
  with:
    path: ./playwright-report
    kind: site
    update-id: ${{ vars.BREWPAGE_ID }}
    update-token: ${{ secrets.BREWPAGE_OWNER_TOKEN }}
```

> Always reference the action by major tag (`@v1`) or an exact `@vX.Y.Z` -- never `@main`.

## Links

- BrewPage -- https://brewpage.app
- OpenAPI contract -- https://github.com/kochetkov-ma/brewpage-openapi
- CLI -- https://github.com/kochetkov-ma/brewpage-cli (dependency, pre-release)

## License

MIT -- see [LICENSE](./LICENSE).
