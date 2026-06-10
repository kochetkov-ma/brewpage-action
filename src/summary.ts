import type * as core from '@actions/core'

export interface SummaryData {
  link: string
  ownerLink: string
  id: string
  namespace: string
  expiresAt?: string
  ownerToken: string
  minted: boolean
  action: 'created' | 'updated'
}

// Render the job summary to $GITHUB_STEP_SUMMARY: the live URL, resource metadata,
// and a prominent persist-the-token notice when a fresh owner token was minted.
export async function buildSummary(
  coreModule: typeof core,
  data: SummaryData
): Promise<void> {
  const summary = coreModule.summary

  const headline =
    data.action === 'updated'
      ? 'Updated existing resource on BrewPage'
      : 'Created resource on BrewPage'

  summary.addHeading('Published to BrewPage', 2)
  summary.addRaw(headline, true)
  summary.addLink(data.link, data.link)

  summary.addTable([
    [
      { data: 'Field', header: true },
      { data: 'Value', header: true }
    ],
    ['Id', data.id],
    ['Namespace', data.namespace],
    ['Owner URL', data.ownerLink],
    ['Expires at', data.expiresAt ?? 'n/a']
  ])

  if (data.minted) {
    summary.addRaw(
      [
        '> [!IMPORTANT]',
        '> A new owner token was minted for this resource. It is the only credential',
        '> that can update, republish, or delete it -- a lost token cannot be recovered.',
        '> Copy it from the `owner-token` step output and store it as a repository secret',
        '> (e.g. `BREWPAGE_OWNER_TOKEN`), then pass it back via the `owner-token` input on',
        '> redeploys. The token value itself is masked in logs and is not printed here.'
      ].join('\n'),
      true
    )
  }

  summary.addRaw('Powered by ', false)
  summary.addLink('https://brewpage.app', 'https://brewpage.app')

  await summary.write()
}
