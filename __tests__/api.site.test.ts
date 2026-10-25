import { jest } from '@jest/globals'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { postSite, putSite } from '../src/api.js'

describe('site upload transport', () => {
  let directory: string
  const originalFetch = global.fetch
  const response = {
    id: 'site001',
    namespace: 'public',
    link: 'https://publication.brewpage.app/',
    ownerLink: 'https://brewpage.app/api/sites/public/site001',
    expiresAt: '2026-10-30T00:00:00Z',
    routingCohort: 'new-v1',
    deliveryMode: 'subdomain',
    modeLocked: true,
    hostingVersion: 1
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'brewpage-action-'))
    global.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(response), { status: 200 })
      )
  })

  afterEach(async () => {
    global.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  })

  it('uploads directories as matching repeated files and paths and preserves response metadata', async () => {
    // GIVEN a directory containing an entry and nested asset.
    await mkdir(join(directory, 'assets'))
    await writeFile(join(directory, 'index.html'), '<h1>Site</h1>')
    await writeFile(
      join(directory, 'assets', 'app.js'),
      'export const ready = true'
    )
    // WHEN publishing the directory using native multipart transport.
    const result = await postSite('https://brewpage.app', {
      dirOrZip: directory,
      ns: 'public',
      ttl: 15,
      entry: 'index.html',
      ownerToken: 'owner',
      password: 'password'
    })
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    // THEN the request includes paired paths and leaves the server response intact.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      'https://brewpage.app/api/sites?ns=public&ttl=15&entry=index.html'
    )
    expect(init?.headers).toEqual({
      'X-Owner-Token': 'owner',
      'X-Password': 'password'
    })
    const form = init?.body as FormData
    expect(form.getAll('paths')).toEqual(['assets/app.js', 'index.html'])
    expect(form.getAll('files').map((value) => (value as File).name)).toEqual([
      'app.js',
      'index.html'
    ])
    expect(form.getAll('archive')).toEqual([])
    expect(result).toEqual(response)
  })

  it('uploads a ZIP as one archive on PUT and retains the returned expiry and root link', async () => {
    // GIVEN a prebuilt ZIP and a stable existing resource.
    const archive = join(directory, 'site.zip')
    await writeFile(archive, Buffer.from([80, 75, 3, 4]))
    // WHEN updating the site with a requested TTL.
    const result = await putSite('https://brewpage.app', {
      dirOrZip: archive,
      ns: 'public',
      id: 'site001',
      ttl: 30,
      ownerToken: 'owner'
    })
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    // THEN PUT carries one archive and trusts the server expiry rather than computing renewal.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://brewpage.app/api/sites/public/site001?ttl=30')
    expect(init?.method).toBe('PUT')
    const form = init?.body as FormData
    expect(form.getAll('archive').map((value) => (value as File).name)).toEqual(
      ['site.zip']
    )
    expect(form.getAll('files')).toEqual([])
    expect(form.getAll('paths')).toEqual([])
    expect(result).toEqual(response)
  })

  it('surfaces HTTP failure status and server error for rejected bundles', async () => {
    // GIVEN a server rejection for a malformed ZIP.
    const archive = join(directory, 'site.zip')
    await writeFile(archive, 'invalid')
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(
      new Response('{"error":"Invalid archive"}', {
        status: 400,
        statusText: 'Bad Request'
      })
    )
    // WHEN publishing the rejected archive.
    const request = postSite('https://brewpage.app', {
      dirOrZip: archive,
      ns: 'public',
      ttl: 15
    })
    // THEN the action exposes the actionable HTTP error.
    await expect(request).rejects.toThrow(
      'postSite failed: HTTP 400 Bad Request {"error":"Invalid archive"}'
    )
  })
})
