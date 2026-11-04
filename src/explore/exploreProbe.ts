import type { Environment } from '../environment/buildEnvironment.js';
import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import type { Result } from '../result.js';
import type { EntryReads } from '../system/entryReads.js';
import type { SystemPlatform } from '../system/systemPlatform.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import type { ToolName } from '../tools/toolInstallLocations.js';
import type { ToolsPlatform } from '../tools/toolsPlatform.js';
import type { AndroidSdkRoot } from './android/loadAndroidSdkRoots.js';
import type { ExplorePlatform } from './explorePlatform.js';
import type {
  ExploreFileUnreadable,
  ExploreProbeFailure,
  ExploreProbeFindings,
  ExploreProbePlaceMissing,
} from './exploreUnit.js';
import type { ProjectPins } from './projectPins/projectPins.js';

/** What the probes and their rechecks take from the platform's slices. */
export type ExploreProbePlatform = {
  explore: ExplorePlatform;
  /** The Homebrew prefixes of the tools slice, whose global npm packages pnpm may live in. */
  homebrewPrefixPaths: AbsolutePath[];
  /** The system slice's code of a privacy denial, for every read of the probes. */
  privacyDenialCode: string | null;
  /** The system slice's entry reads, so a probe never lists a folder that only the cloud holds. */
  entryReads: EntryReads;
};

/** What the probes and their rechecks take of the explore, tools, and system slices. */
export function buildExploreProbePlatform(params: {
  explore: ExplorePlatform;
  tools: ToolsPlatform;
  system: SystemPlatform;
}): ExploreProbePlatform {
  return {
    explore: params.explore,
    homebrewPrefixPaths: params.tools.homebrewPrefixPaths,
    privacyDenialCode: params.system.privacyDenialCode,
    entryReads: params.system.entryReads,
  };
}

/**
 * What every probe gets: the processes read before any tool started, the time its commands and
 * reads must end by, and the scan's cutoffs of last use and of the stale window for the units
 * judged by them.
 */
export type ExploreProbeRun = {
  environment: Environment;
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
  deadlineMs: number;
  unusedCutoffMs: number;
  staleCutoffMs: number;
};

/** The run of a tool probe, with the tool its lookup located. */
export type ExploreProbeToolRun = ExploreProbeRun & { tool: LocatedTool };

/** A probe that runs or locates a tool; it may also read files for its units. */
export type ExploreProbeTool = {
  kind: 'tool';
  toolName: ToolName;
  loadFindings: (run: ExploreProbeToolRun) => Promise<ExploreProbeToolResult>;
};

/**
 * The answer of a tool probe, which may fail by its command, its output, or a file, or find no
 * place to probe.
 */
export type ExploreProbeToolResult = Result<
  ExploreProbeFindings,
  ExploreProbeFailure | ExploreProbePlaceMissing
>;

/** A probe that only reads files, so it runs no command and has no tool failure. */
export type ExploreProbeFiles = {
  kind: 'files';
  loadFindings: (run: ExploreProbeRun) => Promise<ExploreProbeFilesResult>;
};

/** The answer of a files probe, which may fail only by a file it could not read, or find no place. */
export type ExploreProbeFilesResult = Result<
  ExploreProbeFindings,
  ExploreFileUnreadable | ExploreProbePlaceMissing
>;

/**
 * A probe judged also by the pins of the projects: it is built from them once the project walk
 * ended and they are read, and then runs as the probe it builds.
 */
export type ExploreProbePinned = {
  kind: 'pinned';
  buildProbe: (params: {
    projectPins: ProjectPins;
  }) => ExploreProbeTool | ExploreProbeFiles | ExploreProbeAndroidSdk;
};

/**
 * A probe of the Android SDKs: it is built from the SDK roots, resolved once per scan after the
 * project walk ended, and then runs as the probe it builds.
 */
export type ExploreProbeAndroidSdk = {
  kind: 'androidSdk';
  buildProbe: (params: { sdkRoots: AndroidSdkRoot[] }) => ExploreProbeTool | ExploreProbeFiles;
};

/** The requests an engine probe sends, by the path of the engine's API. */
export type EngineEndpoint = '/_ping' | '/version' | '/system/df';

export type ExploreEngineAnswerFailureRequestFailed = {
  kind: 'requestFailed';
  endpoint: EngineEndpoint;
  /** The HTTP status of an answer that was not a success; `null` when none came. */
  status: number | null;
  /** The error code of a request that got no answer; `null` when one came. */
  code: string | null;
};

export type ExploreEngineAnswerFailureBadAnswer = { kind: 'badAnswer'; endpoint: EngineEndpoint };

/** The engine answered, but not as asked: the only failures that raise an issue. */
export type ExploreEngineAnswerFailure =
  | ExploreEngineAnswerFailureRequestFailed
  | ExploreEngineAnswerFailureBadAnswer;

/**
 * No socket exists, as on a platform without the engine, or the first that exists refused the
 * connect, as a stale one does.
 */
export type ExploreEngineFailureSocketMissing = { kind: 'socketMissing' };

/** The first socket that exists is not a socket, or not the user's, so nothing was sent. */
export type ExploreEngineFailureSocketUntrusted = {
  kind: 'socketUntrusted';
  detail: 'notSocket' | 'notOwnedByUser';
};

/** The engine behind the probed `socketPath` answered, but not as asked. */
export type ExploreEngineFailureAnswered = {
  kind: 'answerFailed';
  socketPath: AbsolutePath;
  failure: ExploreEngineAnswerFailure;
};

/** Why an engine probe found nothing; only an answer failure raises an issue. */
export type ExploreEngineFailure =
  | ExploreEngineFailureSocketMissing
  | ExploreEngineFailureSocketUntrusted
  | ExploreEngineFailureAnswered;

export type ExploreProbeEngineResult = Result<ExploreProbeFindings, ExploreEngineFailure>;

/** A probe that asks a running container engine over its own socket; it runs no command. */
export type ExploreProbeEngine = {
  kind: 'engine';
  loadFindings: (run: ExploreProbeRun) => Promise<ExploreProbeEngineResult>;
};

export type ExploreProbe =
  | ExploreProbeTool
  | ExploreProbeFiles
  | ExploreProbePinned
  | ExploreProbeAndroidSdk
  | ExploreProbeEngine;

/** What the commands of a located tool need: its environment, and the time they must end by. */
export type ExploreToolCommandRun = {
  tool: LocatedTool;
  environment: Environment;
  deadlineMs: number;
};

/** What the recheck of a tool unit gets: the fresh tool, and the processes read right before. */
export type ExploreUnitRecheckRun = ExploreToolCommandRun & {
  platform: ExploreProbePlatform;
  processCommands: string[] | null;
};
