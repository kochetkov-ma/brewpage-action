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

// --- import after mocks are set up -------------------------------------------

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

function makeFetchMock(...responses: object[]): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn() as jest.MockedFunction<typeof fetch>
  for (const body of responses) {
    mock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body)
    } as Response)
  }
  return mock
}

function setInputs(inputs: Record<string, string>): void {
  mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '')
}

// --- module smoke test -------------------------------------------------------

describe('main module', () => {
  // GIVEN the bundled entrypoint module
  // WHEN it is imported under jest (JEST_WORKER_ID set)
  // THEN run() is exported as a function and is not auto-invoked

  it('exports run() without auto-invoking it', () => {
    expect(typeof run).toEqual('function')
  })
})

// --- mint path ---------------------------------------------------------------

describe('run() - mint path', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN owner-token input is empty
  // WHEN run() is called
  // THEN fetch GET /api/owner-token is called and the minted token is registered as secret

  it('calls GET /api/owner-token when owner-token input is empty', async () => {
    setInputs({ path: 'report.html', 'ttl-days': '15' })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    const firstCall = (global.fetch as jest.MockedFunction<typeof fetch>).mock.calls[0]
    const url = firstCall[0] as string
    const init = firstCall[1] as RequestInit
    expect(url).toMatch(/\/api\/owner-token/)
    expect(init.method).toEqual('GET')
  })

  it('calls core.setSecret with the minted token', async () => {
    setInputs({ path: 'report.html', 'ttl-days': '15' })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    expect(mockCore.setSecret).toHaveBeenCalledWith('minted-owner-token')
  })
})

// --- masking order -----------------------------------------------------------

describe('run() - masking order', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN a fresh publish that mints a token
  // WHEN run() completes
  // THEN core.setSecret is invoked strictly before core.setOutput('owner-token', ...)
  // AND strictly before core.summary.write()

  it('setSecret invocation order is before setOutput owner-token', async () => {
    setInputs({ path: 'report.html', 'ttl-days': '15' })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    const setSecretOrder = mockCore.setSecret.mock.invocationCallOrder[0]
    const ownerTokenOutputOrder = mockCore.setOutput.mock.calls
      .map((call, idx) => ({ name: call[0] as string, order: mockCore.setOutput.mock.invocationCallOrder[idx] }))
      .find(c => c.name === 'owner-token')

    expect(ownerTokenOutputOrder).toBeDefined()
    expect(setSecretOrder).toBeLessThan(ownerTokenOutputOrder!.order)
  })

  it('setSecret invocation order is before summary.write', async () => {
    setInputs({ path: 'report.html', 'ttl-days': '15' })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    const setSecretOrder = mockCore.setSecret.mock.invocationCallOrder[0]
    const writeOrder = mockSummary.write.mock.invocationCallOrder[0]

    expect(setSecretOrder).toBeLessThan(writeOrder)
  })

  it('setSecret is called even when owner-token input is provided', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'provided-token', 'ttl-days': '15' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    expect(mockCore.setSecret).toHaveBeenCalledWith('provided-token')
  })
})

// --- create vs update routing ------------------------------------------------

describe('run() - routing: create (POST)', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN no update-id in inputs
  // WHEN run() is called with an html path
  // THEN POST /api/html is called

  it('calls POST /api/html for html kind without update-id', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/html/)
    expect(init.method).toEqual('POST')
  })

  it('calls POST /api/sites for site kind without update-id', async () => {
    setInputs({ path: 'dist/', 'kind': 'site', 'owner-token': 'tok', 'ttl-days': '15', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/sites/)
    expect(init.method).toEqual('POST')
  })

  it('calls POST /api/files for file kind without update-id', async () => {
    setInputs({ path: 'artifact.bin', 'kind': 'file', 'owner-token': 'tok', 'ttl-days': '15', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/files/)
    expect(init.method).toEqual('POST')
  })
})

describe('run() - routing: update (PUT)', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN owner-token and update-id are both present
  // WHEN run() is called
  // THEN PUT endpoint is hit with the {ns}/{id} URL pattern

  it('calls PUT /api/html/{ns}/{id} for html kind with update-id', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'tok',
      'update-id': 'res001',
      namespace: 'my-ns',
      'ttl-days': '15'
    })
    global.fetch = makeFetchMock(UPDATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/html\/my-ns\/res001/)
    expect(init.method).toEqual('PUT')
  })

  it('calls PUT /api/sites/{ns}/{id} for site kind with update-id', async () => {
    setInputs({
      path: 'dist/',
      kind: 'site',
      'owner-token': 'tok',
      'update-id': 'res001',
      namespace: 'my-ns',
      'ttl-days': '15'
    })
    global.fetch = makeFetchMock(UPDATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/sites\/my-ns\/res001/)
    expect(init.method).toEqual('PUT')
  })

  it('warns and calls POST /api/files when file kind has update-id (files are immutable)', async () => {
    setInputs({
      path: 'artifact.bin',
      kind: 'file',
      'owner-token': 'tok',
      'update-id': 'res001',
      namespace: 'my-ns',
      'ttl-days': '15'
    })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    expect(mockCore.warning).toHaveBeenCalledWith(
      expect.stringContaining('files are immutable')
    )
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/\/api\/files/)
    expect(init.method).toEqual('POST')
  })
})

// --- outputs -----------------------------------------------------------------

describe('run() - outputs', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN a successful publish returning CreateResponse
  // WHEN run() completes
  // THEN setOutput is called for all 6 output keys with values from the response

  it('sets all required outputs from the API response', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', namespace: 'public', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    expect(mockCore.setOutput).toHaveBeenCalledWith('url', CREATE_RESPONSE.link)
    expect(mockCore.setOutput).toHaveBeenCalledWith('owner-url', CREATE_RESPONSE.ownerLink)
    expect(mockCore.setOutput).toHaveBeenCalledWith('owner-token', 'tok')
    expect(mockCore.setOutput).toHaveBeenCalledWith('id', CREATE_RESPONSE.id)
    expect(mockCore.setOutput).toHaveBeenCalledWith('namespace', CREATE_RESPONSE.namespace)
    expect(mockCore.setOutput).toHaveBeenCalledWith('expires-at', CREATE_RESPONSE.expiresAt)
  })

  it('sets expires-at to empty string when expiresAt is absent in response', async () => {
    const responseWithoutExpiry = {
      id: 'res002',
      namespace: 'public',
      link: 'https://brewpage.app/public/res002',
      ownerLink: 'https://brewpage.app/public/res002?owner=1'
    }
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', namespace: 'public', mode: 'create' })
    global.fetch = makeFetchMock(responseWithoutExpiry)

    await run()

    expect(mockCore.setOutput).toHaveBeenCalledWith('expires-at', '')
  })
})

// --- summary content ---------------------------------------------------------

describe('run() - summary content', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN a successful publish
  // WHEN run() completes
  // THEN summary.addLink is called with the live URL

  it('adds the live URL to the summary', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', namespace: 'public', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    expect(mockSummary.addLink).toHaveBeenCalledWith(CREATE_RESPONSE.link, CREATE_RESPONSE.link)
  })

  // GIVEN owner-token input is empty (minted)
  // WHEN run() completes
  // THEN summary includes the persist-token notice via addRaw

  it('adds persist-token notice to summary when token was minted', async () => {
    setInputs({ path: 'report.html', 'ttl-days': '15', namespace: 'public' })
    global.fetch = makeFetchMock(MINT_RESPONSE, CREATE_RESPONSE)

    await run()

    const rawCalls = mockSummary.addRaw.mock.calls
    const persistNoticeCall = rawCalls.find(
      ([text]) => typeof text === 'string' && (text as string).includes('[!IMPORTANT]')
    )
    expect(persistNoticeCall).toBeDefined()
  })

  it('does not add persist-token notice when owner-token was provided by caller', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', namespace: 'public', mode: 'create' })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const rawCalls = mockSummary.addRaw.mock.calls
    const persistNoticePresent = rawCalls.some(
      ([text]) => typeof text === 'string' && (text as string).includes('[!IMPORTANT]')
    )
    expect(persistNoticePresent).toEqual(false)
  })
})

// --- fail-on-error -----------------------------------------------------------

describe('run() - fail-on-error', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN fetch throws and fail-on-error is not false
  // WHEN run() completes
  // THEN core.setFailed is called with the error message

  it('calls setFailed when fetch throws and fail-on-error is default', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', mode: 'create' })
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    fetchMock.mockRejectedValueOnce(new Error('network error'))
    global.fetch = fetchMock

    await run()

    expect(mockCore.setFailed).toHaveBeenCalledWith('network error')
  })

  it('calls warning instead of setFailed when fail-on-error is false', async () => {
    setInputs({ path: 'report.html', 'owner-token': 'tok', 'ttl-days': '15', 'fail-on-error': 'false', mode: 'create' })
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    fetchMock.mockRejectedValueOnce(new Error('network error'))
    global.fetch = fetchMock

    await run()

    expect(mockCore.setFailed).not.toHaveBeenCalled()
    expect(mockCore.warning).toHaveBeenCalledWith('network error')
  })
})

// --- base URL override -------------------------------------------------------

describe('run() - brewpage-url override', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'kochetkov-ma/brewpage-action'
  })

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY
  })

  // GIVEN brewpage-url input is set to a custom base
  // WHEN run() is called
  // THEN fetch URL uses the custom base

  it('uses custom brewpage-url as the base for API calls', async () => {
    setInputs({
      path: 'report.html',
      'owner-token': 'tok',
      'ttl-days': '15',
      mode: 'create',
      'brewpage-url': 'https://staging.brewpage.app'
    })
    global.fetch = makeFetchMock(CREATE_RESPONSE)

    await run()

    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toMatch(/^https:\/\/staging\.brewpage\.app/)
  })
})
