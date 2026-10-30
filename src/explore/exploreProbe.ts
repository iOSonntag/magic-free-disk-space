import type { Environment } from '../environment/buildEnvironment.js';
import type { Result } from '../result.js';
import type { LocatedTool } from '../tools/findTrustedTool.js';
import type { ToolName } from '../tools/toolInstallLocations.js';
import type {
  ExploreFileUnreadable,
  ExploreProbeFailure,
  ExploreProbeFindings,
} from './exploreUnit.js';

/**
 * What every probe gets: the processes read before any tool started, the time its commands and
 * reads must end by, and the scan's cutoff of last use for the units judged by it.
 */
export type ExploreProbeRun = {
  environment: Environment;
  processCommands: string[] | null;
  deadlineMs: number;
  unusedCutoffMs: number;
};

/** The run of a tool probe, with the tool its lookup located. */
export type ExploreProbeToolRun = ExploreProbeRun & { tool: LocatedTool };

/** A probe that runs or locates a tool; it may also read files for its units. */
export type ExploreProbeTool = {
  kind: 'tool';
  toolName: ToolName;
  loadFindings: (run: ExploreProbeToolRun) => Promise<ExploreProbeToolResult>;
};

/** The answer of a tool probe, which may fail by its command, its output, or a file. */
export type ExploreProbeToolResult = Result<ExploreProbeFindings, ExploreProbeFailure>;

/** A probe that only reads files, so it runs no command and has no tool failure. */
export type ExploreProbeFiles = {
  kind: 'files';
  loadFindings: (run: ExploreProbeRun) => Promise<ExploreProbeFilesResult>;
};

/** The answer of a files probe, which may fail only by a file it could not read. */
export type ExploreProbeFilesResult = Result<ExploreProbeFindings, ExploreFileUnreadable>;

export type ExploreProbe = ExploreProbeTool | ExploreProbeFiles;

/** What the commands of a located tool need: its environment, and the time they must end by. */
export type ExploreToolCommandRun = {
  tool: LocatedTool;
  environment: Environment;
  deadlineMs: number;
};

/** What the recheck of a tool unit gets: the fresh tool, and the processes read right before. */
export type ExploreUnitRecheckRun = ExploreToolCommandRun & { processCommands: string[] | null };
