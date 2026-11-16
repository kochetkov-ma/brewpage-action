import { jest } from '@jest/globals'

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
jest.unstable_mockModule('node:fs', () => ({
  statSync: jest.fn(() => ({ isDirectory: () => false }))
}))
jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn(async () => Buffer.from('<h1>hello</h1>')),
  readdir: jest.fn(async () => [])
}))

const { run } = await import('../src/main.js')

const RUNNER_KEYS = [
  'GITHUB_REPOSITORY',
  'GITHUB_STEP_SUMMARY',
  'GITHUB_OUTPUT',
  'SOURCECRAFT_REPO_URL',
  'SOURCECRAFT_CI',
  'GITVERSE_OUTPUT'
]

const CREATED = {
  id: 'res001',
  namespace: 'srv-ns',
  link: 'https://brewpage.app/srv-ns/res001',
  ownerLink: 'https://brewpage.app/srv-ns/res001?owner=1',
  expiresAt: '2026-12-01T00:00:00Z'
}

function okResponse(body: object): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response
}

interface Observed {
  failed: unknown[][]
  createNs: string | null
  summaryWrites: number
  urlOutput: unknown
  notices: number
}

async function publishWith(
  env: Record<string, string>,
  inputs: Record<string, string>
): Promise<Observed> {
  for (const key of RUNNER_KEYS) {
    delete process.env[key]
  }
  Object.assign(process.env, env)
  mockCore.getInput.mockImplementation((name: string) => inputs[name] ?? '')
  const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
  fetchMock
    .mockResolvedValueOnce(okResponse({ token: 'minted', ownerId: 'o1' }))
    .mockResolvedValueOnce(okResponse(CREATED))
  global.fetch = fetchMock

  await run()

  const createUrl = new URL(fetchMock.mock.calls[1][0] as string)
  return {
    failed: mockCore.setFailed.mock.calls,
    createNs: createUrl.searchParams.get('ns'),
    summaryWrites: mockSummary.write.mock.calls.length,
    urlOutput: mockCore.setOutput.mock.calls.find((c) => c[0] === 'url')?.[1],
    notices: mockCore.notice.mock.calls.length
  }
}

afterEach(() => {
  for (const key of RUNNER_KEYS) {
    delete process.env[key]
  }
})

describe('run() - runner environment shapes', () => {
  // GIVEN the env a GitHub, SourceCraft, GitVerse or bare runner provides and a minted token
  // WHEN an HTML report is published with no namespace input
  // THEN the step succeeds, ns comes from the runner's repository (else is omitted), summary only with a summary file
  it.each([
    [
      'github',
      {
        GITHUB_REPOSITORY: 'kochetkov-ma/brewpage-action',
        GITHUB_STEP_SUMMARY: 'summary.md',
        GITHUB_OUTPUT: 'out.txt'
      },
      {
        failed: [],
        createNs: 'kochetkov-ma-brewpage-action',
        summaryWrites: 1,
        urlOutput: CREATED.link,
        notices: 0
      }
    ],
    [
      'sourcecraft',
      {
        SOURCECRAFT_CI: 'true',
        SOURCECRAFT_REPO_URL:
          'https://git@git.sourcecraft.dev/my-org/reports.git'
      },
      {
        failed: [],
        createNs: 'my-org-reports',
        summaryWrites: 0,
        urlOutput: CREATED.link,
        notices: 1
      }
    ],
    [
      'gitverse',
      { GITVERSE_OUTPUT: 'out.txt' },
      {
        failed: [],
        createNs: null,
        summaryWrites: 0,
        urlOutput: CREATED.link,
        notices: 1
      }
    ],
    [
      'bare',
      {},
      {
        failed: [],
        createNs: null,
        summaryWrites: 0,
        urlOutput: CREATED.link,
        notices: 1
      }
    ]
  ])('%s', async (_name, env, expected) => {
    const observed = await publishWith(env, { path: 'report.html' })

    expect(observed).toEqual(expected)
  })

  // GIVEN a runner without a repository slug and a persisted token
  // WHEN mode=update has no namespace to update in
  // THEN the step fails with an actionable message before any publish request
  it('fails mode=update without a namespace', async () => {
    for (const key of RUNNER_KEYS) {
      delete process.env[key]
    }
    mockCore.getInput.mockImplementation(
      (name: string) =>
        ({ path: 'report.html', mode: 'update', 'owner-token': 'tok' })[name] ??
        ''
    )
    const fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>
    global.fetch = fetchMock

    await run()

    expect({
      failed: mockCore.setFailed.mock.calls,
      requests: fetchMock.mock.calls.length
    }).toEqual({
      failed: [
        [
          'Updating needs a namespace, but none was given and the CI environment has no repository slug ' +
            '(GITHUB_REPOSITORY or SOURCECRAFT_REPO_URL): set the namespace input.'
        ]
      ],
      requests: 0
    })
  })
})
