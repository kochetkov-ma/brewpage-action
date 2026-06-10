import { jest } from '@jest/globals'

// --- mock @actions/core -------------------------------------------------------

const mockSummary = {
  addHeading: jest.fn().mockReturnThis(),
  addLink: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addRaw: jest.fn().mockReturnThis(),
  write: jest.fn(async () => undefined)
}

const mockCore = {
  getInput: jest.fn((name: string) => name && ''),
  setOutput: jest.fn(),
  setSecret: jest.fn(),
  setFailed: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
  notice: jest.fn(),
  info: jest.fn(),
  summary: mockSummary
}

jest.unstable_mockModule('@actions/core', () => mockCore)

// --- mock node:fs for detectKind ---------------------------------------------

jest.unstable_mockModule('node:fs', () => ({
  statSync: jest.fn(() => ({ isDirectory: () => false }))
}))

// --- mock node:fs/promises for readText/postFile/postSite --------------------

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn(async () => Buffer.from('<h1>hello</h1>')),
  readdir: jest.fn(async () => [])
}))

// --- import SUT after mocks --------------------------------------------------

const { run } = await import('../src/main.js')

// --- helpers -----------------------------------------------------------------

const CREATE_RESPONSE = {
  id: 'res001',
  namespace: 'public',
  link: 'https://brewpage.app/public/res001',
  ownerLink: 'https://brewpage.app/public/res001?owner=1',
  expiresAt: '2026-07-09T00:00:00Z',
  ownerToken: 'resp-token'
}

const UPDATE_RESPONSE = {
  id: 'res001',
  namespace: 'public',
  link: 'https://brewpage.app/public/res001',
  ownerLink: 'https://brewpage.app/public/res001?owner=1',
  expiresAt: '2026-07-09T00:00:00Z'
}

const MINT_RESPONSE = {
  token: 'minted-owner-token',
  ownerId: 'owner-001'
}

function galleryPage(items: object[], total: number): object {
  return { items, total, page: 0, size: 100 }
}

function makeResponse(ok: boolean, status: number, body: object): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response
}

function makeFetchMock(...responses: object[]): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn() as jest.MockedFunction<typeof fetch>
  for (const body of responses) {
    mock.mockResolvedValueOnce(makeResponse(true, 200, body))
  }
  return mock
}

function makeFetchMockWithResponse(...responses: Response[]): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn() as jest.MockedFunction<typeof fetch>
  for (const r of responses) {
    mock.mockResolvedValueOnce(r)
  }
  return mock
}

function setInputs(inputs: Record<string, string>): void {
  mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '')
}

// --- update-id + owner-token: skip discovery ---------------------------------

describe('run() - explicit update-id skips discovery', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN update-id and owner-token are both provided
  // WHEN run() is called
  // THEN fetch is called only once (PUT) with no gallery request

  it('calls PUT without a gallery fetch when update-id and owner-token are both set', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      'update-id': 'res001',
      namespace: 'public',
      'ttl-days': '15'
    })
    global.fetch = makeFetchMock(UPDATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/html\/public\/res001/)
    expect(init.method).toEqual('PUT')
  })
})

// --- mode=auto + discovery found -> PUT --------------------------------------

describe('run() - mode=auto with discovery found', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=auto, existing owner-token, gallery returns one matching html item
  // WHEN run() is called
  // THEN gallery is queried then PUT to /api/html/{ns}/{id}

  it('calls PUT /api/html/{ns}/{id} when discovery returns found for html kind', async () => {
    const galleryItem = { id: 'discovered-id', namespace: 'public', type: 'html' }
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([galleryItem], 1)),
      makeResponse(true, 200, UPDATE_RESPONSE)
    )

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [galleryUrl] = fetchMock.mock.calls[0] as [string]
    expect(galleryUrl).toContain('/api/gallery')
    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(putUrl).toMatch(/\/api\/html\/public\/discovered-id/)
    expect(putInit.method).toEqual('PUT')
  })

  it('calls PUT /api/sites/{ns}/{id} when discovery returns found for site kind', async () => {
    const galleryItem = { id: 'site-id', namespace: 'public', type: 'site' }
    setInputs({
      path: 'dist/',
      kind: 'site',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([galleryItem], 1)),
      makeResponse(true, 200, UPDATE_RESPONSE)
    )

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [putUrl, putInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(putUrl).toMatch(/\/api\/sites\/public\/site-id/)
    expect(putInit.method).toEqual('PUT')
  })
})

// --- mode=auto + discovery none/unavailable -> POST --------------------------

describe('run() - mode=auto with discovery none or unavailable falls back to POST', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=auto, existing owner-token, gallery returns no matching item
  // WHEN run() is called
  // THEN POST create is used

  it('calls POST /api/html when discovery returns none', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([], 0)),
      makeResponse(true, 200, CREATE_RESPONSE)
    )

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postUrl).toMatch(/\/api\/html/)
    expect(postInit.method).toEqual('POST')
  })

  it('calls POST /api/html when discovery returns unavailable (gallery 401)', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(false, 401, {}),
      makeResponse(true, 200, CREATE_RESPONSE)
    )

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postUrl).toMatch(/\/api\/html/)
    expect(postInit.method).toEqual('POST')
  })
})

// --- mode=auto + discovery ambiguous -> warning + POST -----------------------

describe('run() - mode=auto with discovery ambiguous', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=auto, gallery returns two matching items
  // WHEN run() is called
  // THEN core.warning is emitted and POST create is used

  it('emits core.warning and falls back to POST when discovery is ambiguous', async () => {
    const items = [
      { id: 'id1', namespace: 'public', type: 'html' },
      { id: 'id2', namespace: 'public', type: 'html' }
    ]
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage(items, 2)),
      makeResponse(true, 200, CREATE_RESPONSE)
    )

    await run()

    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('Multiple')
    )
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postUrl).toMatch(/\/api\/html/)
    expect(postInit.method).toEqual('POST')
  })
})

// --- mode=auto + file kind + discovery found -> warning + POST ---------------

describe('run() - mode=auto file kind is immutable', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=auto, file kind, discovery finds an existing file resource
  // WHEN run() is called
  // THEN core.warning about immutability is emitted and POST create is used

  it('emits immutability warning and calls POST when file kind discovery found', async () => {
    const galleryItem = { id: 'file-id', namespace: 'public', type: 'file' }
    setInputs({
      path: 'artifact.bin',
      kind: 'file',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([galleryItem], 1)),
      makeResponse(true, 200, CREATE_RESPONSE)
    )

    await run()

    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('immutable')
    )
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postUrl).toMatch(/\/api\/files/)
    expect(postInit.method).toEqual('POST')
  })
})

// --- mode=auto + freshly minted token -> skip discovery, POST ----------------

describe('run() - mode=auto with freshly minted token', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=auto, no owner-token input (token minted this run)
  // WHEN run() is called
  // THEN gallery is NOT queried (only mint + POST calls)

  it('skips gallery discovery and calls POST when owner-token is freshly minted', async () => {
    setInputs({
      path: 'report.html',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'auto'
    })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [mintUrl] = fetchMock.mock.calls[0] as [string]
    expect(mintUrl).toContain('/api/owner-token')

    const [postUrl, postInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(postUrl).toMatch(/\/api\/html/)
    expect(postInit.method).toEqual('POST')
  })
})

// --- mode=create always POSTs ------------------------------------------------

describe('run() - mode=create always POSTs', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=create and an owner-token that has existing resources
  // WHEN run() is called
  // THEN gallery is NOT queried and POST is used

  it('calls POST without gallery fetch when mode is create', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'create'
    })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/html/)
    expect(init.method).toEqual('POST')
  })
})

// --- mode=update + discovery none -> setFailed / warning ---------------------

describe('run() - mode=update with no resolvable id', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN mode=update, no update-id, discovery returns none
  // WHEN run() is called
  // THEN setFailed is called (fail-on-error default true)

  it('calls setFailed when mode=update discovery returns none and fail-on-error is default', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'update'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([], 0))
    )

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith(
      expect.stringContaining('mode=update requires an existing resource')
    )
  })

  // GIVEN mode=update, no update-id, discovery returns none, fail-on-error=false
  // WHEN run() is called
  // THEN warning is emitted instead of setFailed

  it('calls warning instead of setFailed when mode=update discovery none and fail-on-error is false', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'existing-tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'update',
      'fail-on-error': 'false'
    })
    global.fetch = makeFetchMockWithResponse(
      makeResponse(true, 200, galleryPage([], 0))
    )

    await run()

    expect(mockCore.setFailed).not.toHaveBeenCalled()
    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('mode=update requires an existing resource')
    )
  })
})

// --- summary action field ----------------------------------------------------

describe('run() - summary action field', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN a POST publish path
  // WHEN run() completes
  // THEN summary addRaw is called with text containing 'Created'

  it('summary uses "Created" heading text after POST create', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'tok',
      namespace: 'public',
      'ttl-days': '15',
      mode: 'create'
    })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const rawCalls = mockSummary.addRaw.mock.calls
    const createdCall = rawCalls.find(
      ([text]) => typeof text === 'string' && (text as string).includes('Created')
    )
    expect(createdCall).toBeDefined()
  })

  // GIVEN a PUT update path (update-id provided)
  // WHEN run() completes
  // THEN summary addRaw is called with text containing 'Updated'

  it('summary uses "Updated" heading text after PUT update', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'tok',
      'update-id': 'res001',
      namespace: 'public',
      'ttl-days': '15'
    })
    global.fetch = makeFetchMock(UPDATE_RESPONSE)

    await run()

    const rawCalls = mockSummary.addRaw.mock.calls
    const updatedCall = rawCalls.find(
      ([text]) => typeof text === 'string' && (text as string).includes('Updated')
    )
    expect(updatedCall).toBeDefined()
  })
})
