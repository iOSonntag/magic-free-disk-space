import { buildReleasePageUrl } from '../update/githubRelease.js';
import { formatReleaseVersion } from '../update/releaseVersion.js';
import type { UpdateCheckOutcome } from '../update/runUpdateCheck.js';
import type { LinkView } from './noticeView.js';
import type { ReportTexts } from './reportTexts.js';

/** The notice of a newer release, with the link to its download page. */
export type UpdateNoticeView = { titleText: string; lines: string[]; downloadLink: LinkView };

/** A notice only when a newer release exists; every other outcome stays silent. */
export function buildUpdateNotice(params: {
  outcome: UpdateCheckOutcome;
  texts: ReportTexts;
}): UpdateNoticeView | null {
  const outcome = params.outcome;

  switch (outcome.kind) {
    case 'off':
    case 'unversioned':
    case 'current':
    case 'failed':
      return null;
    case 'newer': {
      const releasePageUrl = buildReleasePageUrl(outcome.latest);

      return {
        titleText: `Version ${formatReleaseVersion(outcome.latest)} is available`,
        lines: [
          `You have version ${formatReleaseVersion(outcome.current)}.`,
          params.texts.updateInstallText,
        ],
        downloadLink: {
          labelText: 'Open the download page',
          url: releasePageUrl,
          failedText: `The browser did not open. The download page is ${releasePageUrl}.`,
        },
      };
    }
  }
}
