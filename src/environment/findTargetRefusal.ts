import { isAbsolute } from 'node:path';
import { isSameOrInsidePath } from '../path/isSameOrInsidePath.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import type { Environment } from './buildEnvironment.js';
import { isTouchingProtectedPath } from './isTouchingProtectedPath.js';

/** How a removal takes a target off this Mac: a delete removes it, an evict drops its local copy. */
export type TargetRemovalKind = 'delete' | 'evict';

/** Why the environment refuses to remove a target. */
export type TargetRefusalReason =
  | 'protectedRoot'
  | 'outsideAllowedRoot'
  | 'symbolicLink'
  | 'unsupportedKind';

/** How a real path stands to the cloud folders of the environment. */
type EvictRootPlacement = 'strictlyInside' | 'rootOrHolder' | 'apart';

/**
 * The refusal of one target of a removal, judged by the real path and kind of its identity; `null`
 * when the removal may take it. A delete takes only a plain file or folder strictly inside an
 * allowed root that touches no protected path and no cloud folder; an evict only a plain file
 * strictly inside a cloud folder that touches no protected path.
 */
export function findTargetRefusal(params: {
  environment: Environment;
  removal: TargetRemovalKind;
  identity: FileIdentity;
}): TargetRefusalReason | null {
  switch (params.removal) {
    case 'delete':
      return findDeleteRefusal({ environment: params.environment, identity: params.identity });
    case 'evict':
      return findEvictRefusal({ environment: params.environment, identity: params.identity });
  }
}

function findDeleteRefusal(params: {
  environment: Environment;
  identity: FileIdentity;
}): TargetRefusalReason | null {
  switch (params.identity.kind) {
    case 'symbolicLink':
      return 'symbolicLink';
    case 'other':
      return 'unsupportedKind';
    case 'file':
    case 'directory':
      break;
  }

  if (!isAbsolute(params.identity.realPath)) {
    return 'outsideAllowedRoot';
  }

  if (
    isTouchingProtectedPath({
      environment: params.environment,
      realPath: params.identity.realPath,
    })
  ) {
    return 'protectedRoot';
  }

  // A delete in a cloud folder deletes the file on every device, so only an evict goes there.
  if (
    getEvictRootPlacement({
      environment: params.environment,
      realPath: params.identity.realPath,
    }) !== 'apart'
  ) {
    return 'protectedRoot';
  }

  const isInsideAllowedRoot = params.environment.allowedRealRoots.some(
    (allowedRoot) =>
      params.identity.realPath !== allowedRoot &&
      isSameOrInsidePath({
        rules: params.environment.pathRules,
        path: params.identity.realPath,
        parentPath: allowedRoot,
      }),
  );

  if (!isInsideAllowedRoot) {
    return 'outsideAllowedRoot';
  }

  return null;
}

function findEvictRefusal(params: {
  environment: Environment;
  identity: FileIdentity;
}): TargetRefusalReason | null {
  switch (params.identity.kind) {
    case 'symbolicLink':
      return 'symbolicLink';
    case 'directory':
    case 'other':
      return 'unsupportedKind';
    case 'file':
      break;
  }

  if (
    !isAbsolute(params.identity.realPath) ||
    getEvictRootPlacement({
      environment: params.environment,
      realPath: params.identity.realPath,
    }) !== 'strictlyInside'
  ) {
    return 'outsideAllowedRoot';
  }

  if (
    isTouchingProtectedPath({
      environment: params.environment,
      realPath: params.identity.realPath,
    })
  ) {
    return 'protectedRoot';
  }

  return null;
}

/**
 * `rootOrHolder` when the path is or holds a cloud folder, before `strictlyInside` one, so a path
 * that is one cloud folder and lies in another counts as the folder. Compared without case: macOS
 * disks usually ignore it, and the looser match only refuses more.
 */
function getEvictRootPlacement(params: {
  environment: Environment;
  realPath: string;
}): EvictRootPlacement {
  const lowerCaseRealPath = params.realPath.toLowerCase();
  const lowerCaseEvictRoots = params.environment.evictRealRoots.map((evictRoot) =>
    evictRoot.toLowerCase(),
  );
  const isRootOrHolder = lowerCaseEvictRoots.some((evictRoot) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: evictRoot,
      parentPath: lowerCaseRealPath,
    }),
  );

  if (isRootOrHolder) {
    return 'rootOrHolder';
  }

  const isStrictlyInside = lowerCaseEvictRoots.some((evictRoot) =>
    isSameOrInsidePath({
      rules: params.environment.pathRules,
      path: lowerCaseRealPath,
      parentPath: evictRoot,
    }),
  );

  if (isStrictlyInside) {
    return 'strictlyInside';
  }

  return 'apart';
}
