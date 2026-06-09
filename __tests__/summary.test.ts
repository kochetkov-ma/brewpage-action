import { jest } from '@jest/globals'

const mockSummary = {
  addHeading: jest.fn().mockReturnThis(),
  addLink: jest.fn().mockReturnThis(),
  addTable: jest.fn().mockReturnThis(),
  addRaw: jest.fn().mockReturnThis(),
  write: jest.fn(async () => undefined)
}

const mockCore = {
  summary: mockSummary
} as never

const { buildSummary } = await import('../src/summary.js')

describe('buildSummary', () => {
  describe('non-minted resource', () => {
    // GIVEN a completed publish with an existing token (minted = false)
    // WHEN buildSummary is called
    // THEN the heading, live URL link, and metadata table are written but no persist-token notice

    it('writes heading and live URL link', async () => {
      const data = {
        link: 'https://brewpage.app/public/abc123',
        ownerLink: 'https://brewpage.app/public/abc123?owner=1',
        id: 'abc123',
        namespace: 'public',
        expiresAt: '2026-06-24T00:00:00Z',
        ownerToken: 'secret-token',
        minted: false
      }

      await buildSummary(mockCore, data)

      expect(mockSummary.addHeading).toHaveBeenCalledWith('Published to BrewPage', 2)
      expect(mockSummary.addLink).toHaveBeenCalledWith(data.link, data.link)
    })

    it('writes metadata table with id, namespace, ownerLink and expiresAt', async () => {
      const data = {
        link: 'https://brewpage.app/public/abc123',
        ownerLink: 'https://brewpage.app/public/abc123?owner=1',
        id: 'abc123',
        namespace: 'my-ns',
        expiresAt: '2026-06-24T00:00:00Z',
        ownerToken: 'secret-token',
        minted: false
      }

      await buildSummary(mockCore, data)

      expect(mockSummary.addTable).toHaveBeenCalledWith([
        [
          { data: 'Field', header: true },
          { data: 'Value', header: true }
        ],
        ['Id', 'abc123'],
        ['Namespace', 'my-ns'],
        ['Owner URL', 'https://brewpage.app/public/abc123?owner=1'],
        ['Expires at', '2026-06-24T00:00:00Z']
      ])
    })

    it('writes n/a for expiresAt when undefined', async () => {
      const data = {
        link: 'https://brewpage.app/public/abc123',
        ownerLink: 'https://brewpage.app/public/abc123?owner=1',
        id: 'abc123',
        namespace: 'public',
        expiresAt: undefined,
        ownerToken: 'secret-token',
        minted: false
      }

      await buildSummary(mockCore, data)

      expect(mockSummary.addTable).toHaveBeenCalledWith(
        expect.arrayContaining([['Expires at', 'n/a']])
      )
    })

    it('does not write the persist-token notice when minted is false', async () => {
      const data = {
        link: 'https://brewpage.app/public/abc123',
        ownerLink: 'https://brewpage.app/public/abc123?owner=1',
        id: 'abc123',
        namespace: 'public',
        ownerToken: 'secret-token',
        minted: false
      }

      await buildSummary(mockCore, data)

      const rawCalls = mockSummary.addRaw.mock.calls
      const persistNoticePresent = rawCalls.some(
        ([text]) => typeof text === 'string' && text.includes('[!IMPORTANT]')
      )
      expect(persistNoticePresent).toEqual(false)
    })

    it('writes the brewpage.app powered-by link', async () => {
      const data = {
        link: 'https://brewpage.app/public/abc123',
        ownerLink: 'https://brewpage.app/public/abc123?owner=1',
        id: 'abc123',
        namespace: 'public',
        ownerToken: 'secret-token',
        minted: false
      }

      await buildSummary(mockCore, data)

      expect(mockSummary.addLink).toHaveBeenCalledWith('https://brewpage.app', 'https://brewpage.app')
    })
  })

  describe('minted token resource', () => {
    // GIVEN a fresh publish where the owner token was minted by the action
    // WHEN buildSummary is called with minted = true
    // THEN the persist-token IMPORTANT notice is written

    it('writes the persist-token notice when minted is true', async () => {
      const data = {
        link: 'https://brewpage.app/public/xyz789',
        ownerLink: 'https://brewpage.app/public/xyz789?owner=1',
        id: 'xyz789',
        namespace: 'public',
        ownerToken: 'fresh-minted-token',
        minted: true
      }

      await buildSummary(mockCore, data)

      const rawCalls = mockSummary.addRaw.mock.calls
      const persistNoticeCall = rawCalls.find(
        ([text]) => typeof text === 'string' && text.includes('[!IMPORTANT]')
      )
      expect(persistNoticeCall).toBeDefined()
      const [text] = persistNoticeCall as [string, boolean]
      expect(text).toMatch(/owner-token/)
      expect(text).toMatch(/BREWPAGE_OWNER_TOKEN/)
    })
  })
})
