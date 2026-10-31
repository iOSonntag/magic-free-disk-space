import { join } from 'node:path';
import type { AbsolutePath } from '../../path/parseAbsolutePath.js';
import type { Result } from '../../result.js';
import type { ExploreFileUnreadable } from '../exploreUnit.js';
import { loadExploreFileText } from '../loadExploreRead.js';
import { parseAndroidPackagePath } from './parseAndroidPackagePath.js';

/** A package folder of the SDK with the id its `package.xml` names. */
export type AndroidPackageFolderParsed = {
  kind: 'parsed';
  folderPath: AbsolutePath;
  packagePath: string;
};

/** A package folder whose `package.xml` is unfit or names no `localPackage path`. */
export type AndroidPackageFolderUnparsed = { kind: 'unparsed'; folderPath: AbsolutePath };

export type AndroidPackageFolder = AndroidPackageFolderParsed | AndroidPackageFolderUnparsed;

/** `null` when the folder holds no `package.xml`, so it is no package. */
export async function loadAndroidPackageFolder(params: {
  folderPath: AbsolutePath;
}): Promise<Result<AndroidPackageFolder | null, ExploreFileUnreadable>> {
  const packageXml = await loadExploreFileText({ path: join(params.folderPath, 'package.xml') });

  if (packageXml.kind === 'failed') {
    return packageXml;
  }

  switch (packageXml.value.kind) {
    case 'absent':
      return { kind: 'succeeded', value: null };
    case 'unfit':
      return { kind: 'succeeded', value: { kind: 'unparsed', folderPath: params.folderPath } };
    case 'text': {
      const packagePath = parseAndroidPackagePath({ packageXmlText: packageXml.value.text });

      if (packagePath === null) {
        return { kind: 'succeeded', value: { kind: 'unparsed', folderPath: params.folderPath } };
      }

      return {
        kind: 'succeeded',
        value: { kind: 'parsed', folderPath: params.folderPath, packagePath: packagePath },
      };
    }
  }
}
