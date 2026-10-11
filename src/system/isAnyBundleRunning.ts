/**
 * True when a process in `processCommands` (the lines of `ps -o command=`) runs from inside one
 * of the app bundles: `Contents/` for a Mac app, `Wrapper/` for an iOS app on a Mac. The
 * trailing slash keeps `X.app.old` from matching `X.app`.
 */
export function isAnyBundleRunning(params: {
  bundlePaths: string[];
  processCommands: string[];
}): boolean {
  return params.bundlePaths.some((bundlePath) => {
    const insideBundlePath = `${bundlePath}/`;

    return params.processCommands.some((command) => command.includes(insideBundlePath));
  });
}
