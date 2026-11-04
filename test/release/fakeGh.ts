import { existsSync, readdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

const UNEXPECTED_ARGUMENTS_EXIT_CODE = 64;

/**
 * The body of the fake `gh` that `createFakeGh` writes: records the call in `logDir`, reads stdin
 * only for `secret set` and `--input -`, answers from the first answer folder of `answersDir`
 * whose arguments match, and exits 64 on any other call. Never returns.
 */
export const runFakeGh = (params: { logDir: string; answersDir: string }): never => {
  const argumentsText = process.argv.slice(2).join(' ');
  const countPath = join(params.logDir, 'count');
  const callNumber = (existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0) + 1;
  const paddedArgumentsText = ` ${argumentsText} `;
  const readsStdin =
    paddedArgumentsText.includes(' secret set ') || paddedArgumentsText.includes(' --input - ');

  writeFileSync(countPath, String(callNumber));
  writeFileSync(join(params.logDir, `call-${callNumber}-arguments`), argumentsText);
  writeFileSync(join(params.logDir, `call-${callNumber}-stdin`), readsStdin ? readFileSync(0) : '');

  const answerNames = existsSync(params.answersDir)
    ? readdirSync(params.answersDir).toSorted()
    : [];

  for (const answerName of answerNames) {
    const answerDir = join(params.answersDir, answerName);

    if (readFileSync(join(answerDir, 'arguments'), 'utf8') !== argumentsText) {
      continue;
    }

    const answerCount = Number(readFileSync(join(answerDir, 'count'), 'utf8')) + 1;
    const answerStdoutPath = join(answerDir, `stdout-${answerCount}`);
    const lastStdoutPath = join(
      answerDir,
      `stdout-${readFileSync(join(answerDir, 'last'), 'utf8')}`,
    );

    writeFileSync(join(answerDir, 'count'), String(answerCount));
    writeSync(1, readFileSync(existsSync(answerStdoutPath) ? answerStdoutPath : lastStdoutPath));

    return process.exit(Number(readFileSync(join(answerDir, 'exit-code'), 'utf8')));
  }

  writeSync(2, `unexpected arguments: ${argumentsText}\n`);

  return process.exit(UNEXPECTED_ARGUMENTS_EXIT_CODE);
};
