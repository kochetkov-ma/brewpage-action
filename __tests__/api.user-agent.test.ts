import { jest } from '@jest/globals'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }
import {
  USER_AGENT,
  discoverOwnResource,
  mintToken,
  postFile,
  postHtml,
  postSite,
  putHtml,
  putSite
} from '../src/api.js'

const BASE = 'https://brewpage.app'
const EXPECTED_UA = `brewpage-action/${pkg.version} (+https://brewpage.app)`

describe('User-Agent on every brewpage request', () => {
  let directory: string
  const originalFetch = global.fetch

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'brewpage-ua-'))
    await writeFile(join(directory, 'index.html'), '<h1>ua</h1>')
    global.fetch = jest
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ id: 'id1', items: [], token: 't', ownerId: 'o' })
      )
  })

  afterEach(async () => {
    global.fetch = originalFetch
    await rm(directory, { recursive: true, force: true })
  })

  it('USER_AGENT is name/package version plus site link', () => {
    expect(USER_AGENT).toBe(EXPECTED_UA)
  })

  it.each<[string, (dir: string) => Promise<unknown>]>([
    ['mintToken', () => mintToken(BASE)],
    [
      'discoverOwnResource',
      () => discoverOwnResource(BASE, 'tok', 'public', 'html')
    ],
    [
      'postHtml raw',
      () => postHtml(BASE, { body: '<p/>', ns: 'n', ttl: 1, format: 'html' })
    ],
    [
      'postHtml json',
      () =>
        postHtml(BASE, {
          body: '<p/>',
          ns: 'n',
          ttl: 1,
          format: 'html',
          showTopBar: false
        })
    ],
    [
      'putHtml',
      () =>
        putHtml(BASE, {
          body: '# a',
          ns: 'n',
          id: 'i',
          format: 'markdown',
          ownerToken: 'tok'
        })
    ],
    [
      'postFile',
      (dir) =>
        postFile(BASE, { filePath: join(dir, 'index.html'), ns: 'n', ttl: 1 })
    ],
    ['postSite', (dir) => postSite(BASE, { dirOrZip: dir, ns: 'n', ttl: 1 })],
    [
      'putSite',
      (dir) =>
        putSite(BASE, { dirOrZip: dir, ns: 'n', id: 'i', ownerToken: 'tok' })
    ]
  ])(
    'GIVEN %s WHEN it calls brewpage THEN it sends the UA',
    async (_, call) => {
      await call(directory)
      const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
      const agents = fetchMock.mock.calls.map(
        ([, init]) => (init?.headers as Record<string, string>)['User-Agent']
      )
      expect({ agents }).toEqual({ agents: [EXPECTED_UA] })
    }
  )
})
