import type { EngineProbeId } from '../../catalog/catalog.js';
import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import { loadEntryStats } from '../../system/loadEntryStats.js';
import type { ContainerEngine, HomeRelativePathNames } from '../explorePlatform.js';
import type { ExploreProbeEngineResult, ExploreProbeRun } from '../exploreProbe.js';
import { buildEngineFindings } from './buildEngineFindings.js';
import { loadEngineState } from './loadEngineState.js';

/**
 * Asks the engine over the first of its sockets that exists, trusted by `requestUnixSocket`, and
 * judges its images, containers, volumes and build cache. Never rejects.
 */
export async function loadEngineFindings(params: {
  run: ExploreProbeRun;
  engineProbeId: EngineProbeId;
  engine: ContainerEngine;
}): Promise<ExploreProbeEngineResult> {
  const socketPath = await findFirstPresentPath({
    environment: params.run.environment,
    pathNames: params.engine.socketPaths,
  });

  if (socketPath === null) {
    return { kind: 'failed', failure: { kind: 'socketMissing' } };
  }

  const state = await loadEngineState({
    socketPath: socketPath,
    user: params.run.environment.user,
    deadlineMs: params.run.deadlineMs,
    usageType: null,
  });

  if (state.kind === 'failed') {
    switch (state.failure.kind) {
      case 'socketMissing':
      case 'socketUntrusted':
        return { kind: 'failed', failure: state.failure };
      case 'requestFailed':
      case 'badAnswer':
        return {
          kind: 'failed',
          failure: { kind: 'answerFailed', socketPath: socketPath, failure: state.failure },
        };
    }
  }

  const findings = buildEngineFindings({
    place: {
      engineProbeId: params.engineProbeId,
      engineName: params.engine.engineName,
      socketPath: socketPath,
      diskImagePath: resolveHomePath({
        environment: params.run.environment,
        pathNames: params.engine.diskImagePath,
      }),
    },
    usage: state.value.usage,
    nowMs: Date.now(),
    processCommands: params.run.processCommands,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}

/**
 * The first path whose entry exists, of any kind, so a socket that is not one is still the one
 * the engine is asked at, and refused there; `null` when none exists.
 */
async function findFirstPresentPath(params: {
  environment: Environment;
  pathNames: HomeRelativePathNames[];
}): Promise<AbsolutePath | null> {
  for (const pathNames of params.pathNames) {
    const path = resolveHomePath({ environment: params.environment, pathNames: pathNames });
    const stats = await loadEntryStats({ path: path });

    if (stats.kind === 'succeeded' || stats.failure.reason !== 'missing') {
      return path;
    }
  }

  return null;
}

function resolveHomePath(params: {
  environment: Environment;
  pathNames: HomeRelativePathNames;
}): AbsolutePath {
  return joinAbsolutePath({
    rules: params.environment.pathRules,
    parentPath: params.environment.homeDir,
    names: params.pathNames,
  });
}
