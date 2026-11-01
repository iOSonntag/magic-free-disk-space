import type { PreferencesSaveFailure } from '../preferences/preferencesFile.js';

export function formatPreferencesSaveFailure(params: { failure: PreferencesSaveFailure }): string {
  switch (params.failure.reason) {
    case 'directoryUnavailable':
      return `Cannot create the support folder of the app (${params.failure.code}), so the setting stays as it was.`;
    case 'writeFailed':
      return `Cannot write the setting file in the support folder of the app (${params.failure.code}), so the setting stays as it was.`;
  }
}
