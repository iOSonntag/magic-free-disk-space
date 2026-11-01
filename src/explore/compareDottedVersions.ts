/**
 * Orders two dotted numeric versions, such as `1.10.0`: below zero when `left` is older, above
 * when newer, zero when equal. A missing group counts as 0, so `1.2` equals `1.2.0`.
 */
export function compareDottedVersions(left: string, right: string): number {
  const leftGroups = left.split('.').map(Number);
  const rightGroups = right.split('.').map(Number);
  const groupCount = Math.max(leftGroups.length, rightGroups.length);

  for (let i = 0; i < groupCount; i++) {
    const difference = (leftGroups[i] ?? 0) - (rightGroups[i] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}
