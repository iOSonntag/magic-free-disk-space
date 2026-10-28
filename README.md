# magic-free-disk-space

Finds the storage leftovers on a Mac, ranks them by the space they take, and permanently
deletes the ones you select. Nothing is deleted unless you pick it and then type `DELETE`.

It looks where space hides from people who are not storage experts:

- **Temporary files** of apps that have not changed for 10 days.
- **Developer caches**: Xcode build data and device support files, simulator logs, Gradle,
  Dart, Playwright and Puppeteer browsers.
- **Package manager caches**: npm, Bun, pnpm, Homebrew, CocoaPods, Swift Package Manager,
  Composer, pip, uv, Bundler, Hex.
- **App caches**: every folder in `~/Library/Caches` and `~/.cache`, plus the caches of Slack,
  Discord, Chrome, Brave, Visual Studio Code, and Zoom.
- **Project build folders** such as `node_modules`, `.next`, `.venv`, or `_build` of projects
  that have not changed for 10 days.
- **Apps** of 256 MiB or more with no sign of use for 180 days.
- **Large files** of 100 MiB or more in Desktop, Documents, Downloads, and Movies, unchanged for
  180 days.
- **Data of removed apps**: sandbox containers whose app is in no Applications folder and that
  have not changed for 180 days.
- **The Trash**.

Some places are only shown with advice, because the tool that owns them must clean them:
Docker images, iOS simulators and runtimes, Android emulators, the pnpm store, Homebrew packages,
installed Node.js versions, iPhone backups, and more.

## Usage

Requires macOS and [Bun](https://bun.sh).

```sh
bun install
bun start                  # scan, select, confirm with DELETE, delete
bun start --list           # scan and show the list; deletes nothing
bun start --dry-run --select "1-3,7"   # show what a selection would delete; deletes nothing
```

The selection takes numbers and ranges (`1-3, 7`), `safe` for every item marked safe, or `none`.
Pressing Enter alone cancels.

| Option                 | Meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--list`               | Show what could be freed, then exit.                                           |
| `--dry-run`            | Scan and show the removal plan.                                                |
| `--select <selection>` | With `--dry-run`: the items to plan.                                           |
| `--stale-days <days>`  | Days without changes before temporary and project folders count (10).          |
| `--unused-days <days>` | Days without use before apps, large files, and removed apps' data count (180). |
| `-h`, `--help`         | Show the help.                                                                 |

| Exit code | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| 0         | Done, cancelled, or nothing to do.                                   |
| 1         | A deletion failed, or the deletion log stopped the run.              |
| 2         | Bad usage, not macOS, or an unsafe setup (see below).                |
| 3         | Deleting was asked for without an interactive terminal.              |
| 4         | The deletion log could not be created, so nothing was deleted.       |

### Full Disk Access

macOS hides some folders, such as the Trash and the caches of Apple's apps, from programs
without Full Disk Access. The scan lists what it could not read. To scan those places too, give
your terminal app Full Disk Access in System Settings > Privacy & Security.

## App

A Mac app with the same scan and the same guards: tick the items, review the plan, type `DELETE`.
Building it needs Bun, [Flutter](https://flutter.dev), and Xcode; no developer certificate, because
the app is signed for this Mac only.

```sh
bun run app:install    # build the app and replace it in /Applications; quit the app first
bun run app:run        # build and start a debug version
```

- The app scans with the default days: 10 without changes, 180 without use.
- A scan older than an hour must be redone before anything is deleted, since the app may stay
  open for days.
- Full Disk Access goes to the app, not the terminal. Grant it again after each install: every
  build changes the signature macOS knows the app by.
- The app runs `magic-free-disk-space-bridge` from inside its bundle, a build of
  `src/bridgeMain.ts` that answers the app over a pipe. It is part of the app, not a tool to run
  yourself.

## How it keeps you safe

- **Deletion is permanent.** Items do not go to the Trash. That is the point of the tool, so
  every deletion asks you to type `DELETE` first, whatever the risk of the items.
- **Only what you select.** The tool deletes exactly the numbers you chose. A test checks this
  for every one of the 64 possible selections of six items.
- **Risk labels.** Each item is `safe` (comes back by itself), `review` (comes back, but costs a
  download or a rebuild), `careful` (does not come back), or `never` (shown for information and
  always refused).
- **Guards before every deletion.** An item is refused when it is a symbolic link, a protected
  folder such as your home, Library, Documents, or Downloads folder itself, a folder that holds a
  protected folder, anything in `~/.ssh`, `~/.gnupg`, your keychains, or the deletion log, or
  anything outside your home, temporary, and Applications folders.
- **A safe starting point.** The tool refuses to run as root or with `sudo`, with a home folder
  that is not yours, or when the temporary folder overlaps your home. It asks macOS for your
  temporary folder instead of trusting `TMPDIR`, because everything in it may count as temporary.
- **Unchanged since the scan.** Right before deleting, the tool checks that the item still is
  the same file or folder it measured (same disk, inode, creation time, kind, and path). If it
  was replaced, the tool leaves it alone.
- **Running apps are left alone.** The cache of an app that is running is not offered, and no
  folder that holds such a cache is offered whole. After you type `DELETE`, the running programs
  are read again, so an app opened during the scan keeps its data. If they cannot be read, every
  app-owned item is held back.
- **Symbolic links are never followed**, neither while measuring nor while deleting: deleting a
  folder removes a link inside it, never the file the link points to.
- **Mounted disks are left alone.** A folder where another disk is mounted, or that holds one,
  is not offered, because deleting it would delete into that disk.
- **Documents stay whole.** The search for large files never enters a folder named with an
  extension, such as a photo or iMovie library or a virtual machine, so it never offers a part
  of one.
- **Left-behind app data is double-checked.** A sandbox container counts as left behind only when every
  installed app could be read and nothing in the container changed for the unused period. An
  app that still runs from another folder keeps writing to its container.
- **A log of every deletion.** Before each deletion the tool writes what it is about to delete
  to `~/Library/Logs/magic-free-disk-space/deletions.jsonl`, and the outcome after it. If the log
  cannot be written, the run stops.
- **Interactive only.** The CLI deletes only in a terminal; a piped or scripted run is refused
  before the scan. `--list` and `--dry-run` never delete. The app asks for `DELETE` on its
  confirmation screen and deletes exactly the plan that screen showed.

## Privacy

The tool works offline. It sends nothing anywhere and has no telemetry. It reads file sizes,
dates, and app identifiers, and runs only `ps`, `plutil`, `xcode-select`, and `getconf`.

## Limits

- The check that an item is unchanged covers the item itself, not every file inside a folder:
  files added to a folder after the scan go with it. The check runs right before the deletion,
  but not atomically with it; a change in the instant between the two is not detected.
- An app is known to be running only when it runs from your Applications folders. An app started
  from a disk image or another folder does not hold back its caches.
- A cache folder counts as an app's only when it is named after the app's identifier or its name.
  Another cache folder is offered even while its app runs.
- The data of an app that lives outside the Applications folders, such as on an external disk,
  looks left behind once that app has not run for the unused period.
- Sizes are the space on disk. Files that share their data, such as APFS clones and hard links
  shared with other folders, may free less than shown.
- Deleting a file in a folder that iCloud Drive syncs deletes it on your other devices as well.
- A disk mounted inside a folder after the scan, or in a part of it the scan could not read,
  would be deleted with that folder.
- An app's last use is read from the files the app writes, not from Spotlight, which does not
  record it reliably. An app with no such files is never offered.
- macOS only.

## Development

```sh
bun test           # unit, filesystem, and end-to-end safety tests on temporary fixtures
bun run typecheck
bun run check      # Biome lint and format check
cd app && flutter analyze && flutter test   # the app
```

Tests never touch your real home folder: each one builds its own folders in a temporary
directory and removes them afterwards.

## License

MIT
