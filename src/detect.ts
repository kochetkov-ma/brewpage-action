import { statSync } from 'node:fs'

export type Kind = 'html' | 'markdown' | 'site' | 'file'

// Resolve the artefact kind. An explicit non-auto value wins; otherwise infer from
// the path: directories and .zip are sites, .html/.htm are html, .md/.markdown are
// markdown, everything else is a binary file.
export function detectKind(path: string, explicit: string): Kind {
  if (explicit && explicit !== 'auto') {
    return explicit as Kind
  }

  const lower = path.toLowerCase()
  if (lower.endsWith('.zip')) {
    return 'site'
  }
  if (isDirectory(path)) {
    return 'site'
  }
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'html'
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'markdown'
  }
  return 'file'
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// "owner/repo" of the running CI: GitHub-compatible GITHUB_REPOSITORY, else SourceCraft's REPO_URL.
export function repositoryFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const github = env.GITHUB_REPOSITORY?.trim()
  if (github) {
    return github
  }
  // Documented shape: https://git@git.sourcecraft.dev/<organization_slug>/<repository_slug>.git
  const match = env.SOURCECRAFT_REPO_URL?.trim().match(
    /([^/:]+)\/([^/]+?)(?:\.git)?\/?$/
  )
  return match ? `${match[1]}/${match[2]}` : undefined
}

// Stable namespace slug (^[a-z0-9-]{3,32}$) from "owner/repo"; undefined when nothing usable.
export function repoNamespace(
  repository: string | undefined
): string | undefined {
  const source = (repository ?? '').toLowerCase()
  let slug = source
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')

  if (slug.length === 0) {
    return undefined
  }
  if (slug.length > 32) {
    slug = slug.slice(0, 32).replace(/-+$/g, '')
  }
  while (slug.length < 3) {
    slug = `${slug}0`
  }
  return slug
}
