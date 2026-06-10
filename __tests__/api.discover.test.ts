import { jest } from '@jest/globals'
import type { DiscoverResult } from '../src/api.js'

// --- helpers -----------------------------------------------------------------

function makeResponse(
  ok: boolean,
  status: number,
  body: object
): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

function galleryPage(items: object[], total: number, page = 0): object {
  return { items, total, page, size: 100 }
}

function makeFetch(...responses: Response[]): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn() as jest.MockedFunction<typeof fetch>
  for (const r of responses) {
    mock.mockResolvedValueOnce(r)
  }
  return mock
}

// --- import SUT after helpers defined ----------------------------------------

const { discoverOwnResource } = await import('../src/api.js')

// --- discoverOwnResource: found ----------------------------------------------

describe('discoverOwnResource - found', () => {
  // GIVEN gallery returns one item matching namespace and type
  // WHEN discoverOwnResource is called
  // THEN result is {status:'found', id} and fetch is called with correct URL and header

  it('returns found with matching id when single item matches ns and type', async () => {
    const item = { id: 'abc123', namespace: 'public', type: 'html' }
    const page = galleryPage([item], 1)
    global.fetch = makeFetch(makeResponse(true, 200, page))

    const result: DiscoverResult = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'abc123' })
  })

  it('calls fetch with /api/gallery?mine=true and X-Owner-Token header', async () => {
    const item = { id: 'abc123', namespace: 'public', type: 'html' }
    const page = galleryPage([item], 1)
    global.fetch = makeFetch(makeResponse(true, 200, page))

    await discoverOwnResource('https://brewpage.app', 'owner-tok', 'public', 'html')

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/gallery')
    expect(url).toContain('mine=true')
    expect((init.headers as Record<string, string>)['X-Owner-Token']).toEqual('owner-tok')
  })
})

// --- discoverOwnResource: none -----------------------------------------------

describe('discoverOwnResource - none', () => {
  // GIVEN gallery returns items but none match namespace+type
  // WHEN discoverOwnResource is called
  // THEN result is {status:'none'}

  it('returns none when items present but none match ns and type', async () => {
    const items = [
      { id: 'x1', namespace: 'other-ns', type: 'html' },
      { id: 'x2', namespace: 'public', type: 'site' }
    ]
    const page = galleryPage(items, 2)
    global.fetch = makeFetch(makeResponse(true, 200, page))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'none' })
  })

  it('returns none when gallery returns empty items array', async () => {
    const page = galleryPage([], 0)
    global.fetch = makeFetch(makeResponse(true, 200, page))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'none' })
  })
})

// --- discoverOwnResource: ambiguous ------------------------------------------

describe('discoverOwnResource - ambiguous', () => {
  // GIVEN gallery returns two items that both match namespace+type
  // WHEN discoverOwnResource is called
  // THEN result is {status:'ambiguous'}

  it('returns ambiguous when two items match ns and type', async () => {
    const items = [
      { id: 'id1', namespace: 'public', type: 'html' },
      { id: 'id2', namespace: 'public', type: 'html' }
    ]
    const page = galleryPage(items, 2)
    global.fetch = makeFetch(makeResponse(true, 200, page))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'ambiguous' })
  })
})

// --- discoverOwnResource: unavailable ----------------------------------------

describe('discoverOwnResource - unavailable', () => {
  // GIVEN fetch returns a non-2xx response
  // WHEN discoverOwnResource is called
  // THEN result is {status:'unavailable'}

  it('returns unavailable when gallery responds with 404', async () => {
    global.fetch = makeFetch(makeResponse(false, 404, {}))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'unavailable' })
  })

  it('returns unavailable when gallery responds with 500', async () => {
    global.fetch = makeFetch(makeResponse(false, 500, {}))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'unavailable' })
  })

  // GIVEN fetch throws a network error
  // WHEN discoverOwnResource is called
  // THEN result is {status:'unavailable'}

  it('returns unavailable when fetch rejects with a network error', async () => {
    const mock = jest.fn() as jest.MockedFunction<typeof fetch>
    mock.mockRejectedValueOnce(new Error('network timeout'))
    global.fetch = mock

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'unavailable' })
  })
})

// --- discoverOwnResource: pagination -----------------------------------------

describe('discoverOwnResource - pagination', () => {
  // GIVEN total > 100 (page 0 returns 100 items, total=150)
  // WHEN discoverOwnResource is called
  // THEN two fetch calls are made with page=0 and page=1

  it('fetches page 1 when total exceeds first page size', async () => {
    const items0 = Array.from({ length: 100 }, (_, i) => ({
      id: `p0-${i}`,
      namespace: 'other',
      type: 'file'
    }))
    const items1 = [{ id: 'target', namespace: 'public', type: 'html' }]

    global.fetch = makeFetch(
      makeResponse(true, 200, galleryPage(items0, 101, 0)),
      makeResponse(true, 200, galleryPage(items1, 101, 1))
    )

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'target' })

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const url0 = fetchMock.mock.calls[0][0] as string
    const url1 = fetchMock.mock.calls[1][0] as string
    expect(url0).toContain('page=0')
    expect(url1).toContain('page=1')
  })

  it('stops after first page when total <= 100', async () => {
    const items = [{ id: 'only', namespace: 'public', type: 'html' }]
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage(items, 1, 0)))

    await discoverOwnResource('https://brewpage.app', 'tok', 'public', 'html')

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// --- discoverOwnResource: type matching (markdown) ---------------------------

describe('discoverOwnResource - type matching for markdown kind', () => {
  // GIVEN gallery item has type 'md' or 'markdown'
  // WHEN discoverOwnResource is called with kind='markdown'
  // THEN both type values are treated as matching

  it('matches item with type="markdown" when kind is markdown', async () => {
    const item = { id: 'md1', namespace: 'public', type: 'markdown' }
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage([item], 1)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'tok',
      'public',
      'markdown'
    )

    expect(result).toEqual({ status: 'found', id: 'md1' })
  })

  it('matches item with type="md" when kind is markdown', async () => {
    const item = { id: 'md2', namespace: 'public', type: 'md' }
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage([item], 1)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'tok',
      'public',
      'markdown'
    )

    expect(result).toEqual({ status: 'found', id: 'md2' })
  })

  it('matches type case-insensitively (MD uppercase -> markdown kind)', async () => {
    const item = { id: 'md3', namespace: 'public', type: 'MD' }
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage([item], 1)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'tok',
      'public',
      'markdown'
    )

    expect(result).toEqual({ status: 'found', id: 'md3' })
  })

  it('does not match html type when kind is markdown', async () => {
    const item = { id: 'h1', namespace: 'public', type: 'html' }
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage([item], 1)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'tok',
      'public',
      'markdown'
    )

    expect(result).toEqual({ status: 'none' })
  })
})
