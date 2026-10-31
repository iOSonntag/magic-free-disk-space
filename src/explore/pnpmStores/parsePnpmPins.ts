import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import { parseToolVersionsText } from '../asdfVersions/parseToolVersionsText.js';
import type { ProjectPinFileKind, ProjectPinFileText } from '../projectPins/projectPins.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { parsePnpmVersionMajor } from './parsePnpmVersionMajor.js';
import { hasPnpmToolName, PNPM_TOOL_NAME } from './pnpmToolName.js';

/** The pnpm majors the projects pin, or every store version when a pin cannot be read. */
export type PnpmPins = PnpmPinsMajors | PnpmPinsEveryStoreVersion;

export type PnpmPinsMajors = { kind: 'majors'; majors: number[] };

export type PnpmPinsEveryStoreVersion = { kind: 'everyStoreVersion' };

type PnpmPinTexts = PnpmPinTextsVersions | PnpmPinsEveryStoreVersion;

type PnpmPinTextsVersions = { kind: 'versionTexts'; versionTexts: string[] };

type MiseSection = MiseSectionRoot | MiseSectionTools | MiseSectionPnpmSubtable | MiseSectionOther;

/** The top level of the config, before any table header. */
type MiseSectionRoot = { kind: 'root' };

type MiseSectionTools = { kind: 'tools' };

type MiseSectionPnpmSubtable = { kind: 'pnpmSubtable'; hasVersion: boolean };

type MiseSectionOther = { kind: 'other' };

/** The kinds of the pin files that pin a pnpm. */
export const PNPM_PIN_FILE_KINDS: ProjectPinFileKind[] = [
  'packageJson',
  'toolVersions',
  'miseConfig',
];

const PNPM_PACKAGE_MANAGER_PREFIX = `${PNPM_TOOL_NAME}@`;

const MISE_TOOLS_TABLE = 'tools';

const MISE_TOOLS_SUBTABLE_PREFIX = 'tools.';

const MISE_VERSION_KEY = 'version';

const TOML_HEADER_PATTERN = /^\[\[?\s*(.*?)\s*\]\]?$/;

const TOML_STRING_PATTERN = /^"([^"\\]*)"$|^'([^']*)'$/;

const TOML_BARE_KEY_PATTERN = /^[\w-]+$/;

const NO_PIN_TEXTS: PnpmPinTexts = { kind: 'versionTexts', versionTexts: [] };

const EVERY_STORE_VERSION: PnpmPinsEveryStoreVersion = { kind: 'everyStoreVersion' };

/** The pnpm pins of the selected pin files; a pin file that was unfit pins every store version. */
export function toolPinsToPnpmPins(params: { toolPins: ToolPins }): PnpmPins {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return EVERY_STORE_VERSION;
    case 'texts':
      return parsePnpmPins({ files: params.toolPins.files });
  }
}

/**
 * The pnpm pins of `package.json` files, by `packageManager` and `devEngines.packageManager`, of
 * `.tool-versions`, and of mise configs, added up; files of other kinds pin nothing. A pinned
 * version or range that `parsePnpmVersionMajor` does not read pins every store version.
 */
export function parsePnpmPins(params: { files: ProjectPinFileText[] }): PnpmPins {
  const pinTexts = mergePnpmPinTexts({
    pinTexts: params.files.map((file) => parsePnpmPinTexts({ file: file })),
  });

  if (pinTexts.kind === 'everyStoreVersion') {
    return EVERY_STORE_VERSION;
  }

  const majors = new Set<number>();

  for (const versionText of pinTexts.versionTexts) {
    const major = parsePnpmVersionMajor({ text: versionText });

    if (major === null) {
      return EVERY_STORE_VERSION;
    }

    majors.add(major);
  }

  return { kind: 'majors', majors: [...majors].toSorted((left, right) => left - right) };
}

function parsePnpmPinTexts(params: { file: ProjectPinFileText }): PnpmPinTexts {
  switch (params.file.kind) {
    case 'packageJson':
      return parsePackageJsonPins({ text: params.file.text });
    case 'toolVersions':
      return parseToolVersionsPins({ text: params.file.text });
    case 'miseConfig':
      return parseMiseConfigPins({ text: params.file.text });
    case 'nvmrc':
    case 'gradle':
      return NO_PIN_TEXTS;
  }
}

/**
 * The pnpm versions of `packageManager` and of `devEngines.packageManager`, added up; a text that
 * is no JSON object, or a field that names pnpm without a version or is of another shape, pins
 * every store version.
 */
function parsePackageJsonPins(params: { text: string }): PnpmPinTexts {
  const json = parseJsonValue({ text: params.text });

  if (json.kind === 'failed' || !isJsonObject(json.value)) {
    return EVERY_STORE_VERSION;
  }

  const packageManagerPins = parsePackageManagerPins({ packageManager: json.value.packageManager });
  const devEnginesPins = parseDevEnginesPins({ devEngines: json.value.devEngines });

  return mergePnpmPinTexts({ pinTexts: [packageManagerPins, devEnginesPins] });
}

/**
 * `pnpm@<version>` gives its version; any other text naming pnpm, or a value that is no string,
 * pins every store version.
 */
function parsePackageManagerPins(params: { packageManager: unknown }): PnpmPinTexts {
  if (params.packageManager === undefined || params.packageManager === null) {
    return NO_PIN_TEXTS;
  }

  if (typeof params.packageManager !== 'string') {
    return EVERY_STORE_VERSION;
  }

  const hasPnpmVersion =
    params.packageManager.startsWith(PNPM_PACKAGE_MANAGER_PREFIX) &&
    params.packageManager.length > PNPM_PACKAGE_MANAGER_PREFIX.length;

  if (hasPnpmVersion) {
    const version = params.packageManager.slice(PNPM_PACKAGE_MANAGER_PREFIX.length);

    return { kind: 'versionTexts', versionTexts: [version] };
  }

  if (hasPnpmToolName({ text: params.packageManager })) {
    return EVERY_STORE_VERSION;
  }

  return NO_PIN_TEXTS;
}

/**
 * The pnpm versions of `devEngines.packageManager`, one entry or an array of them; a `devEngines`
 * or a `packageManager` of another shape pins every store version.
 */
function parseDevEnginesPins(params: { devEngines: unknown }): PnpmPinTexts {
  if (params.devEngines === undefined || params.devEngines === null) {
    return NO_PIN_TEXTS;
  }

  if (!isJsonObject(params.devEngines)) {
    return EVERY_STORE_VERSION;
  }

  const packageManager = params.devEngines.packageManager;

  if (packageManager === undefined || packageManager === null) {
    return NO_PIN_TEXTS;
  }

  const entries: unknown[] = Array.isArray(packageManager) ? packageManager : [packageManager];

  return mergePnpmPinTexts({
    pinTexts: entries.map((entry) => parseDevEnginesEntryPins({ entry: entry })),
  });
}

/**
 * An entry whose `name` names pnpm gives its `version`, and one of another manager pins nothing;
 * an entry that is no object, has no string `name`, or names pnpm with no string `version` pins
 * every store version.
 */
function parseDevEnginesEntryPins(params: { entry: unknown }): PnpmPinTexts {
  if (!isJsonObject(params.entry) || typeof params.entry.name !== 'string') {
    return EVERY_STORE_VERSION;
  }

  if (!hasPnpmToolName({ text: params.entry.name })) {
    return NO_PIN_TEXTS;
  }

  if (typeof params.entry.version !== 'string') {
    return EVERY_STORE_VERSION;
  }

  return { kind: 'versionTexts', versionTexts: [params.entry.version] };
}

/** The version texts of every part, or every store version when any part pins it. */
function mergePnpmPinTexts(params: { pinTexts: PnpmPinTexts[] }): PnpmPinTexts {
  const versionTexts: string[] = [];

  for (const pinTexts of params.pinTexts) {
    if (pinTexts.kind === 'everyStoreVersion') {
      return EVERY_STORE_VERSION;
    }

    versionTexts.push(...pinTexts.versionTexts);
  }

  return { kind: 'versionTexts', versionTexts: versionTexts };
}

function parseToolVersionsPins(params: { text: string }): PnpmPinTexts {
  const versionTexts = parseToolVersionsText({ text: params.text })
    .filter((line) => line.toolName === PNPM_TOOL_NAME)
    .flatMap((line) => line.versions);

  return { kind: 'versionTexts', versionTexts: versionTexts };
}

/**
 * A line reader of the tools of a mise config, at its top level, in `[tools]`, and in the
 * `[tools.<key>]` subtables, not a full TOML parser: a pnpm entry it cannot read, or a pnpm
 * subtable without a `version`, pins every store version.
 */
function parseMiseConfigPins(params: { text: string }): PnpmPinTexts {
  const versionTexts: string[] = [];
  let section: MiseSection = { kind: 'root' };

  for (const line of params.text.split('\n')) {
    const content = cutTomlComment({ line: line }).trim();

    if (content === '') {
      continue;
    }

    const headerMatch = TOML_HEADER_PATTERN.exec(content);

    if (headerMatch !== null) {
      if (section.kind === 'pnpmSubtable' && !section.hasVersion) {
        return EVERY_STORE_VERSION;
      }

      section = decideMiseSection({ header: headerMatch[1] ?? '' });
      continue;
    }

    const entry = splitTomlEntry({ content: content });

    if (entry === null) {
      continue;
    }

    const entryPins = parseMiseEntryPins({ section: section, entry: entry });

    switch (entryPins.kind) {
      case 'everyStoreVersion':
        return EVERY_STORE_VERSION;
      case 'versionTexts':
        versionTexts.push(...entryPins.versionTexts);
        break;
    }

    if (section.kind === 'pnpmSubtable' && isMiseVersionKey({ keyText: entry.key })) {
      section = { kind: 'pnpmSubtable', hasVersion: true };
    }
  }

  if (section.kind === 'pnpmSubtable' && !section.hasVersion) {
    return EVERY_STORE_VERSION;
  }

  return { kind: 'versionTexts', versionTexts: versionTexts };
}

function parseMiseEntryPins(params: { section: MiseSection; entry: TomlEntry }): PnpmPinTexts {
  switch (params.section.kind) {
    case 'root':
      return parseMiseRootEntryPins({ entry: params.entry });
    case 'tools': {
      if (!hasPnpmToolName({ text: params.entry.key })) {
        return NO_PIN_TEXTS;
      }

      return parseMiseVersionValue({ valueText: params.entry.value });
    }
    case 'pnpmSubtable': {
      if (!isMiseVersionKey({ keyText: params.entry.key })) {
        return NO_PIN_TEXTS;
      }

      return parseMiseVersionValue({ valueText: params.entry.value });
    }
    case 'other':
      return NO_PIN_TEXTS;
  }
}

/**
 * A top-level `tools.<key>` reads as the `[tools]` line of `<key>`, and a `tools` value that holds
 * `pnpm` pins every store version.
 */
function parseMiseRootEntryPins(params: { entry: TomlEntry }): PnpmPinTexts {
  if (parseTomlKey({ text: params.entry.key }) === MISE_TOOLS_TABLE) {
    if (hasPnpmToolName({ text: params.entry.value })) {
      return EVERY_STORE_VERSION;
    }

    return NO_PIN_TEXTS;
  }

  const subkey = parseMiseToolsSubkey({ text: params.entry.key });

  if (subkey === null) {
    return NO_PIN_TEXTS;
  }

  return parseMiseEntryPins({
    section: { kind: 'tools' },
    entry: { key: subkey, value: params.entry.value },
  });
}

function parseMiseVersionValue(params: { valueText: string }): PnpmPinTexts {
  const versions = parseTomlVersionValues({ text: params.valueText });

  if (versions === null) {
    return EVERY_STORE_VERSION;
  }

  return { kind: 'versionTexts', versionTexts: versions };
}

function decideMiseSection(params: { header: string }): MiseSection {
  if (params.header === MISE_TOOLS_TABLE) {
    return { kind: 'tools' };
  }

  const subkey = parseMiseToolsSubkey({ text: params.header });

  if (subkey === null || !hasPnpmToolName({ text: subkey })) {
    return { kind: 'other' };
  }

  return { kind: 'pnpmSubtable', hasVersion: false };
}

/** The trimmed key after `tools.` in a header or a dotted key; `null` when it does not start so. */
function parseMiseToolsSubkey(params: { text: string }): string | null {
  if (!params.text.startsWith(MISE_TOOLS_SUBTABLE_PREFIX)) {
    return null;
  }

  return params.text.slice(MISE_TOOLS_SUBTABLE_PREFIX.length).trim();
}

function isMiseVersionKey(params: { keyText: string }): boolean {
  return parseTomlKey({ text: params.keyText }) === MISE_VERSION_KEY;
}

function cutTomlComment(params: { line: string }): string {
  const commentIndex = findUnquotedIndex({ text: params.line, character: '#' });

  if (commentIndex === null) {
    return params.line;
  }

  return params.line.slice(0, commentIndex);
}

type TomlEntry = { key: string; value: string };

function splitTomlEntry(params: { content: string }): TomlEntry | null {
  const equalsIndex = findUnquotedIndex({ text: params.content, character: '=' });

  if (equalsIndex === null) {
    return null;
  }

  return {
    key: params.content.slice(0, equalsIndex).trim(),
    value: params.content.slice(equalsIndex + 1).trim(),
  };
}

/** The index of the first `character` outside a quoted string; `null` when there is none. */
function findUnquotedIndex(params: { text: string; character: string }): number | null {
  let quote: string | null = null;

  for (let index = 0; index < params.text.length; index += 1) {
    const current = params.text[index];

    if (quote !== null) {
      if (current === quote) {
        quote = null;
      }

      continue;
    }

    if (current === '"' || current === "'") {
      quote = current;
      continue;
    }

    if (current === params.character) {
      return index;
    }
  }

  return null;
}

/** The name of a bare or quoted TOML key; `null` for a dotted or other key this reader skips. */
function parseTomlKey(params: { text: string }): string | null {
  if (TOML_BARE_KEY_PATTERN.test(params.text)) {
    return params.text;
  }

  return parseTomlString({ text: params.text });
}

function parseTomlString(params: { text: string }): string | null {
  const match = TOML_STRING_PATTERN.exec(params.text);

  if (match === null) {
    return null;
  }

  return match[1] ?? match[2] ?? null;
}

/** The strings of a one-line string or array of strings; `null` for any other value. */
function parseTomlVersionValues(params: { text: string }): string[] | null {
  const single = parseTomlString({ text: params.text });

  if (single !== null) {
    return [single];
  }

  if (!params.text.startsWith('[') || !params.text.endsWith(']')) {
    return null;
  }

  const items = params.text
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  const values = items.map((item) => parseTomlString({ text: item }));

  if (values.some((value) => value === null)) {
    return null;
  }

  return values.filter((value) => value !== null);
}
