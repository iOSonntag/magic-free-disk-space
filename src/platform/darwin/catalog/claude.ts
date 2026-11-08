import type { CatalogEntry } from '../../../catalog/catalog.js';

/** What Claude Code keeps below the home folder: its old conversations and its old versions. */
export const CLAUDE_ENTRIES: CatalogEntry[] = [
  {
    id: 'claude-code-transcripts',
    category: 'developer',
    title: 'Old Claude Code conversations',
    explanation:
      'The saved conversations of your projects in Claude Code. Claude Code removes old ones itself after the days its cleanupPeriodDays setting names.',
    regeneration: 'Nothing makes them again: a removed conversation can no longer be resumed.',
    risk: 'careful',
    root: 'home',
    path: '.claude/projects',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'claudeTranscripts',
      advice:
        'The saved conversations of your projects in Claude Code. Lower its cleanupPeriodDays setting to let Claude Code remove old ones itself.',
    },
  },
  {
    id: 'claude-code-versions',
    category: 'developer',
    title: 'Old Claude Code versions',
    explanation: 'Older versions of Claude Code that its installer kept beside the newer ones.',
    regeneration: 'Claude Code downloads a version again only if you install that version.',
    risk: 'safe',
    root: 'home',
    path: '.local/share/claude/versions',
    selection: { kind: 'path' },
    ageRule: { kind: 'none' },
    owner: null,
    removal: {
      kind: 'explore',
      probe: 'claudeCodeVersions',
      advice:
        'Older versions of Claude Code that its installer kept. Claude Code removes them itself when it updates.',
    },
  },
];
