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

// --- discoverOwnResource: multiple matches pick oldest -----------------------

describe('discoverOwnResource - multiple matches pick oldest', () => {
  // GIVEN gallery returns several items matching ns+type with distinct createdAt
  // WHEN discoverOwnResource is called
  // THEN result is found with the oldest createdAt id and ambiguous:true

  it('returns the oldest createdAt id with ambiguous flag when several match', async () => {
    const items = [
      { id: 'newest', namespace: 'public', type: 'html', createdAt: '2026-03-01T00:00:00Z' },
      { id: 'oldest', namespace: 'public', type: 'html', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'middle', namespace: 'public', type: 'html', createdAt: '2026-02-01T00:00:00Z' }
    ]
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage(items, 3)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'oldest', ambiguous: true })
  })

  // GIVEN matching items where some lack createdAt
  // WHEN discoverOwnResource is called
  // THEN items with a timestamp win over those missing one (missing sorts last)

  it('treats missing createdAt as last so a dated item is chosen', async () => {
    const items = [
      { id: 'no-ts', namespace: 'public', type: 'html' },
      { id: 'dated', namespace: 'public', type: 'html', createdAt: '2026-01-01T00:00:00Z' }
    ]
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage(items, 2)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'dated', ambiguous: true })
  })

  // GIVEN all matching items lack createdAt
  // WHEN discoverOwnResource is called
  // THEN input order is preserved deterministically (first item chosen)

  it('keeps deterministic input order when all matches lack createdAt', async () => {
    const items = [
      { id: 'first', namespace: 'public', type: 'html' },
      { id: 'second', namespace: 'public', type: 'html' }
    ]
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage(items, 2)))

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'first', ambiguous: true })
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
  function fullPage(prefix: string): object[] {
    return Array.from({ length: 100 }, (_, i) => ({
      id: `${prefix}-${i}`,
      namespace: 'other',
      type: 'file'
    }))
  }

  // GIVEN a full first page (100 items) followed by a short second page
  // WHEN discoverOwnResource is called
  // THEN it continues to page 1 and finds the match across pages (total ignored)

  it('continues to the next page after a full page and stops on a short page', async () => {
    const items1 = [{ id: 'target', namespace: 'public', type: 'html' }]

    global.fetch = makeFetch(
      makeResponse(true, 200, galleryPage(fullPage('p0'), 1, 0)),
      makeResponse(true, 200, galleryPage(items1, 1, 1))
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
    expect(fetchMock.mock.calls[0][0] as string).toContain('page=0')
    expect(fetchMock.mock.calls[1][0] as string).toContain('page=1')
  })

  // GIVEN two full pages then a short third page
  // WHEN discoverOwnResource is called
  // THEN it requests pages 0,1,2 and stops on the short page

  it('walks multiple full pages until a short page terminates', async () => {
    const items2 = [{ id: 'found-on-2', namespace: 'public', type: 'html' }]

    global.fetch = makeFetch(
      makeResponse(true, 200, galleryPage(fullPage('p0'), 0, 0)),
      makeResponse(true, 200, galleryPage(fullPage('p1'), 0, 1)),
      makeResponse(true, 200, galleryPage(items2, 0, 2))
    )

    const result = await discoverOwnResource(
      'https://brewpage.app',
      'owner-tok',
      'public',
      'html'
    )

    expect(result).toEqual({ status: 'found', id: 'found-on-2' })

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0] as string).toContain('page=2')
  })

  // GIVEN body.total is large but the first page is short (< page size)
  // WHEN discoverOwnResource is called
  // THEN it stops after the first page regardless of total

  it('stops on a short first page even when total claims more', async () => {
    const items = [{ id: 'only', namespace: 'public', type: 'html' }]
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage(items, 9999, 0)))

    await discoverOwnResource('https://brewpage.app', 'tok', 'public', 'html')

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // GIVEN an empty page
  // WHEN discoverOwnResource is called
  // THEN it stops after the first page

  it('stops on an empty page', async () => {
    global.fetch = makeFetch(makeResponse(true, 200, galleryPage([], 0, 0)))

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
