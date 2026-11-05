/**
 * True when a process in `commandLines` (the lines of `ps -o command=`) runs from inside one of
 * the app bundles: `Contents/` for a Mac app, `Wrapper/` for an iOS app on a Mac. The trailing
 * slash keeps `X.app.old` from matching `X.app`.
 */
export function isAnyBundleRunning(params: {
  bundlePaths: string[];
  commandLines: string[];
}): boolean {
  return params.bundlePaths.some((bundlePath) => {
    const insideBundlePath = `${bundlePath}/`;

    return params.commandLines.some((commandLine) => commandLine.includes(insideBundlePath));
  });
}
