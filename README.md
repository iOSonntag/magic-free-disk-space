# magic-free-disk-space

Finds the storage leftovers on a Mac, sorts them into sections, and permanently deletes the ones
you select. Nothing is deleted unless you pick it and confirm, as
[How it keeps you safe](#how-it-keeps-you-safe) describes.

It looks where space hides, for developers and for everyone else, in these sections:

- **Caches**: every folder in `~/Library/Caches` and `~/.cache`, and temporary files of apps
  that have not changed for 10 days. The caches of every profile of Chrome, Edge, Brave, Arc,
  Opera, Vivaldi, and Firefox, never their cookies, local storage, or databases, and Chrome's
  built-in AI model. The caches of Slack, Discord, Microsoft Teams, Spotify, Zoom, Steam, Adobe's
  video apps, and Visual Studio Code. Messages' previews, the graphics caches of macOS, and app
  logs and crash reports that have not changed for 10 days.
- **Developer tools**: Xcode build data, device support files, previews, archives, test
  simulators, and documentation; simulator logs and caches; Gradle and the Java versions it
  downloaded. The caches of npm, npx, Yarn, Bun, pnpm, Homebrew, CocoaPods, Swift Package
  Manager, Maven, NuGet, Composer, pip, uv, Poetry, Bundler, Hex, Go, Cargo, Dart, Bazel, Deno,
  Terraform, Unity, Unreal Engine, SST, Cypress, Electron, Playwright, and Puppeteer.
- **Projects**: build folders such as `node_modules`, `.next`, `.venv`, `target`, `build`,
  `Pods`, or `.terraform` of projects that have not changed for 10 days, each only beside the file
  that marks its kind of project, such as `Cargo.toml` beside `target`.
- **Containers and VMs**: Docker's unused images, stopped containers, unused volumes, and build
  cache unused for 10 days, in Docker Desktop, OrbStack, or Colima while its engine runs; old
  Vagrant boxes; the downloads of Lima and Colima, and the caches of Rancher Desktop and Tart.
- **Local AI models**: each model of Ollama and LM Studio, and each Hugging Face repository, with
  its size and the date it was downloaded.
- **Apps** of 268 MB (256 MiB) or more with no sign of use for 180 days, and the data of removed
  apps: the folders an app keeps in `~/Library` whose app is in no Applications folder and that
  have not changed for 180 days.
- **Downloads and installers**: installers and unfinished downloads in Downloads, macOS
  installers in Applications, and the iPhone and iPad system downloads of Finder.
- **Large files** of 105 MB (100 MiB) or more in Desktop, Documents, Downloads, and Movies,
  unchanged for 180 days.
- **iCloud Drive**: downloaded files untouched for 180 days, removed from this Mac only. They
  stay in iCloud and download again when you open them.
- **The Trash**.
- **Handled by its own app**: Photos, the photos and files in Messages, Music and TV downloads,
  iPhone and iPad backups, GarageBand and Logic sounds, Apple Loops, iMovie, Time Machine
  snapshots, and iCloud's Optimize Mac Storage. Each shows the step in that app and a button that
  opens it or its pane of System Settings. The tool never deletes them.

Items a developer tool owns are offered with the reasons for each, under **Explore** in the
command line tool and in their section in the app, and removed by the tool's own command where it
has one. An item the scan cannot judge, such as a tool version a project may pin in a file the
scan does not read, is not offered, and the tool's advice shows instead. They are:

- Simulators whose runtime is gone, with `xcrun simctl delete`, and simulator runtimes no
  available simulator uses and not used for 180 days, with `xcrun simctl runtime delete`.
- Android emulators not used for 180 days, with `avdmanager delete avd`. Android system images
  no emulator uses, the Android emulator program while no emulator exists, and Android platforms
  whose API level no project's `compileSdk` names, are deleted as their folder.
- Old versions of Homebrew packages, with `brew cleanup <package>`, and packages that nothing
  needs any more, with `brew autoremove`.
- Unused Dart and Flutter packages, with `dart pub cache gc`.
- Tool versions no project pins: mise versions, with `mise uninstall`, asdf versions, with
  `asdf uninstall`, and rustup toolchains, with `rustup toolchain uninstall`. Node.js versions of
  nvm that neither its default alias nor any `.nvmrc` resolves to, and Flutter versions of FVM
  that are neither its global version nor named by a project's `.fvmrc`, are deleted as their
  folder.
- pnpm store versions that neither an installed pnpm nor a pnpm pinned by a project uses, and that
  hold no global virtual store, deleted as their folder.
- conda's unused packages and downloads, with `conda clean`.
- Old Vagrant box versions, with `vagrant box remove`.
- Docker's images, containers, volumes, and build cache, through the engine's own API.
- Visual Studio Code extensions that VS Code marked for removal or that a newer version of them
  replaced, deleted as their folder.
- Versions of JetBrains IDEs and Android Studio that a newer version replaced: their caches,
  logs, plugins, and settings, each as its own item.
- Old Claude Code versions, keeping the two newest and the one its launcher runs, and Claude Code
  conversations older than 30 days, one item per project, which do not come back.
- Local AI models, iCloud Drive files, old installers, unfinished downloads, and the copies of
  attachments Mail saved when you opened them and that nobody changed since.

Other places are only shown, with advice, because the tool that owns them must clean them:
Docker's disk image while no engine runs, Homebrew apps, macOS updates, Spotify downloaded music,
and the places of Apple's own apps.

## Download

The app is on the [Releases](https://github.com/iOSonntag/magic-free-disk-space/releases) page
as a disk image, `Magic-Free-Disk-Space-<version>.dmg`. It runs on macOS 13 or later, on Apple
silicon and Intel. Open the disk image and drag the app into Applications. Then grant it Full
Disk Access once, as [App](#app) describes. The grant stays across updates: every release is
signed with the same Developer ID, by which macOS knows the app.

## Usage

Requires macOS and [Bun](https://bun.sh).

```sh
bun install
bun start                  # scan, select, confirm with DELETE, delete
bun start --list           # scan and show the list; deletes nothing
bun start --dry-run --select "1-3,7"   # show what a selection would delete; deletes nothing
```

The selection takes numbers and ranges (`1-3, 7`), `safe` for every item marked safe outside
Explore, or `none`. Pressing Enter alone cancels.

| Option                 | Meaning                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `--list`               | Show what could be freed, then exit.                                           |
| `--dry-run`            | Scan and show the removal plan.                                                |
| `--select <selection>` | With `--dry-run`: the items to plan.                                           |
| `--stale-days <days>`  | Days without changes before an item counts as stale (10).                      |
| `--unused-days <days>` | Days without use before an item counts as unused (180).                        |
| `-h`, `--help`         | Show the help.                                                                 |

The stale days decide temporary files, app logs and crash reports, project build folders, the
installers and unfinished downloads in Downloads, and Mail's attachment copies. The unused days
decide apps, large files, the data of removed apps, iCloud Drive files, simulator runtimes, and
Android emulators.

| Exit code          | Meaning                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| 0                  | Done, cancelled, or nothing to do.                                                |
| 1                  | A deletion failed, or the deletion log stopped the run.                           |
| 2                  | Bad usage, not macOS, or an unsafe setup (see below).                             |
| 3                  | Deleting was asked for without an interactive terminal.                           |
| 4                  | The deletion log could not be created, so nothing was deleted.                    |
| 129, 130, 131, 143 | Stopped by SIGHUP, SIGINT, SIGQUIT, or SIGTERM; a tool it ran is stopped with it. |

### What the scan shows

The list starts with a summary: how many items the scan found and their total size, then how
much is safe to free, how much to check before deleting, and how much is in Explore. Items marked
`never` count in the total only.

The items follow in the sections listed above, each with its size. A section lists its `safe`
items first and its other items under "Check before deleting". Explore comes last, with the
places to handle yourself after its items. The numbers count from top to bottom across the
sections and Explore. Last come the skipped items, the places the scan could not read, and the
tools it could not ask. After a deletion the tool names what it freed and the space now
available on the disk.

Sizes are in decimal units, as Finder shows them: 1 GB is 1,000,000,000 bytes. A size counts
each block of the disk once: a file shares blocks with its APFS clones, such as the
`node_modules` that pnpm cloned from its store, and counts only the blocks it alone holds. A
file with several hard links counts once, and only when every link of it lies in the item.

### Full Disk Access

macOS privacy protection keeps programs without Full Disk Access out of some folders, such as the
Trash and the caches of Apple's apps. The scan names each place it blocked as "blocked by macOS
privacy protection", and only then suggests Full Disk Access. A place that reads "permission
denied" is closed by its own permissions, which Full Disk Access does not change. To scan the
protected places too, give your terminal app Full Disk Access in System Settings > Privacy &
Security > Full Disk Access.

## App

A Mac app with the same scan and the same guards, in an always-dark window with a sidebar of
pages. It runs on macOS 13 or later. A release, under [Download](#download), is signed with Developer ID
and notarized by Apple. A local build needs Bun, [Flutter](https://flutter.dev), and Xcode, and no
developer certificate: it is signed ad hoc, for this Mac only.

```sh
bun run app:install    # build the app and replace it in /Applications; quit the app first
bun run app:run        # build and start a debug version
```

- The app scans at start, with the default days: 10 without changes, 180 without use. "Scan
  again" in the toolbar scans anew.
- The Overview shows the disk as a ring, with its space, what is available, and what can be
  freed, and a card for each section with its size and its number of items. Each section that
  holds anything has a page of its own. It groups its items as "Safe to remove", "Review first",
  and "Can't be undone", and each item shows its size, its last use, and its path, its
  explanation, and "Reveal in Finder".
- "Clean safe items" on the Overview ticks the items `safe` selects and opens the confirmation at
  once. It never holds an item that does not come back.
- The selection holds across the pages. Its plan opens a Review page, and Delete asks for the
  confirmation [How it keeps you safe](#how-it-keeps-you-safe) describes. The result names the
  space freed and each item that stayed, whole or in part, with its reason.
- When you click Done on the result page, the app scans your Mac again by default. This keeps
  the list in line with what is now on the disk.
- You can turn this off with the "Scan again after deleting" setting on the Settings page. When
  the setting is off, Done does not start a new scan. Instead, the app removes the deleted items
  from the current list and shows the list right away. To scan again, click "Scan again" in the
  toolbar. With the setting off:
  - The items are numbered again, and nothing is selected.
  - An item that was only partly deleted stays in the list. Its size is an estimate: the size
    from the scan minus the space that was freed.
  - All other items keep the sizes from the scan.
  - The one-hour limit below still counts from the original scan. If that scan is older than an
    hour when you click Done, the app scans again.
- "Handled by its own app" has a page too, with the places the sections above name.
- A scan older than an hour must be redone before anything is deleted, since the app may stay
  open for days.
- Full Disk Access goes to the app, not the terminal. At start the app checks whether it has it;
  without it, a card says what a scan misses, and its Open System Settings button opens the Full
  Disk Access pane. Turn the app on there, then quit the app and open it again: macOS applies the
  grant from the next start.
- A local build needs Full Disk Access again after each install: its ad hoc signature changes
  with every build, and macOS knows the app by it. A release keeps the grant across updates.
- At start the app looks for a newer release on GitHub. When there is one, a card names it, and
  its download link opens the release's page. "Look for updates at start" on the Settings page
  turns the check off.
- Reduce Motion in System Settings turns the app's motion off.
- The app runs `magic-free-disk-space-bridge` from inside its bundle, a build of
  `src/bridgeMain.ts` that answers the app over a pipe. It is part of the app, not a tool to run
  yourself.

## How it keeps you safe

- **Deletion is permanent.** Items do not go to the Trash. That is the point of the tool, so
  every deletion asks first. The CLI asks you to type `DELETE`, whatever the risk of the items.
  The app asks in an alert that names what goes, and asks for the typed `DELETE` too when the
  plan holds a `careful` item; it then sends `DELETE` to its bridge, which refuses a plan without
  it.
- **Only what you select.** The tool deletes exactly the numbers you chose. A test checks this
  for every one of the 64 possible selections of six items.
- **Risk labels.** Each item is `safe` (comes back by itself), `review` (comes back, but costs a
  download or a rebuild), `careful` (does not come back), or `never` (shown for information and
  always refused).
- **Guards before every deletion.** An item is refused when it is a symbolic link, a protected
  folder such as your home, Library, Documents, or Downloads folder itself, a folder that holds a
  protected folder, anything in `~/.ssh`, `~/.gnupg`, your keychains, or the deletion log, or
  anything outside your home, temporary, user cache, and Applications folders. Mail, Messages,
  the Photos library, and the iPhone and iPad backups hold what may be your only copy of them, so
  nothing in them is offered or deleted, except the previews Messages makes again. The scan holds
  back an offer that touches any of these, so the list never shows what a deletion would refuse.
- **iCloud Drive is only evicted.** Nothing in `~/Library/Mobile Documents` is deleted, since a
  deletion there deletes on your other devices too. A downloaded file is removed from this Mac
  with `brctl evict`, one file at a time, and stays in iCloud. Right before each file, it is
  checked again: the same file, still downloaded, still untouched.
- **Docker through its engine.** The tool talks to a running Docker Desktop, OrbStack, or Colima
  over the engine's own socket, owned by you, and runs no `docker` command, so no context or
  setting can point it at another engine. It never starts an engine, never forces a removal, and
  never deletes a disk image. Right before each removal the item is asked for again: the same id,
  still unused. An image the engine refuses as in use is kept.
- **macOS installers by their identity.** An `Install macOS` app counts only when its bundle id
  is Apple's installer, it is not running, it installs another major version than the one this
  Mac runs, and it is older than 14 days. One owned by root is only shown, with the advice to drag it to the Trash.
- **A safe starting point.** The tool refuses to run as root or with `sudo`, with a home folder
  that is not yours, or when the temporary folder overlaps your home. It asks macOS for your
  temporary folder instead of trusting `TMPDIR`, because everything in it may count as temporary.
- **Unchanged since the scan.** Right before deleting, the tool checks that the item still is
  the same file or folder it measured (same disk, inode, creation time, kind, and path). If it
  was replaced, the tool leaves it alone.
- **Running apps are left alone.** The cache of an app that is running is not offered, and no
  folder that holds such a cache is offered whole. After you confirm, the running programs are
  read again, so an app opened during the scan keeps its data. If they cannot be read, every
  app-owned item is held back.
- **Tools remove what they own.** Items that a developer tool owns, such as a simulator, an
  Android emulator, or an old Homebrew version, are listed with the reasons the tool gave, and
  the plan names the command that removes each. An item whose tool has no command for it, such as
  an Android system image or an old VS Code extension, is deleted as its folder, under the same
  guards as every other folder. They are never selected for you, not even by
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
- **Left-behind app data is double-checked.** An app's folder in `~/Library` counts as left
  behind only when every installed app could be read, no installed app has its bundle id, and
  nothing in it changed for the unused period. An app that still runs from another folder keeps
  writing to it. In `Application Support` a folder may also match by the app's name; such an item
  says so, and a name that is Apple's, a vendor's, or a common word, or that shares a word with
  an installed app, is never matched. These items do not come back, so they are never selected
  for you.
- **A log of every deletion.** Before each deletion the tool writes what it is about to delete
  to `~/Library/Logs/magic-free-disk-space/deletions.jsonl`, and the outcome after it; for a tool
  item, the command before it runs, and its exit code, the end of its error output, and the space
  it freed after. If the log cannot be written, the run stops.
- **Interactive only.** The CLI deletes only in a terminal; a piped or scripted run is refused
  before the scan. `--list` and `--dry-run` never delete. The app deletes exactly the plan you
  confirmed.

## Privacy

The command line tool works offline and sends nothing anywhere. The app looks for a new version on
GitHub at start unless you turn that off; it sends nothing else. For that check its bridge asks
GitHub's API for the latest release of this repository,
`https://api.github.com/repos/iOSonntag/magic-free-disk-space/releases/latest`, reads only the
release's version tag from the answer, and builds the link to the release's page from it. GitHub
sees the request as it sees any visit, with your IP address. "Look for updates at start" on the
app's Settings page turns the check off. Neither has telemetry.

The tool reads file sizes, dates, and app identifiers, and runs `ps`, `plutil`, `xcode-select`,
and `getconf`. To judge an app, it reads the bundle id and the macOS version of the app's
`Info.plist`. To judge Android,
VS Code, and IDE items, it reads their own records: the SDK's `package.xml` files, each
emulator's `.ini` and `config.ini`, VS Code's `extensions.json` and `.obsolete` files, and the
`product-info.json` of each running JetBrains IDE. To size the local AI models, it reads
Ollama's model manifests and the `refs` files of Hugging Face, which name each model's current
revision. To learn which tool
versions your projects pin, it reads their `.tool-versions`, `.nvmrc`, `.fvmrc`,
`rust-toolchain`, `rust-toolchain.toml`, `build.gradle`, `build.gradle.kts`, and mise config
files, the `package.json` files that have a `pnpm-lock.yaml` beside them, those of the configs
mise tracks, nvm's alias files, and asdf's `~/.asdfrc`. To learn which pnpm versions are
installed, it reads the `package.json` of each pnpm installed as a global package of pnpm or npm,
and pnpm's launchers in `~/Library/pnpm` and `~/.local/share/pnpm`. It only reads them, and it
never opens a Claude Code conversation, a mail, or a document.

During a scan it also runs the list and dry-run forms of the developer tools it finds, `xcrun
simctl`, `brew`, `dart`, `mise`, `rustup`, `conda`, and `vagrant`, to learn which of their items
are unused; these forms change nothing. It asks a running Docker engine over its socket for its
version and its disk use, which changes nothing either. Only after you confirm does it run their
cleanup commands, such as `brew cleanup` or `avdmanager delete avd`, ask the engine to remove an
image, a container, a volume, or build cache, or run `brctl evict`, one for each item you
selected. A tool runs with a fixed environment that keeps it offline where the tool allows that.

At start the app asks its bridge whether it has Full Disk Access. The bridge opens
`~/Library/Application Support/com.apple.TCC/TCC.db`, or else `~/Library/Safari`, and closes it
at once, reading no byte and listing no name: macOS refuses the open itself while the app lacks
the access. The app's buttons run `open`: with the link of a System Settings pane, such as Full
Disk Access or Storage, with the release's page, with `-b` and the bundle id of an Apple app,
such as Photos, or with `-R` and an item's path to show it in Finder.

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
- Sizes count the blocks each item alone holds. Where a file's private size cannot be read, it
  counts all its blocks, and the scan says so; such an item may free less than shown.
- Deleting a file in a folder that iCloud Drive syncs deletes it on your other devices as well.
  The tool deletes nothing in iCloud Drive's own folder, but a folder such as Desktop or
  Documents may sync to it too.
- On Windows, deleting a file in a folder that OneDrive syncs deletes it from OneDrive and your
  other devices as well. A file OneDrive keeps only online is never read or deleted.
- Space Docker frees lies inside its disk image, which macOS gets back within minutes, not at
  once; the result of a deletion says so. While no engine runs, the scan shows only the disk
  image's size, with advice.
- Docker's images used by more than one name, and volumes whose size or use the engine does not
  report, are not offered.
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
- macOS only, version 13 or later.

## Development

```sh
bun test           # unit, filesystem, and end-to-end safety tests on temporary fixtures
bun run typecheck
bun run check      # Biome lint and format check, the module boundaries, and their baseline
cd app && flutter analyze && flutter test   # the app
```

Tests never touch your real home folder: each one builds its own folders in a temporary
directory and removes them afterwards.

Each folder of `src/` is a module whose `boundary.ts` declares the modules it imports and the files
other modules may import. The specs in `test/architecture` fail an import the manifests do not
allow, and a cycle between the manifests. `boundary-suppressions.json` freezes the violations kept
for now; it may only shrink against the base of a change, `origin/main` unless
`BASELINE_BASE_REF` names another.

### Releasing

The workflow `.github/workflows/release.yml` builds the app for Apple silicon and Intel, signs it
with Developer ID under the hardened runtime, runs the signed bridge on both architectures,
notarizes and staples the app and its disk image, and publishes the disk image. Only a pushed
version tag or a rehearsal started by hand runs it.

The scripts in `scripts/release/` set it up and start it from this checkout, with `gh` logged in
as an admin of the repository.

Set it up once, and again when the certificate expires after five years:

1. `scripts/release/setupSigning.sh request <folder> <email>` makes a private key and a certificate
   signing request in a new folder outside any git repository, and prints where they go.
2. The Account Holder of the Apple developer team uploads the request on developer.apple.com as a
   Developer ID Application certificate and downloads the `.cer`. An Admin can only make a
   certificate whose key stays at Apple, which a runner cannot import. In App Store Connect, under
   Users and Access > Integrations > App Store Connect API > Team Keys, create a key with the
   Developer role and download its `.p8`. An Individual Key cannot notarize for the team.
3. The `install` step checks that the certificate belongs to the folder's key, builds a `.p12`
   with a random password, and sets up the repository:

   ```sh
   scripts/release/setupSigning.sh install <folder> <certificate.cer> <AuthKey.p8> <key id> <issuer id>
   ```

   - An environment `release` whose deployment branches and tags are `main` and tags `v*`. Only
     runs from these refs get its secrets, so no other branch can sign.
   - The environment's six secrets, each passed to `gh` on stdin, never on a command line or the
     clipboard: `DEVELOPER_ID_CERTIFICATE_P12_BASE64` and `DEVELOPER_ID_CERTIFICATE_PASSWORD` for
     signing, `APPLE_TEAM_ID` from the certificate, and `APP_STORE_CONNECT_API_KEY_P8`,
     `APP_STORE_CONNECT_API_KEY_ID`, and `APP_STORE_CONNECT_ISSUER_ID` for notarization.
   - A tag ruleset "Release tags" that lets only repository admins create, move, or delete tags
     `v*`, since a pushed tag publishes a release.

   It removes the private key and the request, and moves the `.p8` into the folder, which then
   holds every secret: the `.p12`, its password, and the `.p8`. Keep them in your password manager
   and delete the folder. A failed `install` leaves every file in place, so running it again picks
   up from there.

A rehearsal runs every step but publishing: `scripts/release/rehearse.sh [X.Y.Z]` starts the
workflow on `main` with that version or the workflow's default `0.0.0`, waits for the run, and
downloads its disk image into `~/Downloads`. The disk image also stays an artifact of the run for
7 days. A rehearsal at `0.0.0` shows the update notice once any release exists.

A release: `scripts/release/tagRelease.sh X.Y.Z` on `main`. It refuses a version with a leading
zero, a tag that exists, a version not newer than the latest tag `v*` on origin, a checkout off
`main`, changes to tracked files, and a `main` that differs from origin's. It shows the commit,
and once you type the tag, it pushes the annotated tag `vX.Y.Z`. The tag names the version, and
the run number the build number. Once the build passed, the workflow creates the GitHub release
with the disk image and generated notes. A release is never rolled back: the next tag fixes a
fault.

Check the first releases once on a Mac that is not your development Mac: install the disk image
of one published tag, grant Full Disk Access, and see that the app opens with no warning from
Gatekeeper. Then publish the next tag, see the update notice in the app, install the new disk
image over the old app, and see that Full Disk Access is still granted.

`scripts/buildAppIcons.sh <logo.png>` makes the app's icon set from a 1024 x 1024 PNG.

## License

MIT
