import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { ProjectPinFileText, ProjectPins } from '../projectPins/projectPins.js';
import {
  buildProjectSearchEvidence,
  PINNED_VERSION_REINSTALL_EXPLANATION,
} from '../projectPins/selectToolPins.js';
import type { AndroidPlatformOffers } from './decideAndroidPlatformOffers.js';

/**
 * One finding for each offered platform folder, keeping the Gradle files it was judged by as its
 * pin files; complete exactly when the offers are.
 */
export function buildAndroidPlatformFindings(params: {
  offers: AndroidPlatformOffers;
  gradleFiles: ProjectPinFileText[];
  projectPins: ProjectPins;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const activity = decideUnitActivity({
    facts: { kind: 'android' },
    processCommands: params.processCommands,
  });
  const pinFiles = params.gradleFiles.map((file) => ({ path: file.path, kind: file.kind }));
  const searchEvidenceLines = buildProjectSearchEvidence({ pins: params.projectPins });
  const findings = params.offers.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: {
        kind: 'androidPlatform',
        sdkRoot: offer.sdkRoot,
        folderPath: offer.folderPath,
        apiLevel: offer.apiLevel,
        pinFiles: pinFiles,
      },
      title: `Android SDK Platform ${offer.apiLevel}`,
      explanation: `A platform of the Android SDK, which apps compile against, that no Gradle file found sets as \`compileSdk\`. ${PINNED_VERSION_REINSTALL_EXPLANATION}`,
      regeneration:
        'The SDK Manager of Android Studio installs it again, as does the next Gradle build that compiles against it.',
      risk: 'careful',
      evidenceLines: [
        `None of the ${params.gradleFiles.length} Gradle files found sets \`compileSdk\` ${offer.apiLevel}.`,
        ...searchEvidenceLines,
      ],
      displayPath: offer.folderPath,
      activity: activity,
    };

    return finding;
  });

  return { findings: findings, isComplete: params.offers.isComplete };
}
