const RUNTIME_IDENTIFIER_PREFIX = 'com.apple.CoreSimulator.SimRuntime.';

/** `com.apple.CoreSimulator.SimRuntime.iOS-18-2` reads `iOS 18.2`; an unknown shape stays as is. */
export function formatSimulatorRuntimeName(params: { runtimeIdentifier: string }): string {
  if (!params.runtimeIdentifier.startsWith(RUNTIME_IDENTIFIER_PREFIX)) {
    return params.runtimeIdentifier;
  }

  const [platform, ...versionParts] = params.runtimeIdentifier
    .slice(RUNTIME_IDENTIFIER_PREFIX.length)
    .split('-');

  if (versionParts.length === 0) {
    return params.runtimeIdentifier;
  }

  return `${platform} ${versionParts.join('.')}`;
}
