/** The size of one volume and the part of it a new file may take, in bytes. */
export type VolumeSpace = {
  capacityBytes: number;
  /** Free for a new file now, without the space APFS could purge on demand. */
  availableBytes: number;
};
