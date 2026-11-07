import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings, ExploreUnit } from '../exploreUnit.js';
import type { HuggingFaceRepoOffer } from './decideHuggingFaceRepoOffers.js';
import { decideHuggingFaceRepoOffers } from './decideHuggingFaceRepoOffers.js';
import type { HuggingFaceRepoState } from './loadHuggingFaceHubState.js';

/** The singular noun of each repository type, the first part of its folder's name. */
const REPO_TYPE_NOUNS: Record<string, string> = {
  models: 'model',
  datasets: 'dataset',
  spaces: 'space',
  kernels: 'kernel',
};

/**
 * Offers each repository's current revisions, its detached ones, and its stale partial blobs.
 * Not complete when a repository's current revisions cannot be told.
 */
export function buildHuggingFaceRepoFindings(params: {
  repos: HuggingFaceRepoState[];
  partialCutoffMs: number;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const judgedRepos = params.repos.map((repo) => ({
    repo: repo,
    offers: decideHuggingFaceRepoOffers({ repo: repo, partialCutoffMs: params.partialCutoffMs }),
  }));
  const findings = judgedRepos.flatMap((judgedRepo) =>
    judgedRepo.offers.offers.map((offer) =>
      buildHuggingFaceRepoFinding({
        repo: judgedRepo.repo,
        offer: offer,
        processCommands: params.processCommands,
      }),
    ),
  );

  return {
    findings: findings,
    isComplete: judgedRepos.every((judgedRepo) => judgedRepo.offers.isJudged),
  };
}

/** `<owner>/<name>` with the type's noun, from a folder named `<type>s--<owner>--<name>`. */
export function formatHuggingFaceRepoName(params: { folderName: string }): string {
  const [type = '', ...nameParts] = params.folderName.split('--');

  return `${REPO_TYPE_NOUNS[type] ?? type} ${nameParts.join('/')}`;
}

function buildHuggingFaceRepoFinding(params: {
  repo: HuggingFaceRepoState;
  offer: HuggingFaceRepoOffer;
  processCommands: string[] | null;
}): ExploreFinding {
  const repoName = formatHuggingFaceRepoName({ folderName: params.repo.folderName });
  const activity = decideUnitActivity({
    facts: { kind: 'huggingFace' },
    processCommands: params.processCommands,
  });

  switch (params.offer.kind) {
    case 'huggingFaceRepository':
      return {
        unit: buildRepoUnit({ repo: params.repo, offer: params.offer }),
        title: `Hugging Face ${repoName}`,
        explanation:
          'A repository the Hugging Face libraries downloaded for a program, with the files of its current revisions.',
        regeneration: 'The Hugging Face libraries download it again when a program loads it.',
        risk: 'review',
        evidenceLines: [
          `Its refs name ${params.offer.revisionCount} downloaded revisions.`,
          'Files in the shared Xet store stay.',
        ],
        displayPath: params.repo.repoPath,
        activity: activity,
      };
    case 'huggingFaceDetachedRevisions':
      return {
        unit: buildRepoUnit({ repo: params.repo, offer: params.offer }),
        title: `Old revisions of Hugging Face ${repoName}`,
        explanation:
          'Revisions no branch or tag of the repository names any longer, with the files only they use.',
        regeneration: 'Downloaded again only if a program asks for one of these exact revisions.',
        risk: 'safe',
        evidenceLines: [
          `No ref names ${params.offer.revisions.length} of its downloaded revisions.`,
          'Files a current revision uses stay.',
        ],
        displayPath: params.repo.repoPath,
        activity: activity,
      };
    case 'huggingFacePartialDownloads':
      return {
        unit: buildRepoUnit({ repo: params.repo, offer: params.offer }),
        title: `Unfinished downloads of Hugging Face ${repoName}`,
        explanation: 'Files a download started and left unfinished, untouched for a day.',
        regeneration: 'A new download of the file starts it again.',
        risk: 'safe',
        evidenceLines: [`${params.offer.paths.length} unfinished files, untouched for a day.`],
        displayPath: params.repo.repoPath,
        activity: activity,
      };
  }
}

function buildRepoUnit(params: {
  repo: HuggingFaceRepoState;
  offer: HuggingFaceRepoOffer;
}): ExploreUnit {
  switch (params.offer.kind) {
    case 'huggingFaceRepository':
      return {
        kind: 'huggingFaceRepository',
        repoPath: params.repo.repoPath,
        downloadedAtMs: params.offer.downloadedAtMs,
        foundPaths: params.offer.paths,
      };
    case 'huggingFaceDetachedRevisions':
      return {
        kind: 'huggingFaceDetachedRevisions',
        repoPath: params.repo.repoPath,
        revisions: params.offer.revisions,
        downloadedAtMs: params.offer.downloadedAtMs,
        foundPaths: params.offer.paths,
      };
    case 'huggingFacePartialDownloads':
      return {
        kind: 'huggingFacePartialDownloads',
        repoPath: params.repo.repoPath,
        foundPaths: params.offer.paths,
      };
  }
}
