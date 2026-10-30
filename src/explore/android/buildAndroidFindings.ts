import { basename } from 'node:path';
import type { LocatedTool } from '../../tools/findTrustedTool.js';
import { decideUnitActivity } from '../decideUnitActivity.js';
import type { ExploreFinding, ExploreProbeFindings } from '../exploreUnit.js';
import type { AndroidPackageOffer, AndroidPackageOffers } from './decideAndroidPackageOffers.js';
import type { AndroidAvdPresent, AndroidSdkState } from './loadAndroidSdkState.js';

const AVDS_ELSEWHERE_TEXT =
  'AVDs moved elsewhere, such as by `ANDROID_AVD_HOME`, are not seen here.';

const ANDROID_AVD_FOLDER_SUFFIX = '.avd';

/**
 * Whether the folder of an AVD is one avdmanager writes: named `*.avd`, with an image in its
 * `config.ini`.
 */
export function isAndroidAvdFolder(
  avd: AndroidAvdPresent,
): avd is AndroidAvdPresent & { imageSysdir: string } {
  return basename(avd.avdPath).endsWith(ANDROID_AVD_FOLDER_SUFFIX) && avd.imageSysdir !== null;
}

/**
 * One finding for each AVD last used before the cutoff whose folder is named `*.avd` and whose
 * `config.ini` names an image; any other AVD is not judged. Without the SDK no unit is built, so
 * the probe judges nothing while `~/.android/avd` holds any `*.ini`.
 */
export function buildAndroidAvdFindings(params: {
  state: AndroidSdkState;
  tool: LocatedTool;
  unusedCutoffMs: number;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const avds = params.state.avds ?? [];

  if (params.state.sdk === null) {
    return { findings: [], isComplete: avds.length === 0 };
  }

  const sdkRoot = params.state.sdk.sdkRoot;
  const findings: ExploreFinding[] = [];
  let isComplete = true;

  for (const avd of avds) {
    switch (avd.kind) {
      case 'missing':
        continue;
      case 'unlocated':
        isComplete = false;
        continue;
      case 'present':
        break;
    }

    if (avd.name === null || avd.lastUsedAtMs === null || !isAndroidAvdFolder(avd)) {
      isComplete = false;
      continue;
    }

    if (avd.lastUsedAtMs >= params.unusedCutoffMs) {
      continue;
    }

    findings.push({
      unit: {
        kind: 'androidAvd',
        tool: params.tool,
        sdkRoot: sdkRoot,
        name: avd.name,
        avdPath: avd.avdPath,
        iniPath: avd.iniPath,
        lastUsedAtMs: avd.lastUsedAtMs,
      },
      title: `Android emulator ${avd.name}`,
      explanation: 'An Android virtual device with the apps and data installed in it.',
      regeneration:
        'A deleted AVD does not come back; the Device Manager of Android Studio creates a new, empty one.',
      risk: 'careful',
      evidenceLines: buildAndroidAvdEvidenceLines({
        imageSysdir: avd.imageSysdir,
        lastUsedAtMs: avd.lastUsedAtMs,
      }),
      displayPath: avd.avdPath,
      activity: decideUnitActivity({
        facts: { kind: 'android' },
        processCommands: params.processCommands,
      }),
    });
  }

  return { findings: findings, isComplete: isComplete };
}

/** One finding for each system image folder that no AVD names. */
export function buildAndroidSystemImageFindings(params: {
  offers: AndroidPackageOffers;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const findings = params.offers.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: { kind: 'androidSystemImage', sdkRoot: offer.sdkRoot, folderPath: offer.folderPath },
      title: `Android system image ${offer.packagePath}`,
      explanation: `A system image of the Android SDK that no AVD in ~/.android/avd uses. ${AVDS_ELSEWHERE_TEXT} A deleted image downloads again when an AVD needs it.`,
      regeneration: buildAndroidPackageRegeneration({ offer: offer }),
      risk: 'review',
      evidenceLines: ['No AVD uses this image.', `The SDK knows it as \`${offer.packagePath}\`.`],
      displayPath: offer.folderPath,
      activity: decideUnitActivity({
        facts: { kind: 'android' },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });

  return { findings: findings, isComplete: params.offers.isComplete };
}

/** The finding of the emulator package while no AVD exists. */
export function buildAndroidEmulatorFindings(params: {
  offers: AndroidPackageOffers;
  processCommands: string[] | null;
}): ExploreProbeFindings {
  const findings = params.offers.offers.map((offer) => {
    const finding: ExploreFinding = {
      unit: { kind: 'androidEmulator', sdkRoot: offer.sdkRoot, folderPath: offer.folderPath },
      title: 'Android emulator package',
      explanation: `The Android emulator of the SDK, which only runs AVDs, while ~/.android/avd holds none. ${AVDS_ELSEWHERE_TEXT} A deleted emulator downloads again when an AVD needs it.`,
      regeneration: buildAndroidPackageRegeneration({ offer: offer }),
      risk: 'review',
      evidenceLines: [
        'No AVD exists in ~/.android/avd.',
        `The SDK knows it as \`${offer.packagePath}\`.`,
      ],
      displayPath: offer.folderPath,
      activity: decideUnitActivity({
        facts: { kind: 'android' },
        processCommands: params.processCommands,
      }),
    };

    return finding;
  });

  return { findings: findings, isComplete: params.offers.isComplete };
}

function buildAndroidAvdEvidenceLines(params: {
  imageSysdir: string;
  lastUsedAtMs: number;
}): string[] {
  const lastUsedDate = new Date(params.lastUsedAtMs).toISOString().slice(0, 10);
  const lastUseLine = `Last used on ${lastUsedDate}, by the dates of its emulator files.`;

  return [lastUseLine, `It runs the system image ${params.imageSysdir}.`];
}

function buildAndroidPackageRegeneration(params: { offer: AndroidPackageOffer }): string {
  return `The SDK Manager of Android Studio installs it again, as does \`sdkmanager "${params.offer.packagePath}"\`.`;
}
