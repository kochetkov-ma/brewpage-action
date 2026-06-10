import * as core from '@actions/core'

import {
  discoverOwnResource,
  mintToken,
  postFile,
  postHtml,
  postSite,
  putHtml,
  putSite,
  type CreateResponse,
  type HtmlFormat,
  type UpdateResponse
} from './api.js'
import { detectKind, repoNamespace, type Kind } from './detect.js'
import { buildSummary } from './summary.js'

const DEFAULT_BASE_URL = 'https://brewpage.app'
const MIN_TTL = 1
const MAX_TTL = 30

type Mode = 'auto' | 'create' | 'update'

function parseMode(raw: string): Mode {
  if (raw === 'create' || raw === 'update') {
    return raw
  }
  return 'auto'
}

function clampTtl(raw: string): number {
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    return 15
  }
  return Math.min(MAX_TTL, Math.max(MIN_TTL, parsed))
}

function optional(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

type Action = 'created' | 'updated'

interface Result {
  link: string
  ownerLink: string
  id: string
  namespace: string
  expiresAt?: string
  action: Action
}

function toResult(
  response: CreateResponse | UpdateResponse,
  action: Action
): Result {
  return {
    link: response.link,
    ownerLink: response.ownerLink,
    id: response.id,
    namespace: response.namespace,
    expiresAt: response.expiresAt,
    action
  }
}

export async function run(): Promise<void> {
  const failOnError = core.getInput('fail-on-error') !== 'false'

  try {
    const path = core.getInput('path', { required: true })
    const baseUrl = optional(core.getInput('brewpage-url')) ?? DEFAULT_BASE_URL
    const namespace =
      optional(core.getInput('namespace')) ??
      repoNamespace(process.env.GITHUB_REPOSITORY)
    const password = optional(core.getInput('password'))
    const tags = optional(core.getInput('tags'))
    const entry = optional(core.getInput('entry'))
    const updateId = optional(core.getInput('update-id'))
    const mode = parseMode(core.getInput('mode') || 'auto')
    const ttl = clampTtl(core.getInput('ttl-days') || '15')

    const showTopBarRaw = core.getInput('show-top-bar')
    const showTopBar =
      showTopBarRaw === '' ? undefined : showTopBarRaw === 'true'

    // Resolve and mask the owner token the instant it is known, before any
    // setOutput, log line, or summary that could echo it.
    let ownerToken = optional(core.getInput('owner-token'))
    let minted = false
    if (ownerToken === undefined) {
      const fresh = await mintToken(baseUrl)
      ownerToken = fresh.token
      minted = true
    }
    core.setSecret(ownerToken)

    const kind: Kind = detectKind(path, core.getInput('kind') || 'auto')

    const targetId = await resolveTargetId({
      mode,
      updateId,
      ownerToken,
      minted,
      baseUrl,
      namespace,
      kind
    })

    const result = await publish({
      kind,
      updateId: targetId,
      path,
      baseUrl,
      namespace,
      ttl,
      tags,
      entry,
      password,
      ownerToken,
      showTopBar
    })

    core.setOutput('url', result.link)
    core.setOutput('owner-url', result.ownerLink)
    core.setOutput('owner-token', ownerToken)
    core.setOutput('id', result.id)
    core.setOutput('namespace', result.namespace)
    core.setOutput('expires-at', result.expiresAt ?? '')

    await buildSummary(core, {
      link: result.link,
      ownerLink: result.ownerLink,
      id: result.id,
      namespace: result.namespace,
      expiresAt: result.expiresAt,
      ownerToken,
      minted,
      action: result.action
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (failOnError) {
      core.setFailed(message)
    } else {
      core.warning(message)
    }
  }
}

interface ResolveTargetArgs {
  mode: Mode
  updateId?: string
  ownerToken: string
  minted: boolean
  baseUrl: string
  namespace: string
  kind: Kind
}

// Decide which existing resource id (if any) the publish should update.
// Explicit update-id always wins. In auto/update mode an owner token can discover
// its own prior resource for the same namespace+kind. mode=create never updates.
// A freshly minted token has no prior resources, so discovery is skipped.
async function resolveTargetId(
  args: ResolveTargetArgs
): Promise<string | undefined> {
  const { mode, updateId, ownerToken, minted, baseUrl, namespace, kind } = args

  if (updateId !== undefined) {
    return updateId
  }

  if (mode === 'create') {
    return undefined
  }

  if (mode === 'auto' && minted) {
    // A token minted this run cannot own any existing resource: create directly.
    return undefined
  }

  if (mode === 'auto' || mode === 'update') {
    const discovery = await discoverOwnResource(
      baseUrl,
      ownerToken,
      namespace,
      kind
    )
    if (discovery.status === 'found') {
      return discovery.id
    }
    if (discovery.status === 'ambiguous') {
      core.warning(
        `Multiple ${kind} resources found in namespace "${namespace}"; cannot auto-select one. ` +
          'Pass update-id to target a specific resource. Creating a new resource instead.'
      )
    }
    if (mode === 'update') {
      throw new Error(
        `mode=update requires an existing resource, but none could be resolved for ` +
          `namespace "${namespace}" and kind "${kind}" (set update-id or use mode=auto).`
      )
    }
  }

  return undefined
}

interface PublishArgs {
  kind: Kind
  updateId?: string
  path: string
  baseUrl: string
  namespace: string
  ttl: number
  tags?: string
  entry?: string
  password?: string
  ownerToken: string
  showTopBar?: boolean
}

async function publish(args: PublishArgs): Promise<Result> {
  const {
    kind,
    updateId,
    path,
    baseUrl,
    namespace,
    ttl,
    tags,
    entry,
    password,
    ownerToken,
    showTopBar
  } = args

  if (updateId !== undefined) {
    if (kind === 'site') {
      return toResult(
        await putSite(baseUrl, {
          dirOrZip: path,
          ns: namespace,
          id: updateId,
          ttl,
          entry,
          ownerToken
        }),
        'updated'
      )
    }
    if (kind === 'html' || kind === 'markdown') {
      return toResult(
        await putHtml(baseUrl, {
          body: await readText(path),
          ns: namespace,
          id: updateId,
          ttl,
          ownerToken
        }),
        'updated'
      )
    }
    // Files are immutable: there is no PUT for /api/files, so create a new resource.
    core.warning(
      'A file artefact cannot be updated in place (files are immutable). Creating a new resource instead.'
    )
  }

  if (kind === 'site') {
    return toResult(
      await postSite(baseUrl, {
        dirOrZip: path,
        ns: namespace,
        ttl,
        tags,
        entry,
        ownerToken,
        password
      }),
      'created'
    )
  }
  if (kind === 'html' || kind === 'markdown') {
    const format: HtmlFormat = kind === 'markdown' ? 'markdown' : 'html'
    return toResult(
      await postHtml(baseUrl, {
        body: await readText(path),
        ns: namespace,
        ttl,
        tags,
        format,
        ownerToken,
        password,
        showTopBar: format === 'html' ? showTopBar : undefined
      }),
      'created'
    )
  }
  return toResult(
    await postFile(baseUrl, {
      filePath: path,
      ns: namespace,
      ttl,
      tags,
      ownerToken,
      password
    }),
    'created'
  )
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf8')
}

// Auto-invoke only as the bundled action entrypoint, not when imported by tests.
if (process.env.JEST_WORKER_ID === undefined) {
  void run()
}
