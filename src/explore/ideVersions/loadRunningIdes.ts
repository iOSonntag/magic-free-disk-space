import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import { loadExploreFileText } from '../loadExploreRead.js';

/** Where an app's executable lies inside its bundle; the bundle path ends before it. */
const BUNDLE_EXECUTABLE_PATH_PART = '.app/Contents/MacOS/';

/** Where JetBrains' Mac distribution puts `product-info.json` inside an IDE's bundle. */
const PRODUCT_INFO_BUNDLE_PATH = '/Contents/Resources/product-info.json';

/**
 * A running app bundle that is an IDE, with the `dataDirectoryName` of its `product-info.json`,
 * the name of its version folders; `null` when the file cannot be read or parsed, so it counts as
 * running every version.
 */
export type RunningIde = { bundlePath: string; dataDirectoryName: string | null };

/**
 * The running bundles that hold a `product-info.json`, one per bundle; a bundle without it is no
 * IDE. Empty while the processes were not read.
 */
export async function loadRunningIdes(params: {
  processCommands: string[] | null;
  privacyDenialCode: string | null;
}): Promise<RunningIde[]> {
  const bundlePaths = new Set(
    (params.processCommands ?? []).flatMap((command) => {
      const bundlePath = findBundlePath({ command: command });

      return bundlePath === null ? [] : [bundlePath];
    }),
  );
  const runningIdes: RunningIde[] = [];

  for (const bundlePath of bundlePaths) {
    const read = await loadExploreFileText({
      path: `${bundlePath}${PRODUCT_INFO_BUNDLE_PATH}`,
      privacyDenialCode: params.privacyDenialCode,
    });

    if (read.kind === 'failed') {
      runningIdes.push({ bundlePath: bundlePath, dataDirectoryName: null });

      continue;
    }

    switch (read.value.kind) {
      case 'absent':
        break;
      case 'unfit':
        runningIdes.push({ bundlePath: bundlePath, dataDirectoryName: null });
        break;
      case 'text':
        runningIdes.push({
          bundlePath: bundlePath,
          dataDirectoryName: parseDataDirectoryName({ text: read.value.text }),
        });
        break;
    }
  }

  return runningIdes;
}

/** The bundles among `runningIdes` that may run the version whose folders are named so. */
export function listVersionBundlePaths(params: {
  runningIdes: RunningIde[];
  dataDirectoryName: string;
}): string[] {
  return params.runningIdes
    .filter(
      (runningIde) =>
        runningIde.dataDirectoryName === null ||
        runningIde.dataDirectoryName === params.dataDirectoryName,
    )
    .map((runningIde) => runningIde.bundlePath);
}

/** The bundle of the command's executable, an absolute path ending in `.app`; else `null`. */
function findBundlePath(params: { command: string }): string | null {
  const index = params.command.indexOf(BUNDLE_EXECUTABLE_PATH_PART);

  if (index === -1 || !params.command.startsWith('/')) {
    return null;
  }

  return params.command.slice(0, index + '.app'.length);
}

function parseDataDirectoryName(params: { text: string }): string | null {
  const productInfo = parseJsonValue({ text: params.text });

  if (productInfo.kind === 'failed' || !isJsonObject(productInfo.value)) {
    return null;
  }

  const dataDirectoryName = productInfo.value.dataDirectoryName;

  return typeof dataDirectoryName === 'string' && dataDirectoryName !== ''
    ? dataDirectoryName
    : null;
}
