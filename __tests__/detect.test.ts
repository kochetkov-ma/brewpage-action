import { jest } from '@jest/globals'

jest.unstable_mockModule('node:fs', () => ({
  statSync: jest.fn()
}))

const { statSync } = await import('node:fs')
const { detectKind, repoNamespace } = await import('../src/detect.js')

const mockStatSync = statSync as jest.MockedFunction<typeof statSync>

describe('detectKind', () => {
  describe('explicit non-auto passthrough', () => {
    // GIVEN an explicit kind that is not "auto"
    // WHEN detectKind is called
    // THEN the explicit kind is returned unchanged without touching the path

    it('returns html when explicit is html', () => {
      const result = detectKind('anything.zip', 'html')
      expect(result).toEqual('html')
    })

    it('returns markdown when explicit is markdown', () => {
      const result = detectKind('anything.zip', 'markdown')
      expect(result).toEqual('markdown')
    })

    it('returns site when explicit is site', () => {
      const result = detectKind('report.html', 'site')
      expect(result).toEqual('site')
    })

    it('returns file when explicit is file', () => {
      const result = detectKind('report.html', 'file')
      expect(result).toEqual('file')
    })
  })

  describe('auto inference - directory', () => {
    // GIVEN a path that resolves to a directory
    // WHEN detectKind is called with auto
    // THEN kind is site

    it('returns site when path is a directory', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>)

      const result = detectKind('/some/dir', 'auto')

      expect(result).toEqual('site')
    })
  })

  describe('auto inference - zip', () => {
    // GIVEN a .zip file path
    // WHEN detectKind is called with auto
    // THEN kind is site (zip check precedes stat call)

    it('returns site for .zip extension (lowercase)', () => {
      const result = detectKind('report.zip', 'auto')
      expect(result).toEqual('site')
    })

    it('returns site for .ZIP extension (uppercase)', () => {
      const result = detectKind('report.ZIP', 'auto')
      expect(result).toEqual('site')
    })
  })

  describe('auto inference - html', () => {
    // GIVEN a .html or .htm file path where stat returns non-directory
    // WHEN detectKind is called with auto
    // THEN kind is html

    it('returns html for .html extension', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('index.html', 'auto')

      expect(result).toEqual('html')
    })

    it('returns html for .htm extension', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('index.htm', 'auto')

      expect(result).toEqual('html')
    })

    it('returns html for .HTML extension (uppercase)', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('INDEX.HTML', 'auto')

      expect(result).toEqual('html')
    })
  })

  describe('auto inference - markdown', () => {
    // GIVEN a .md or .markdown file path
    // WHEN detectKind is called with auto
    // THEN kind is markdown

    it('returns markdown for .md extension', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('README.md', 'auto')

      expect(result).toEqual('markdown')
    })

    it('returns markdown for .markdown extension', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('doc.markdown', 'auto')

      expect(result).toEqual('markdown')
    })
  })

  describe('auto inference - fallback file', () => {
    // GIVEN a path with an unrecognised extension and stat returns non-directory
    // WHEN detectKind is called with auto
    // THEN kind is file

    it('returns file for unrecognised extension', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('artifact.tar.gz', 'auto')

      expect(result).toEqual('file')
    })

    it('returns file for extension-less path that is not a directory', () => {
      mockStatSync.mockReturnValue({ isDirectory: () => false } as ReturnType<typeof statSync>)

      const result = detectKind('somebinary', 'auto')

      expect(result).toEqual('file')
    })
  })
})

describe('repoNamespace', () => {
  describe('derivation from owner/repo', () => {
    // GIVEN a standard GitHub repository string "owner/repo"
    // WHEN repoNamespace is called
    // THEN the result is a deterministic slug within ^[a-z0-9-]{3,32}$

    it('converts owner/repo to lowercase-dash slug', () => {
      const result = repoNamespace('octocat/Hello-World')
      expect(result).toEqual('octocat-hello-world')
    })

    it('is deterministic for the same input', () => {
      const first = repoNamespace('kochetkov-ma/brewpage-action')
      const second = repoNamespace('kochetkov-ma/brewpage-action')
      expect(first).toEqual('kochetkov-ma-brewpage-action')
      expect(second).toEqual('kochetkov-ma-brewpage-action')
    })
  })

  describe('sanitization', () => {
    // GIVEN repository strings with invalid characters or boundary violations
    // WHEN repoNamespace is called
    // THEN the result conforms to ^[a-z0-9-]{3,32}$

    it('lowercases uppercase characters', () => {
      const result = repoNamespace('OWNER/REPO')
      expect(result).toEqual('owner-repo')
    })

    it('replaces invalid characters with dashes', () => {
      const result = repoNamespace('my.owner/my_repo')
      expect(result).toEqual('my-owner-my-repo')
    })

    it('collapses consecutive invalid chars into a single dash', () => {
      const result = repoNamespace('my--owner/re___po')
      expect(result).toEqual('my-owner-re-po')
    })

    it('trims to 32 characters maximum and strips trailing dashes', () => {
      const longSlug = repoNamespace('organization/some-very-long-repository-name-exceeding-limit')
      expect(longSlug.length).toEqual(32)
      expect(longSlug).toEqual('organization-some-very-long-repo')
    })

    it('pads to at least 3 characters when slug is too short', () => {
      const result = repoNamespace('a/b')
      expect(result).toEqual('a-b')
    })

    it('pads with zeros when derived slug is shorter than 3 chars', () => {
      const result = repoNamespace('x/y')
      expect(result).toEqual('x-y')
    })

    it('handles undefined input without throwing', () => {
      const result = repoNamespace(undefined)
      expect(result).toEqual('000')
    })

    it('handles empty string without throwing', () => {
      const result = repoNamespace('')
      expect(result).toEqual('000')
    })

    it('produces slug matching ^[a-z0-9-]{3,32}$ for standard repo', () => {
      const result = repoNamespace('kochetkov-ma/brewpage-action')
      expect(result).toMatch(/^[a-z0-9-]{3,32}$/)
    })
  })
})
