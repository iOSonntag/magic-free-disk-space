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
  Discord, Chrome, Brave, Visual Studio Code, Spotify, and Zoom.
- **Project build folders** such as `node_modules`, `.next`, `.venv`, or `_build` of projects
  that have not changed for 10 days.
- **Apps** of 256 MiB or more with no sign of use for 180 days.
- **Large files** of 100 MiB or more in Desktop, Documents, Downloads, and Movies, unchanged for
  180 days.
- **Data of removed apps**: sandbox containers whose app is in no Applications folder and that
  have not changed for 180 days.
- **The Trash**.

Under **Explore**, items a developer tool owns are offered with the reasons for each, and removed
by the tool's own command where it has one. An item the scan cannot judge, such as a tool version
a project may pin in a file the scan does not read, is not offered, and the tool's advice shows
instead. Explore offers:

- Simulators whose runtime is gone, with `xcrun simctl delete`, and simulator runtimes no
  available simulator uses and not used for 180 days, with `xcrun simctl runtime delete`.
- Android emulators not used for 180 days, with `avdmanager delete avd`. Android system images
  no emulator uses, the Android emulator program while no emulator exists, and Android platforms
  whose API level no project's `compileSdk` names, are deleted as their folder.
- Old versions of Homebrew packages, with `brew cleanup <package>`, and packages that nothing
  needs any more, with `brew autoremove`.
- Unused Dart and Flutter packages, with `dart pub cache gc`.
- Tool versions no project pins: mise versions, with `mise uninstall`, and asdf versions, with
  `asdf uninstall`. Node.js versions of nvm that neither its default alias nor any `.nvmrc`
  resolves to are deleted as their folder.
- pnpm store versions that neither an installed pnpm nor a pnpm a project pins uses, deleted as
  their folder.
- Visual Studio Code extensions that VS Code marked for removal or that a newer version of them
  replaced, deleted as their folder.

Other places are only shown with advice, because the tool that owns them must clean them:
Docker images, Homebrew apps, iPhone backups, Spotify offline music, and more.

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
| `--unused-days <days>` | Days without use before an item counts as unused (180).                        |
| `-h`, `--help`         | Show the help.                                                                 |

| Exit code          | Meaning                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| 0                  | Done, cancelled, or nothing to do.                                                |
| 1                  | A deletion failed, or the deletion log stopped the run.                           |
| 2                  | Bad usage, not macOS, or an unsafe setup (see below).                             |
| 3                  | Deleting was asked for without an interactive terminal.                           |
| 4                  | The deletion log could not be created, so nothing was deleted.                    |
| 129, 130, 131, 143 | Stopped by SIGHUP, SIGINT, SIGQUIT, or SIGTERM; a tool it ran is stopped with it. |

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
- **Tools remove what they own.** Items that a developer tool owns, such as a simulator, an
  Android emulator, or an old Homebrew version, are listed under Explore with the reasons the
  tool gave, and the plan names the command that removes each. An item whose tool has no command
  for it, such as an Android system image or an old VS Code extension, is deleted as its folder,
  under the same guards as every other folder. They are never selected for you, not even by
  "safe". A tool counts only from a known install location, never from `PATH`, and only when it
  is owned by you or root and nobody else can change it. Right before its command runs or its
  folder is deleted, the item is checked again: a changed item, or one whose app or tool is busy,
  is left alone, and a command stops at a 10 minute limit.
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
  to `~/Library/Logs/magic-free-disk-space/deletions.jsonl`, and the outcome after it; for a tool
  item, the command before it runs, and its exit code, the end of its error output, and the space
  it freed after. If the log cannot be written, the run stops.
- **Interactive only.** The CLI deletes only in a terminal; a piped or scripted run is refused
  before the scan. `--list` and `--dry-run` never delete. The app asks for `DELETE` on its
  confirmation screen and deletes exactly the plan that screen showed.

## Privacy

The tool works offline. It sends nothing anywhere and has no telemetry. It reads file sizes,
dates, and app identifiers, and runs `ps`, `plutil`, `xcode-select`, and `getconf`. To judge
Android and VS Code items, it also reads their own records: the SDK's `package.xml` files, each
emulator's `.ini` and `config.ini`, and VS Code's `extensions.json` and `.obsolete` files. To
learn which tool versions your projects pin, it reads their `.tool-versions`, `.nvmrc`,
`build.gradle`, `build.gradle.kts`, and mise config files, the `package.json` files that have a
`pnpm-lock.yaml` beside them, those of the configs mise tracks, nvm's alias files, asdf's
`~/.asdfrc`, the `package.json` of each installed pnpm, and pnpm's launchers in `~/Library/pnpm`
and `~/.local/share/pnpm`. It only reads them.

During a scan it also runs the list and dry-run forms of the developer tools it finds, `xcrun
simctl`, `brew`, `dart`, and `mise`, to learn which of their items are unused; these forms
change nothing. Only after you type `DELETE` does it run their cleanup commands, such as
`brew cleanup` or `avdmanager delete avd`, one for each item you selected. A tool runs with a
fixed environment that keeps it offline where the tool allows that.

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
- A tool version, Android platform, or pnpm store version counts as pinned only by a pin file,
  such as a `.tool-versions` or `build.gradle`, that the search for project build folders reaches
  in your home folder, by a config mise tracks, or, for nvm, by its default alias. The search does
  not reach a file in a folder more than 7 folders below your home folder, in a hidden folder, in a
  folder named like a project build folder, such as `node_modules`, in your `Applications`,
  `Library`, `Movies`, `Music`, `Pictures`, or `Public` folder, or outside your home folder, such
  as on a disk mounted elsewhere.
- nvm's `NVM_ONLY` setting lives in your shell, which the scan does not see. Your default alias and
  each `.nvmrc` resolve as if it were unset, so the Node.js version nvm picks under it may be
  offered.
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
