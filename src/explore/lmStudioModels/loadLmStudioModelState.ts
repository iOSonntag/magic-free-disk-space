import { joinAbsolutePath } from '../../path/joinAbsolutePath.js';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { PathRules } from '../../path/pathRules.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreEntryStats, loadExploreFolderNames } from '../loadExploreRead.js';

/**
 * LM Studio's models folder in its default home below the home folder. A home moved by
 * `~/.lmstudio-home-pointer`, the older `~/.cache/lm-studio`, or a `downloadsFolder` of its
 * settings is not read.
 */
export const LM_STUDIO_MODELS_PATH_NAMES = ['.lmstudio', 'models'];

/** One `<publisher>/<model>` folder of the models folder. */
export type LmStudioModelFolder = {
  publisher: string;
  modelName: string;
  path: AbsolutePath;
  modifiedMs: number;
};

/** Every model folder, two levels below the models folder; links and dot names are none. */
export async function loadLmStudioModelState(params: {
  pathRules: PathRules;
  homeDir: AbsolutePath;
  privacyDenialCode: string | null;
}): Promise<Result<LmStudioModelFolder[], ExploreFileUnreadable>> {
  const modelsPath = joinAbsolutePath({
    rules: params.pathRules,
    parentPath: params.homeDir,
    names: LM_STUDIO_MODELS_PATH_NAMES,
  });
  const publishers = await loadExploreFolderNames({
    path: modelsPath,
    privacyDenialCode: params.privacyDenialCode,
  });

  if (publishers.kind === 'failed') {
    return publishers;
  }

  const folders: LmStudioModelFolder[] = [];

  for (const publisher of publishers.value?.folderNames ?? []) {
    const publisherPath = joinAbsolutePath({
      rules: params.pathRules,
      parentPath: modelsPath,
      names: [publisher],
    });
    const models = await loadExploreFolderNames({
      path: publisherPath,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (models.kind === 'failed') {
      return models;
    }

    for (const modelName of models.value?.folderNames ?? []) {
      const path = joinAbsolutePath({
        rules: params.pathRules,
        parentPath: publisherPath,
        names: [modelName],
      });
      const stats = await loadExploreEntryStats({
        path: path,
        privacyDenialCode: params.privacyDenialCode,
      });

      if (stats.kind === 'failed') {
        return stats;
      }

      if (stats.value?.kind === 'directory') {
        folders.push({
          publisher: publisher,
          modelName: modelName,
          path: path,
          modifiedMs: stats.value.modifiedMs,
        });
      }
    }
  }

  return { kind: 'succeeded', value: folders };
}
