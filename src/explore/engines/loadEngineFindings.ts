import type { EngineProbeId } from '../../catalog/catalog.js';
import type { Environment } from '../../environment/buildEnvironment.js';
import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import { loadDirectoryEntries } from '../../system/loadDirectoryEntries.js';
import { loadEntryStats } from '../../system/loadEntryStats.js';
import type {
  ContainerEngine,
  ContainerEngineFixed,
  ContainerEngineProfiles,
  HomeRelativePathNames,
} from '../explorePlatform.js';
import type {
  ExploreEngineFailure,
  ExploreEngineFailureAnswered,
  ExploreEngineFailureSocketUntrusted,
  ExploreProbeEngineResult,
  ExploreProbeRun,
} from '../exploreProbe.js';
import type { ExploreProbeFindings } from '../exploreUnit.js';
import { buildEngineFindings } from './buildEngineFindings.js';
import { loadEngineState } from './loadEngineState.js';

/** One instance of an engine: the socket it is asked at, and the disk image its units take space in. */
type EngineSocket = { socketPath: AbsolutePath; diskImagePath: AbsolutePath };

/** The engine's own folders beside its profiles' start with this, such as Colima's `_lima`. */
const ENGINE_FOLDER_PREFIX = '_';

/**
 * Asks each instance of the engine over its socket, trusted by `requestUnixSocket`, and judges its
 * images, containers, volumes and build cache. An instance whose socket is missing or untrusted is
 * skipped quietly; one that answers not as asked leaves the findings incomplete, and fails the
 * probe when no instance answered. `socketMissing` where the platform has no such engine, a `null`
 * engine. Never rejects.
 */
export async function loadEngineFindings(params: {
  run: ExploreProbeRun;
  engineProbeId: EngineProbeId;
  engine: ContainerEngine | null;
}): Promise<ExploreProbeEngineResult> {
  if (params.engine === null) {
    return { kind: 'failed', failure: { kind: 'socketMissing' } };
  }

  const sockets = await loadEngineSockets({
    environment: params.run.environment,
    engine: params.engine,
  });
  const answers: ExploreProbeFindings[] = [];
  const answerFailures: ExploreEngineFailureAnswered[] = [];
  const untrustedFailures: ExploreEngineFailureSocketUntrusted[] = [];

  for (const socket of sockets) {
    const result = await loadSocketFindings({
      run: params.run,
      engineProbeId: params.engineProbeId,
      engineName: params.engine.engineName,
      socket: socket,
    });

    if (result.kind === 'succeeded') {
      answers.push(result.value);

      continue;
    }

    switch (result.failure.kind) {
      case 'socketMissing':
        break;
      case 'socketUntrusted':
        untrustedFailures.push(result.failure);
        break;
      case 'answerFailed':
        answerFailures.push(result.failure);
        break;
    }
  }

  if (answers.length > 0) {
    return {
      kind: 'succeeded',
      value: {
        findings: answers.flatMap((answer) => answer.findings),
        isComplete: answerFailures.length === 0 && answers.every((answer) => answer.isComplete),
      },
    };
  }

  const [failure] = [...answerFailures, ...untrustedFailures];

  return { kind: 'failed', failure: failure ?? { kind: 'socketMissing' } };
}

async function loadSocketFindings(params: {
  run: ExploreProbeRun;
  engineProbeId: EngineProbeId;
  engineName: string;
  socket: EngineSocket;
}): Promise<Result<ExploreProbeFindings, ExploreEngineFailure>> {
  const state = await loadEngineState({
    socketPath: params.socket.socketPath,
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
          failure: {
            kind: 'answerFailed',
            socketPath: params.socket.socketPath,
            failure: state.failure,
          },
        };
    }
  }

  const findings = buildEngineFindings({
    place: {
      engineProbeId: params.engineProbeId,
      engineName: params.engineName,
      socketPath: params.socket.socketPath,
      diskImagePath: params.socket.diskImagePath,
    },
    usage: state.value.usage,
    nowMs: params.run.environment.nowMs,
    runningProcesses: params.run.runningProcesses,
  });

  return { kind: 'succeeded', value: { findings: findings, isComplete: true } };
}

/** The instances of the engine to ask, each at a socket path that exists. */
async function loadEngineSockets(params: {
  environment: Environment;
  engine: ContainerEngine;
}): Promise<EngineSocket[]> {
  switch (params.engine.kind) {
    case 'fixed':
      return loadFixedEngineSockets({ environment: params.environment, engine: params.engine });
    case 'profiles':
      return loadProfileEngineSockets({ environment: params.environment, engine: params.engine });
  }
}

async function loadFixedEngineSockets(params: {
  environment: Environment;
  engine: ContainerEngineFixed;
}): Promise<EngineSocket[]> {
  for (const pathNames of params.engine.socketPaths) {
    const socketPath = resolveHomePath({ environment: params.environment, pathNames: pathNames });

    if (await isPathPresent({ path: socketPath })) {
      return [
        {
          socketPath: socketPath,
          diskImagePath: resolveHomePath({
            environment: params.environment,
            pathNames: params.engine.diskImagePath,
          }),
        },
      ];
    }
  }

  return [];
}

/**
 * The socket of each profile folder that holds one. Only the default profile's is tried when the
 * profiles' folder cannot be listed, so the engine is still asked, and refused there if so.
 */
async function loadProfileEngineSockets(params: {
  environment: Environment;
  engine: ContainerEngineProfiles;
}): Promise<EngineSocket[]> {
  const entries = await loadDirectoryEntries({
    path: resolveHomePath({
      environment: params.environment,
      pathNames: params.engine.profilesRoot,
    }),
  });

  if (entries.kind === 'failed') {
    switch (entries.failure.reason) {
      case 'missing':
      case 'notDirectory':
        return [];
      case 'permissionDenied':
      case 'unexpected':
        break;
    }
  }

  const profileNames =
    entries.kind === 'succeeded'
      ? entries.value
          .filter(
            (entry) => entry.kind === 'directory' && !entry.name.startsWith(ENGINE_FOLDER_PREFIX),
          )
          .map((entry) => entry.name)
      : [params.engine.defaultProfileName];
  const sockets: EngineSocket[] = [];

  for (const profileName of profileNames) {
    const socketPath = resolveHomePath({
      environment: params.environment,
      pathNames: [...params.engine.profilesRoot, profileName, params.engine.socketName],
    });

    if (await isPathPresent({ path: socketPath })) {
      sockets.push({
        socketPath: socketPath,
        diskImagePath: resolveHomePath({
          environment: params.environment,
          pathNames: params.engine.buildDiskImagePath(profileName),
        }),
      });
    }
  }

  return sockets;
}

/**
 * Whether an entry of any kind is at the path, so a socket that is not one is still the one the
 * engine is asked at, and refused there.
 */
async function isPathPresent(params: { path: AbsolutePath }): Promise<boolean> {
  const stats = await loadEntryStats({ path: params.path });

  return stats.kind === 'succeeded' || stats.failure.reason !== 'missing';
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
