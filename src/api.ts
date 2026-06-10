import { readdir, readFile } from 'node:fs/promises'
import { basename, join, posix, relative, sep } from 'node:path'

export interface CreateResponse {
  id: string
  namespace: string
  link: string
  ownerLink: string
  expiresAt?: string
  sizeBytes?: number
  tags?: string[]
  ownerToken?: string
}

export interface UpdateResponse {
  id: string
  namespace: string
  link: string
  ownerLink: string
  expiresAt?: string
  sizeBytes?: number
}

export interface OwnerToken {
  token: string
  ownerId: string
}

export type HtmlFormat = 'html' | 'markdown'

export interface GalleryItem {
  id: string
  type: string
  title?: string
  createdAt?: string
  views?: number
  visibility?: string
  namespace: string
}

interface GalleryPage {
  items: GalleryItem[]
  total: number
  page: number
  size: number
}

// Discovery kind for matching gallery items to an artefact kind.
export type DiscoverKind = 'html' | 'markdown' | 'site' | 'file'

// 'ambiguous' signals that several items matched ns+kind: the caller should warn
// and fall back to creating, since auto-update cannot pick a single target safely.
export type DiscoverResult =
  | { status: 'found'; id: string }
  | { status: 'none' }
  | { status: 'ambiguous' }
  | { status: 'unavailable' }

const USER_AGENT = 'brewpage-action'
const GALLERY_PAGE_SIZE = 100

function matchesKind(type: string, kind: DiscoverKind): boolean {
  const normalized = type.toLowerCase()
  switch (kind) {
    case 'site':
      return normalized === 'site'
    case 'html':
      return normalized === 'html'
    case 'markdown':
      return normalized === 'markdown' || normalized === 'md'
    case 'file':
      return normalized === 'file'
  }
}

// GET /api/gallery?mine=true: list the caller's own publications (all kinds and
// namespaces, including private) and resolve the single resource matching ns+kind.
// Returns the id to update, or a non-found signal so the caller can create instead.
// Any non-2xx response or network failure is reported as 'unavailable'.
export async function discoverOwnResource(
  baseUrl: string,
  ownerToken: string,
  ns: string,
  kind: DiscoverKind
): Promise<DiscoverResult> {
  const matches: GalleryItem[] = []
  let page = 0
  try {
    for (;;) {
      const url = buildUrl(baseUrl, '/api/gallery', {
        mine: 'true',
        size: GALLERY_PAGE_SIZE,
        page
      })
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Owner-Token': ownerToken,
          'User-Agent': USER_AGENT
        }
      })
      if (!response.ok) {
        return { status: 'unavailable' }
      }
      const body = (await response.json()) as GalleryPage
      const items = Array.isArray(body.items) ? body.items : []
      for (const item of items) {
        if (item.namespace === ns && matchesKind(item.type, kind)) {
          matches.push(item)
        }
      }
      const seen = (page + 1) * GALLERY_PAGE_SIZE
      if (seen >= body.total || items.length === 0) {
        break
      }
      page += 1
    }
  } catch {
    return { status: 'unavailable' }
  }

  if (matches.length === 0) {
    return { status: 'none' }
  }
  if (matches.length > 1) {
    return { status: 'ambiguous' }
  }
  return { status: 'found', id: matches[0].id }
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | undefined>
): string {
  const url = new URL(`${trimBase(baseUrl)}${path}`)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function ensureOk(response: Response, operation: string): Promise<void> {
  if (response.ok) {
    return
  }
  const text = await response.text().catch(() => '')
  throw new Error(`${operation} failed: HTTP ${response.status} ${response.statusText} ${text}`.trim())
}

// GET /api/owner-token: mints a fresh, unauthenticated owner token (rate limited per IP).
export async function mintToken(baseUrl: string): Promise<OwnerToken> {
  const response = await fetch(buildUrl(baseUrl, '/api/owner-token', {}), {
    method: 'GET'
  })
  await ensureOk(response, 'mintToken')
  const body = (await response.json()) as OwnerToken
  return { token: body.token, ownerId: body.ownerId }
}

// POST /api/html: create an HTML/markdown page. showTopBar requires the JSON body path
// (it is a HtmlUploadRequest field, not a query parameter, and is immutable on update).
export async function postHtml(
  baseUrl: string,
  options: {
    body: string
    ns: string
    ttl: number
    tags?: string
    format: HtmlFormat
    ownerToken?: string
    password?: string
    showTopBar?: boolean
  }
): Promise<CreateResponse> {
  const url = buildUrl(baseUrl, '/api/html', {
    ns: options.ns,
    ttl: options.ttl,
    tags: options.tags,
    format: options.format
  })
  const headers: Record<string, string> = {}
  if (options.ownerToken) {
    headers['X-Owner-Token'] = options.ownerToken
  }
  if (options.password) {
    headers['X-Password'] = options.password
  }

  let requestBody: string
  if (options.showTopBar !== undefined) {
    headers['Content-Type'] = 'application/json'
    requestBody = JSON.stringify({
      content: options.body,
      showTopBar: options.showTopBar
    })
  } else {
    headers['Content-Type'] =
      options.format === 'markdown' ? 'text/markdown' : 'text/html'
    requestBody = options.body
  }

  const response = await fetch(url, { method: 'POST', headers, body: requestBody })
  await ensureOk(response, 'postHtml')
  return (await response.json()) as CreateResponse
}

// PUT /api/html/{ns}/{id}: replace page content at the same URL. Owner token required;
// tags/password/format/showTopBar are immutable on update.
export async function putHtml(
  baseUrl: string,
  options: {
    body: string
    ns: string
    id: string
    ttl?: number
    ownerToken: string
  }
): Promise<UpdateResponse> {
  const url = buildUrl(baseUrl, `/api/html/${options.ns}/${options.id}`, {
    ttl: options.ttl
  })
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/html',
      'X-Owner-Token': options.ownerToken
    },
    body: options.body
  })
  await ensureOk(response, 'putHtml')
  return (await response.json()) as UpdateResponse
}

async function fileToBlob(filePath: string): Promise<Blob> {
  const bytes = await readFile(filePath)
  return new Blob([bytes])
}

// POST /api/files: upload a single binary file via multipart field `file`.
export async function postFile(
  baseUrl: string,
  options: {
    filePath: string
    ns: string
    ttl: number
    tags?: string
    ownerToken?: string
    password?: string
  }
): Promise<CreateResponse> {
  const url = buildUrl(baseUrl, '/api/files', {
    ns: options.ns,
    ttl: options.ttl,
    tags: options.tags
  })
  const form = new FormData()
  form.append('file', await fileToBlob(options.filePath), basename(options.filePath))

  const headers: Record<string, string> = {}
  if (options.ownerToken) {
    headers['X-Owner-Token'] = options.ownerToken
  }
  if (options.password) {
    headers['X-Password'] = options.password
  }

  const response = await fetch(url, { method: 'POST', headers, body: form })
  await ensureOk(response, 'postFile')
  return (await response.json()) as CreateResponse
}

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const collected: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collected.push(...(await walkFiles(full)))
    } else if (entry.isFile()) {
      collected.push(full)
    }
  }
  return collected
}

function toPosixRelative(root: string, file: string): string {
  return relative(root, file).split(sep).join(posix.sep)
}

async function buildSiteForm(dirOrZip: string): Promise<FormData> {
  const form = new FormData()
  if (dirOrZip.toLowerCase().endsWith('.zip')) {
    form.append('archive', await fileToBlob(dirOrZip), basename(dirOrZip))
    return form
  }
  const files = await walkFiles(dirOrZip)
  for (const file of files) {
    const relPath = toPosixRelative(dirOrZip, file)
    form.append('files', await fileToBlob(file), basename(file))
    form.append('paths', relPath)
  }
  return form
}

// POST /api/sites: publish a multi-file static site. A .zip path uploads as `archive`;
// a directory is walked recursively and sent as parallel `files[]` + `paths[]` arrays.
export async function postSite(
  baseUrl: string,
  options: {
    dirOrZip: string
    ns: string
    ttl: number
    tags?: string
    entry?: string
    ownerToken?: string
    password?: string
  }
): Promise<CreateResponse> {
  const url = buildUrl(baseUrl, '/api/sites', {
    ns: options.ns,
    ttl: options.ttl,
    tags: options.tags,
    entry: options.entry
  })
  const form = await buildSiteForm(options.dirOrZip)

  const headers: Record<string, string> = {}
  if (options.ownerToken) {
    headers['X-Owner-Token'] = options.ownerToken
  }
  if (options.password) {
    headers['X-Password'] = options.password
  }

  const response = await fetch(url, { method: 'POST', headers, body: form })
  await ensureOk(response, 'postSite')
  return (await response.json()) as CreateResponse
}

// PUT /api/sites/{ns}/{id}: full-replace republish at the same URL. Owner token required.
export async function putSite(
  baseUrl: string,
  options: {
    dirOrZip: string
    ns: string
    id: string
    ttl?: number
    entry?: string
    ownerToken: string
  }
): Promise<UpdateResponse> {
  const url = buildUrl(baseUrl, `/api/sites/${options.ns}/${options.id}`, {
    ttl: options.ttl,
    entry: options.entry
  })
  const form = await buildSiteForm(options.dirOrZip)
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'X-Owner-Token': options.ownerToken },
    body: form
  })
  await ensureOk(response, 'putSite')
  return (await response.json()) as UpdateResponse
}
