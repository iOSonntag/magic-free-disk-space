// Such as `<localPackage path="system-images;android-35;google_apis;arm64-v8a" obsolete="false">`.
const LOCAL_PACKAGE_PATH_PATTERN = /<localPackage\s[^>]*?\bpath="([^"]+)"/;

/**
 * The SDK's id of a package, the `path` of the `localPackage` in its `package.xml`, such as
 * `emulator`; `null` when the text holds none.
 */
export function parseAndroidPackagePath(params: { packageXmlText: string }): string | null {
  const match = LOCAL_PACKAGE_PATH_PATTERN.exec(params.packageXmlText);

  return match?.[1] ?? null;
}
