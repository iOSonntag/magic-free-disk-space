import { isJsonObject, parseJsonValue } from '../../system/parseJsonValue.js';
import { parseToolVersionsText } from '../asdfVersions/parseToolVersionsText.js';
import type { ProjectPinFileKind, ProjectPinFileText } from '../projectPins/projectPins.js';
import type { ToolPins } from '../projectPins/selectToolPins.js';
import { parsePnpmVersionMajor } from './parsePnpmVersionMajor.js';

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

const PNPM_TOOL_NAME = 'pnpm';

const PNPM_PACKAGE_MANAGER_PREFIX = 'pnpm@';

const MISE_PNPM_KEY_PATTERN = /^(?:[\w-]+:)?(?:[\w.-]+\/)?pnpm$|^npm:@pnpm\/exe$/;

const MISE_TOOLS_TABLE = 'tools';

const MISE_TOOLS_SUBTABLE_PREFIX = 'tools.';

const MISE_VERSION_KEY = 'version';

const TOML_HEADER_PATTERN = /^\[\[?\s*(.*?)\s*\]\]?$/;

const TOML_STRING_PATTERN = /^"([^"\\]*)"$|^'([^']*)'$/;

const TOML_BARE_KEY_PATTERN = /^[\w-]+$/;

const NO_PIN_TEXTS: PnpmPinTexts = { kind: 'versionTexts', versionTexts: [] };

const EVERY_STORE_VERSION: PnpmPinsEveryStoreVersion = { kind: 'everyStoreVersion' };

/** The pnpm pins of the selected pin files; a pin file that was unfit pins every store version. */
export function readPnpmToolPins(params: { toolPins: ToolPins }): PnpmPins {
  switch (params.toolPins.kind) {
    case 'everyVersionPinned':
      return EVERY_STORE_VERSION;
    case 'texts':
      return parsePnpmPins({ files: params.toolPins.files });
  }
}

/**
 * The pnpm pins of `package.json` files, `.tool-versions`, and mise configs; files of other kinds
 * pin nothing. A pinned version `parsePnpmVersionMajor` does not read pins every store version.
 */
export function parsePnpmPins(params: { files: ProjectPinFileText[] }): PnpmPins {
  const majors = new Set<number>();

  for (const file of params.files) {
    const pinTexts = readPnpmPinTexts({ file: file });

    if (pinTexts.kind === 'everyStoreVersion') {
      return EVERY_STORE_VERSION;
    }

    for (const versionText of pinTexts.versionTexts) {
      const major = parsePnpmVersionMajor({ text: versionText });

      if (major === null) {
        return EVERY_STORE_VERSION;
      }

      majors.add(major);
    }
  }

  return { kind: 'majors', majors: [...majors].toSorted((left, right) => left - right) };
}

function readPnpmPinTexts(params: { file: ProjectPinFileText }): PnpmPinTexts {
  switch (params.file.kind) {
    case 'packageJson':
      return readPackageManagerPin({ text: params.file.text });
    case 'toolVersions':
      return readToolVersionsPins({ text: params.file.text });
    case 'miseConfig':
      return readMiseConfigPins({ text: params.file.text });
    case 'nvmrc':
    case 'gradle':
      return NO_PIN_TEXTS;
  }
}

/**
 * `packageManager` `pnpm@<version>` pins that version, any other one naming pnpm or a text that is
 * no JSON object pins every store version, and one naming another manager pins nothing.
 */
function readPackageManagerPin(params: { text: string }): PnpmPinTexts {
  const json = parseJsonValue({ text: params.text });

  if (json.kind === 'failed' || !isJsonObject(json.value)) {
    return EVERY_STORE_VERSION;
  }

  const packageManager = json.value.packageManager;

  if (packageManager === undefined || packageManager === null) {
    return NO_PIN_TEXTS;
  }

  if (typeof packageManager !== 'string') {
    return EVERY_STORE_VERSION;
  }

  const version = packageManager.slice(PNPM_PACKAGE_MANAGER_PREFIX.length);

  if (packageManager.startsWith(PNPM_PACKAGE_MANAGER_PREFIX) && version !== '') {
    return { kind: 'versionTexts', versionTexts: [version] };
  }

  if (packageManager.toLowerCase().includes(PNPM_TOOL_NAME)) {
    return EVERY_STORE_VERSION;
  }

  return NO_PIN_TEXTS;
}

function readToolVersionsPins(params: { text: string }): PnpmPinTexts {
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
function readMiseConfigPins(params: { text: string }): PnpmPinTexts {
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

    const entryPins = readMiseEntryPins({ section: section, entry: entry });

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

function readMiseEntryPins(params: { section: MiseSection; entry: TomlEntry }): PnpmPinTexts {
  switch (params.section.kind) {
    case 'root':
      return readMiseRootEntryPins({ entry: params.entry });
    case 'tools': {
      if (!isPnpmKeyText({ keyText: params.entry.key })) {
        return NO_PIN_TEXTS;
      }

      return readMiseVersionValue({ valueText: params.entry.value });
    }
    case 'pnpmSubtable': {
      if (!isMiseVersionKey({ keyText: params.entry.key })) {
        return NO_PIN_TEXTS;
      }

      return readMiseVersionValue({ valueText: params.entry.value });
    }
    case 'other':
      return NO_PIN_TEXTS;
  }
}

/**
 * A top-level `tools.<key>` naming pnpm reads as a `[tools]` line, and a `tools` value that holds
 * `pnpm` pins every store version.
 */
function readMiseRootEntryPins(params: { entry: TomlEntry }): PnpmPinTexts {
  if (parseTomlKey({ text: params.entry.key }) === MISE_TOOLS_TABLE) {
    if (params.entry.value.includes(PNPM_TOOL_NAME)) {
      return EVERY_STORE_VERSION;
    }

    return NO_PIN_TEXTS;
  }

  if (!params.entry.key.startsWith(MISE_TOOLS_SUBTABLE_PREFIX)) {
    return NO_PIN_TEXTS;
  }

  const keyText = params.entry.key.slice(MISE_TOOLS_SUBTABLE_PREFIX.length).trim();

  if (!isPnpmKeyText({ keyText: keyText })) {
    return NO_PIN_TEXTS;
  }

  return readMiseVersionValue({ valueText: params.entry.value });
}

function readMiseVersionValue(params: { valueText: string }): PnpmPinTexts {
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

  if (!params.header.startsWith(MISE_TOOLS_SUBTABLE_PREFIX)) {
    return { kind: 'other' };
  }

  const keyText = params.header.slice(MISE_TOOLS_SUBTABLE_PREFIX.length).trim();

  if (!isPnpmKeyText({ keyText: keyText })) {
    return { kind: 'other' };
  }

  return { kind: 'pnpmSubtable', hasVersion: false };
}

/** Whether a mise tool key names pnpm; a key this reader cannot read names pnpm when it holds it. */
function isPnpmKeyText(params: { keyText: string }): boolean {
  const key = parseTomlKey({ text: params.keyText });

  if (key === null) {
    return params.keyText.includes(PNPM_TOOL_NAME);
  }

  return MISE_PNPM_KEY_PATTERN.test(key);
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
