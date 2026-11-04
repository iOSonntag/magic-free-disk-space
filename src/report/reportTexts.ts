/**
 * The words of the operating system in the texts every platform shows. A text only one platform
 * can reach, such as a Full Disk Access notice, keeps its words where it stands.
 */
export type ReportTexts = {
  /** The computer, as in "Finds storage leftovers on this Mac". */
  computerPhrase: string;
  /** The operating system, as in "owned by macOS". */
  systemName: string;
  /** Where deleted files wait, as in "the items do not go to the Trash". */
  trashName: string;
  /** The cloud store that keeps files off the disk, as in "in iCloud, not on this Mac". */
  cloudStoreName: string;
  /** The step that replaces the installed app with a downloaded release. */
  updateInstallText: string;
};
