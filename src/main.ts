import * as core from '@actions/core'

import {
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

interface Result {
  link: string
  ownerLink: string
  id: string
  namespace: string
  expiresAt?: string
}

function toResult(response: CreateResponse | UpdateResponse): Result {
  return {
    link: response.link,
    ownerLink: response.ownerLink,
    id: response.id,
    namespace: response.namespace,
    expiresAt: response.expiresAt
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
    const isUpdate = updateId !== undefined

    const result = await publish({
      kind,
      isUpdate,
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
      minted
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

interface PublishArgs {
  kind: Kind
  isUpdate: boolean
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
    isUpdate,
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

  if (isUpdate && updateId !== undefined) {
    if (kind === 'site') {
      return toResult(
        await putSite(baseUrl, {
          dirOrZip: path,
          ns: namespace,
          id: updateId,
          ttl,
          entry,
          ownerToken
        })
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
        })
      )
    }
    // Files are immutable: there is no PUT for /api/files, so create a new resource.
    core.warning(
      'update-id was supplied for a file artefact, but files are immutable. Creating a new resource instead.'
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
      })
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
      })
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
    })
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
