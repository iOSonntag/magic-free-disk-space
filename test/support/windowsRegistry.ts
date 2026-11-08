/**
 * Writes a value of a registry key through `reg.exe`, which makes the key if it is missing. Throws
 * with the stderr of `reg.exe` when it exits with a code other than 0.
 */
export function saveRegistryValue(params: {
  key: string;
  valueName: string;
  type: 'REG_SZ' | 'REG_DWORD';
  data: string;
}): void {
  const result = Bun.spawnSync(
    ['reg', 'add', params.key, '/v', params.valueName, '/t', params.type, '/d', params.data, '/f'],
    { stdout: 'ignore', stderr: 'pipe' },
  );

  if (result.exitCode !== 0) {
    throw new Error(`reg add failed: ${result.stderr.toString()}`);
  }
}

/**
 * Deletes a registry key with its subkeys through `reg.exe`. A failed deletion is not reported,
 * so a cleanup never masks the failure of its test.
 */
export function deleteRegistryKey(params: { key: string }): void {
  Bun.spawnSync(['reg', 'delete', params.key, '/f'], { stdout: 'ignore', stderr: 'ignore' });
}
