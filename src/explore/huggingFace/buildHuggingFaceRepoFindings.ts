import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings, ExploreUnit } from '../exploreUnit.js';
import { formatDaySpan } from '../formatLimitTexts.js';
import type { HuggingFaceRepoOffer } from './decideHuggingFaceRepoOffers.js';
import {
  decideHuggingFaceRepoOffers,
  HUGGING_FACE_PARTIAL_UNTOUCHED_MS,
} from './decideHuggingFaceRepoOffers.js';
import type { HuggingFaceRepoState } from './loadHuggingFaceHubState.js';
import type { HuggingFaceRepoName } from './parseHuggingFaceRepoFolderName.js';

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
        partialCutoffMs: params.partialCutoffMs,
        processCommands: params.processCommands,
      }),
    ),
  );

  return {
    findings: findings,
    isComplete: judgedRepos.every((judgedRepo) => judgedRepo.offers.isJudged),
  };
}

/** The repository's id with its type's noun, such as `model example-org/example-model`. */
export function formatHuggingFaceRepoName(params: { name: HuggingFaceRepoName }): string {
  return `${params.name.repoType} ${params.name.repoId}`;
}

function buildHuggingFaceRepoFinding(params: {
  repo: HuggingFaceRepoState;
  offer: HuggingFaceRepoOffer;
  partialCutoffMs: number;
  processCommands: string[] | null;
}): ExploreFinding {
  const repoName = formatHuggingFaceRepoName({ name: params.repo.name });
  const activity = decideUnitActivity({
    facts: { kind: 'huggingFace' },
    processCommands: params.processCommands,
  });

  switch (params.offer.kind) {
    case 'huggingFaceRepository':
      return {
        unit: buildRepoUnit({
          repo: params.repo,
          offer: params.offer,
          partialCutoffMs: params.partialCutoffMs,
        }),
        title: `Hugging Face ${repoName}`,
        explanation:
          'A repository the Hugging Face libraries downloaded for a program, with the files of its current revisions.',
        regeneration: 'The Hugging Face libraries download it again when a program loads it.',
        risk: 'review',
        evidenceLines: [
          `Its refs name ${params.offer.revisionCount === 1 ? '1 downloaded revision' : `${params.offer.revisionCount} downloaded revisions`}.`,
          ...formatLinkedBlobLines({ linkedBlobCount: params.repo.linkedBlobCount }),
        ],
        displayPath: params.repo.repoPath,
        activity: activity,
      };
    case 'huggingFaceDetachedRevisions':
      return {
        unit: buildRepoUnit({
          repo: params.repo,
          offer: params.offer,
          partialCutoffMs: params.partialCutoffMs,
        }),
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
    case 'huggingFacePartialDownloads': {
      const untouchedSpan = formatDaySpan(HUGGING_FACE_PARTIAL_UNTOUCHED_MS);

      return {
        unit: buildRepoUnit({
          repo: params.repo,
          offer: params.offer,
          partialCutoffMs: params.partialCutoffMs,
        }),
        title: `Unfinished downloads of Hugging Face ${repoName}`,
        explanation: `Files a download started and left unfinished, untouched for ${untouchedSpan}.`,
        regeneration: 'A new download of the file starts it again.',
        risk: 'safe',
        evidenceLines: [
          `${params.offer.paths.length} unfinished files, untouched for ${untouchedSpan}.`,
        ],
        displayPath: params.repo.repoPath,
        activity: activity,
      };
    }
  }
}

/** Says that the files the repository only links stay, so its offer frees less than they take. */
function formatLinkedBlobLines(params: { linkedBlobCount: number }): string[] {
  if (params.linkedBlobCount === 0) {
    return [];
  }

  const files =
    params.linkedBlobCount === 1
      ? '1 of its files is a link to a copy that stays, such as one'
      : `${params.linkedBlobCount} of its files are links to copies that stay, such as those`;

  return [`${files} the hub cache shares across repositories.`];
}

function buildRepoUnit(params: {
  repo: HuggingFaceRepoState;
  offer: HuggingFaceRepoOffer;
  partialCutoffMs: number;
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
        cutoffMs: params.partialCutoffMs,
        foundPaths: params.offer.paths,
      };
  }
}
