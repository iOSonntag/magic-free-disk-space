const HUGGING_FACE_REPO_TYPES = ['model', 'dataset', 'space', 'kernel'] as const;

/** The kinds of repository the hub cache holds. */
export type HuggingFaceRepoType = (typeof HUGGING_FACE_REPO_TYPES)[number];

/** A repository by its type and its id, such as `example-org/example-model`. */
export type HuggingFaceRepoName = { repoType: HuggingFaceRepoType; repoId: string };

/** The first part of a repository folder's name, by the type it names. */
const REPO_TYPE_FOLDER_PREFIXES: Record<HuggingFaceRepoType, string> = {
  model: 'models',
  dataset: 'datasets',
  space: 'spaces',
  kernel: 'kernels',
};

/** The libraries write a repository's id with `--` in place of each `/`. */
const REPO_FOLDER_SEPARATOR = '--';

/** A repository folder of the hub cache, `<type>s--<owner>--<name>`; `null` for any other name. */
export function parseHuggingFaceRepoFolderName(folderName: string): HuggingFaceRepoName | null {
  const [prefix, ...idParts] = folderName.split(REPO_FOLDER_SEPARATOR);
  const repoType = HUGGING_FACE_REPO_TYPES.find(
    (candidate) => REPO_TYPE_FOLDER_PREFIXES[candidate] === prefix,
  );

  if (repoType === undefined || idParts.length === 0 || idParts.includes('')) {
    return null;
  }

  return { repoType: repoType, repoId: idParts.join('/') };
}
