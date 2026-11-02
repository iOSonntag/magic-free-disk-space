import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createFakeTool } from '../support/fakeTool.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, isPresent } from '../support/fixtureRoot.js';
import type { FakeGhAnswer, FakeGhCall, FixtureCommandRun } from './releaseScriptFixtures.js';
import {
  createFakeGh,
  createFixtureBinDir,
  loadFakeGhCalls,
  loadReleaseWorkflowContract,
  REPO_VIEW_ARGUMENTS,
  runFixtureCommand,
  runReleaseScript,
} from './releaseScriptFixtures.js';

const REPOSITORY = 'example-owner/example-repo';
const TEAM_ID = 'ABCDE12345';
const KEY_ID = 'KEY0123456';
const ISSUER_ID = '69a6de7e-1234-47e3-e053-5b8c7c11a4d1';
const DEVELOPER_ID_SUBJECT = `/UID=${TEAM_ID}/CN=Developer ID Application: Example Team (${TEAM_ID})/OU=${TEAM_ID}/O=Example Team/C=US`;
const API_KEY_TEXT = `-----BEGIN PRIVATE KEY-----
ZHVtbXkgYXBwIHN0b3JlIGNvbm5lY3Qga2V5
-----END PRIVATE KEY-----
`;
const ENVIRONMENT_BODY =
  '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}';
const RULESET_BODY =
  '{"name":"Release tags","target":"tag","enforcement":"active","bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],"conditions":{"ref_name":{"include":["refs/tags/v*"],"exclude":[]}},"rules":[{"type":"creation"},{"type":"update"},{"type":"deletion"}]}';
const POLICIES_PATH = `repos/${REPOSITORY}/environments/release/deployment-branch-policies`;
const ENVIRONMENT_ARGUMENTS = `api --method PUT repos/${REPOSITORY}/environments/release --input -`;
const POLICIES_LIST_ARGUMENTS = `api ${POLICIES_PATH} --jq .branch_policies[] | "\\(.type) \\(.name)"`;
const BRANCH_POLICY_ARGUMENTS = `api --method POST ${POLICIES_PATH} -f name=main -f type=branch`;
const TAG_POLICY_ARGUMENTS = `api --method POST ${POLICIES_PATH} -f name=v* -f type=tag`;
const RULESETS_LIST_ARGUMENTS = `api repos/${REPOSITORY}/rulesets --jq .[] | select(.name == "Release tags") | .id`;
const RULESET_POST_ARGUMENTS = `api --method POST repos/${REPOSITORY}/rulesets --input -`;
const RULESET_PUT_ARGUMENTS = `api --method PUT repos/${REPOSITORY}/rulesets/42 --input -`;
const SECRET_NAMES = [
  'DEVELOPER_ID_CERTIFICATE_P12_BASE64',
  'DEVELOPER_ID_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID',
  'APP_STORE_CONNECT_API_KEY_P8',
  'APP_STORE_CONNECT_API_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
];

type SigningFixture = {
  folder: string;
  certificatePath: string;
  apiKeyPath: string;
};

type OpensslBuild = {
  name: 'LibreSSL' | 'OpenSSL 3';
  path: string;
  /** What `pkcs12 -info` prints once the MAC verified; it exits non-zero when it does not. */
  macVerifiedText: string;
};

// macOS ships LibreSSL; Homebrew's OpenSSL 3 comes first on a developer's PATH and parses -subj
// and pkcs12 differently, so each test of those runs under every build the machine has.
const opensslBuilds: OpensslBuild[] = [
  { name: 'LibreSSL', path: '/usr/bin/openssl', macVerifiedText: 'MAC verified OK' },
  { name: 'OpenSSL 3', path: '/opt/homebrew/bin/openssl', macVerifiedText: 'MAC: sha1' },
];

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function runSetupSigning(args: string[]): Promise<FixtureCommandRun> {
  return runReleaseScript({
    fixtureRoot: fixtureRoot,
    scriptName: 'setupSigning.sh',
    args: args,
    workingDir: fixtureRoot.rootDir,
    stdinText: null,
  });
}

async function runOpenssl(args: string[]): Promise<string> {
  const run = await runFixtureCommand({
    fixtureRoot: fixtureRoot,
    workingDir: fixtureRoot.rootDir,
    command: ['openssl', ...args],
    stdinText: null,
  });

  if (run.exitCode !== 0) {
    throw new Error(`openssl ${args.join(' ')} failed: ${run.stderrText}`);
  }

  return `${run.stdoutText}${run.stderrText}`;
}

async function createOpensslLink(build: OpensslBuild): Promise<void> {
  const binDir = await createFixtureBinDir({ fixtureRoot: fixtureRoot });

  await symlink(build.path, join(binDir, 'openssl'));
}

function buildSecretArguments(name: string): string {
  return `secret set ${name} --env release --repo ${REPOSITORY}`;
}

function buildAnswer(argumentsText: string, stdoutText: string): FakeGhAnswer {
  return { argumentsText: argumentsText, stdoutTexts: [stdoutText], exitCode: 0 };
}

function buildGhAnswers(params: {
  policiesText: string;
  rulesetIdText: string;
  failingSecretName: string | null;
}): FakeGhAnswer[] {
  const secretAnswers = SECRET_NAMES.map((name) => {
    return {
      argumentsText: buildSecretArguments(name),
      stdoutTexts: [''],
      exitCode: name === params.failingSecretName ? 1 : 0,
    } satisfies FakeGhAnswer;
  });

  return [
    buildAnswer(REPO_VIEW_ARGUMENTS, `${REPOSITORY}\n`),
    buildAnswer(ENVIRONMENT_ARGUMENTS, '{}'),
    buildAnswer(POLICIES_LIST_ARGUMENTS, params.policiesText),
    buildAnswer(BRANCH_POLICY_ARGUMENTS, '{}'),
    buildAnswer(TAG_POLICY_ARGUMENTS, '{}'),
    ...secretAnswers,
    buildAnswer(RULESETS_LIST_ARGUMENTS, params.rulesetIdText),
    buildAnswer(RULESET_POST_ARGUMENTS, '{}'),
    buildAnswer(RULESET_PUT_ARGUMENTS, '{}'),
  ];
}

async function requestSigningFolder(): Promise<string> {
  const folder = join(fixtureRoot.rootDir, 'signing');
  const run = await runSetupSigning(['request', folder, 'oliver@example.com']);

  if (run.exitCode !== 0) {
    throw new Error(`request failed: ${run.stderrText}`);
  }

  return folder;
}

/** Writes a certificate of `keyPath` with `subject` as DER, as Apple sends it, and returns its path. */
async function createCertificate(params: {
  keyPath: string;
  subject: string;
  name: string;
}): Promise<string> {
  const certificatesDir = join(fixtureRoot.rootDir, 'certificates');
  const pemPath = join(certificatesDir, `${params.name}.pem`);
  const cerPath = join(certificatesDir, `${params.name}.cer`);

  await mkdir(certificatesDir, { recursive: true });
  await runOpenssl([
    'req',
    '-new',
    '-x509',
    '-key',
    params.keyPath,
    '-days',
    '1',
    '-subj',
    params.subject,
    '-out',
    pemPath,
  ]);
  await runOpenssl(['x509', '-in', pemPath, '-outform', 'DER', '-out', cerPath]);

  return cerPath;
}

async function createApiKey(text: string): Promise<string> {
  const downloadsDir = join(fixtureRoot.rootDir, 'downloads');
  const apiKeyPath = join(downloadsDir, `AuthKey_${KEY_ID}.p8`);

  await mkdir(downloadsDir, { recursive: true });
  await writeFile(apiKeyPath, text);

  return apiKeyPath;
}

async function createSigningFixture(params: { subject: string }): Promise<SigningFixture> {
  const folder = await requestSigningFolder();
  const certificatePath = await createCertificate({
    keyPath: join(folder, 'developer-id.key'),
    subject: params.subject,
    name: 'developer-id',
  });
  const apiKeyPath = await createApiKey(API_KEY_TEXT);

  return { folder: folder, certificatePath: certificatePath, apiKeyPath: apiKeyPath };
}

async function runInstall(params: {
  fixture: SigningFixture;
  keyId: string;
  issuerId: string;
}): Promise<FixtureCommandRun> {
  return runSetupSigning([
    'install',
    params.fixture.folder,
    params.fixture.certificatePath,
    params.fixture.apiKeyPath,
    params.keyId,
    params.issuerId,
  ]);
}

async function loadModeBits(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}

function findSecretCall(calls: FakeGhCall[], name: string): FakeGhCall {
  const call = calls.find((candidate) => candidate.argumentsText === buildSecretArguments(name));

  if (call === undefined) {
    throw new Error(`no call set the secret ${name}`);
  }

  return call;
}

async function expectRequestKept(folder: string): Promise<void> {
  expect(await isPresent(join(folder, 'developer-id.key'))).toBe(true);
  expect(await isPresent(join(folder, 'developer-id.certSigningRequest'))).toBe(true);
}

describe('setupSigning.sh request', () => {
  test('creates a private folder with the key and a request for the email', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');
    const run = await runSetupSigning(['request', folder, 'oliver@example.com']);

    expect(run.exitCode).toBe(0);
    expect(run.stdoutText).toContain(
      'https://developer.apple.com/account/resources/certificates/add',
    );
    expect(run.stdoutText).toContain('scripts/release/setupSigning.sh install');
    expect(await loadModeBits(folder)).toBe(0o700);
    expect(await loadModeBits(join(folder, 'developer-id.key'))).toBe(0o600);

    const requestText = await runOpenssl([
      'req',
      '-in',
      join(folder, 'developer-id.certSigningRequest'),
      '-noout',
      '-subject',
    ]);

    expect(requestText).toContain('oliver@example.com');
    expect(requestText).toContain('Developer ID signing key');
  });

  for (const build of opensslBuilds) {
    test.skipIf(!existsSync(build.path))(
      `keeps a plus in the email whole in the request (${build.name})`,
      async () => {
        await createOpensslLink(build);

        const folder = join(fixtureRoot.rootDir, 'signing');
        const run = await runSetupSigning(['request', folder, 'oliver+apple@example.com']);

        expect(run.exitCode).toBe(0);

        const requestText = await runOpenssl([
          'req',
          '-in',
          join(folder, 'developer-id.certSigningRequest'),
          '-noout',
          '-subject',
        ]);

        expect(requestText).toContain('oliver+apple@example.com');
        expect(requestText).toContain('Developer ID signing key');
      },
    );
  }

  test('refuses an email beyond ASCII before it creates the folder', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');
    const run = await runSetupSigning(['request', folder, 'jürgen@example.com']);

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain('error:');
    expect(await isPresent(folder)).toBe(false);
  });

  test('removes the folder again when openssl fails', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');

    await createFakeTool({
      folder: await createFixtureBinDir({ fixtureRoot: fixtureRoot }),
      name: 'openssl',
      body: 'exit 1',
    });

    const run = await runSetupSigning(['request', folder, 'oliver@example.com']);

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain('error: openssl could not create the key and the request');
    expect(await isPresent(folder)).toBe(false);
  });

  test('refuses a folder that exists', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');

    await mkdir(folder);

    const run = await runSetupSigning(['request', folder, 'oliver@example.com']);

    expect(run.exitCode).toBe(1);
    expect(await isPresent(join(folder, 'developer-id.key'))).toBe(false);
  });

  test('refuses a folder inside a git work tree', async () => {
    const repositoryDir = join(fixtureRoot.rootDir, 'repository');

    await mkdir(repositoryDir);
    await runFixtureCommand({
      fixtureRoot: fixtureRoot,
      workingDir: repositoryDir,
      command: ['git', 'init', '--quiet'],
      stdinText: null,
    });

    const folder = join(repositoryDir, 'signing');
    const run = await runSetupSigning(['request', folder, 'oliver@example.com']);

    expect(run.exitCode).toBe(1);
    expect(run.stderrText).toContain('git work tree');
    expect(await isPresent(folder)).toBe(false);
  });

  test('refuses an email that is no address', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');
    const run = await runSetupSigning(['request', folder, 'oliver/@example.com']);

    expect(run.exitCode).toBe(1);
    expect(await isPresent(folder)).toBe(false);
  });

  test('exits 2 on a wrong arity or an unknown subcommand', async () => {
    const folder = join(fixtureRoot.rootDir, 'signing');

    expect((await runSetupSigning(['request', folder])).exitCode).toBe(2);
    expect((await runSetupSigning(['renew', folder, 'oliver@example.com'])).exitCode).toBe(2);
    expect((await runSetupSigning([])).exitCode).toBe(2);
    expect(await isPresent(folder)).toBe(false);
  });
});

describe('setupSigning.sh install', () => {
  async function expectFirstRunSetsUpSigning(build: OpensslBuild): Promise<void> {
    const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

    await createFakeGh({
      fixtureRoot: fixtureRoot,
      answers: buildGhAnswers({ policiesText: '', rulesetIdText: '', failingSecretName: null }),
    });

    const run = await runInstall({ fixture: fixture, keyId: KEY_ID, issuerId: ISSUER_ID });

    expect(run.stderrText).not.toContain('error:');
    expect(run.exitCode).toBe(0);

    const calls = await loadFakeGhCalls({ fixtureRoot: fixtureRoot });

    expect(calls.map((call) => call.argumentsText)).toEqual([
      REPO_VIEW_ARGUMENTS,
      ENVIRONMENT_ARGUMENTS,
      POLICIES_LIST_ARGUMENTS,
      BRANCH_POLICY_ARGUMENTS,
      TAG_POLICY_ARGUMENTS,
      ...SECRET_NAMES.map((name) => buildSecretArguments(name)),
      RULESETS_LIST_ARGUMENTS,
      RULESET_POST_ARGUMENTS,
    ]);
    expect(calls[1]?.stdinText).toBe(ENVIRONMENT_BODY);
    expect(calls.at(-1)?.stdinText).toBe(RULESET_BODY);
    expect(SECRET_NAMES.toSorted()).toEqual((await loadReleaseWorkflowContract()).secretNames);

    const passwordText = await readFile(join(fixture.folder, 'developer-id.p12.password'), 'utf8');
    const passwordSecret = findSecretCall(calls, 'DEVELOPER_ID_CERTIFICATE_PASSWORD').stdinText;

    expect(passwordSecret).toBe(passwordText);
    expect(passwordSecret).toMatch(/^[0-9a-f]{48}$/);

    const p12Secret = findSecretCall(calls, 'DEVELOPER_ID_CERTIFICATE_P12_BASE64').stdinText;
    const decodedP12Path = join(fixtureRoot.tempDir, 'decoded.p12');

    expect(p12Secret).toMatch(/^[A-Za-z0-9+/]+=*$/);

    await writeFile(decodedP12Path, Buffer.from(p12Secret, 'base64'));

    const p12InfoText = await runOpenssl([
      'pkcs12',
      '-info',
      '-noout',
      '-in',
      decodedP12Path,
      '-passin',
      `pass:${passwordSecret}`,
    ]);
    // LibreSSL's pkcs12 -info names no MAC digest, so the sha1 comes from the p12's structure.
    const p12StructureText = await runOpenssl([
      'asn1parse',
      '-inform',
      'DER',
      '-in',
      decodedP12Path,
    ]);

    expect(p12InfoText).toContain(build.macVerifiedText);
    expect(p12InfoText).toContain('pbeWithSHA1And3-KeyTripleDES-CBC');
    expect(p12StructureText).toMatch(/OBJECT\s+:sha1\s*$/m);

    expect(findSecretCall(calls, 'APPLE_TEAM_ID').stdinText).toBe(TEAM_ID);
    expect(findSecretCall(calls, 'APP_STORE_CONNECT_API_KEY_ID').stdinText).toBe(KEY_ID);
    expect(findSecretCall(calls, 'APP_STORE_CONNECT_ISSUER_ID').stdinText).toBe(ISSUER_ID);
    expect(findSecretCall(calls, 'APP_STORE_CONNECT_API_KEY_P8').stdinText).toBe(API_KEY_TEXT);

    const secretValues = [p12Secret, passwordSecret, KEY_ID, ISSUER_ID, API_KEY_TEXT.trim()];

    for (const call of calls) {
      for (const secretValue of secretValues) {
        expect(call.argumentsText).not.toContain(secretValue);
      }
    }

    expect((await readdir(fixture.folder)).toSorted()).toEqual([
      `AuthKey_${KEY_ID}.p8`,
      'developer-id.p12',
      'developer-id.p12.password',
    ]);
    expect(await loadModeBits(join(fixture.folder, 'developer-id.p12'))).toBe(0o600);
    expect(await loadModeBits(join(fixture.folder, 'developer-id.p12.password'))).toBe(0o600);
    expect(await isPresent(fixture.apiKeyPath)).toBe(false);
    expect(await isPresent(fixture.certificatePath)).toBe(true);
  }

  for (const build of opensslBuilds) {
    test.skipIf(!existsSync(build.path))(
      `a first run builds the p12, protects the releases, and leaves only the secrets (${build.name})`,
      async () => {
        await createOpensslLink(build);
        await expectFirstRunSetsUpSigning(build);
      },
    );
  }

  test('a rerun keeps the listed policies, warns of any other, and updates the ruleset', async () => {
    const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

    await createFakeGh({
      fixtureRoot: fixtureRoot,
      answers: buildGhAnswers({
        policiesText: 'branch main\ntag v*\nbranch develop\n',
        rulesetIdText: '42\n',
        failingSecretName: null,
      }),
    });

    const run = await runInstall({ fixture: fixture, keyId: KEY_ID, issuerId: ISSUER_ID });

    expect(run.exitCode).toBe(0);
    expect(run.stderrText).toContain(
      'warning: the environment release also admits branch develop; its refs can read the signing secrets too',
    );
    expect(run.stderrText).not.toContain('admits branch main');
    expect(run.stderrText).not.toContain('admits tag v*');

    const calls = await loadFakeGhCalls({ fixtureRoot: fixtureRoot });
    const argumentTexts = calls.map((call) => call.argumentsText);

    expect(
      argumentTexts.filter((text) => text.startsWith(`api --method POST ${POLICIES_PATH}`)),
    ).toEqual([]);
    expect(argumentTexts).not.toContain(RULESET_POST_ARGUMENTS);
    expect(argumentTexts.at(-1)).toBe(RULESET_PUT_ARGUMENTS);
    expect(calls.at(-1)?.stdinText).toBe(RULESET_BODY);
  });

  test('a failed move of the .p8 keeps the key, the request, and the .p8 in place', async () => {
    const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });
    const downloadsDir = join(fixtureRoot.rootDir, 'downloads');

    await createFakeGh({
      fixtureRoot: fixtureRoot,
      answers: buildGhAnswers({ policiesText: '', rulesetIdText: '', failingSecretName: null }),
    });
    await chmod(downloadsDir, 0o555);

    try {
      const run = await runInstall({ fixture: fixture, keyId: KEY_ID, issuerId: ISSUER_ID });

      expect(run.exitCode).not.toBe(0);
    } finally {
      await chmod(downloadsDir, 0o755);
    }

    await expectRequestKept(fixture.folder);
    expect(await isPresent(fixture.apiKeyPath)).toBe(true);
  });

  test('a failed gh call keeps the key, the request, and the .p8 in place', async () => {
    const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

    await createFakeGh({
      fixtureRoot: fixtureRoot,
      answers: buildGhAnswers({
        policiesText: '',
        rulesetIdText: '',
        failingSecretName: 'APPLE_TEAM_ID',
      }),
    });

    const run = await runInstall({ fixture: fixture, keyId: KEY_ID, issuerId: ISSUER_ID });

    expect(run.exitCode).not.toBe(0);
    await expectRequestKept(fixture.folder);
    expect(await isPresent(fixture.apiKeyPath)).toBe(true);
    expect(await isPresent(join(fixture.folder, `AuthKey_${KEY_ID}.p8`))).toBe(false);
  });

  describe('refuses before any gh call, keeping the key and the request', () => {
    async function expectRefusal(params: {
      fixture: SigningFixture;
      keyId: string;
      issuerId: string;
      errorText: string;
    }): Promise<void> {
      await createFakeGh({ fixtureRoot: fixtureRoot, answers: [] });

      const run = await runInstall({
        fixture: params.fixture,
        keyId: params.keyId,
        issuerId: params.issuerId,
      });

      expect(run.exitCode).toBe(1);
      expect(run.stderrText).toContain(params.errorText);
      expect(await loadFakeGhCalls({ fixtureRoot: fixtureRoot })).toEqual([]);
      expect(await isPresent(join(params.fixture.folder, 'developer-id.certSigningRequest'))).toBe(
        true,
      );
      expect(await isPresent(params.fixture.apiKeyPath)).toBe(true);
    }

    test('a certificate of another key', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });
      const otherKeyPath = join(fixtureRoot.rootDir, 'other.key');

      await runOpenssl(['genrsa', '-out', otherKeyPath, '2048']);

      const otherCertificatePath = await createCertificate({
        keyPath: otherKeyPath,
        subject: DEVELOPER_ID_SUBJECT,
        name: 'other-key',
      });

      await expectRefusal({
        fixture: { ...fixture, certificatePath: otherCertificatePath },
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        errorText: 'belongs to another key',
      });
      await expectRequestKept(fixture.folder);
    });

    test('a common name that is no Developer ID Application', async () => {
      const fixture = await createSigningFixture({
        subject: `/UID=${TEAM_ID}/CN=Apple Development: Example Team (${TEAM_ID})/OU=${TEAM_ID}/O=Example Team/C=US`,
      });

      await expectRefusal({
        fixture: fixture,
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        errorText: 'no Developer ID Application certificate',
      });
      await expectRequestKept(fixture.folder);
    });

    test('an organizational unit that differs from the common name team id', async () => {
      const fixture = await createSigningFixture({
        subject: `/UID=${TEAM_ID}/CN=Developer ID Application: Example Team (${TEAM_ID})/OU=ZYXWV98765/O=Example Team/C=US`,
      });

      await expectRefusal({
        fixture: fixture,
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        errorText: 'does not end with its team id (ZYXWV98765)',
      });
      await expectRequestKept(fixture.folder);
    });

    test('a .p8 without the private key header', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

      await writeFile(fixture.apiKeyPath, 'not a key\n');
      await expectRefusal({
        fixture: fixture,
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        errorText: 'holds no private key',
      });
      await expectRequestKept(fixture.folder);
    });

    test('a key id that is not 10 capital letters and digits', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

      await expectRefusal({
        fixture: fixture,
        keyId: 'key0123456',
        issuerId: ISSUER_ID,
        errorText: "the key id 'key0123456'",
      });
      await expectRequestKept(fixture.folder);
    });

    test('an issuer id that is no UUID', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

      await expectRefusal({
        fixture: fixture,
        keyId: KEY_ID,
        issuerId: 'not-a-uuid',
        errorText: "the issuer id 'not-a-uuid' is no UUID",
      });
      await expectRequestKept(fixture.folder);
    });

    test('a folder without developer-id.key', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

      await rename(
        join(fixture.folder, 'developer-id.key'),
        join(fixtureRoot.rootDir, 'moved.key'),
      );
      await expectRefusal({
        fixture: fixture,
        keyId: KEY_ID,
        issuerId: ISSUER_ID,
        errorText: 'start again with',
      });
    });

    test('a wrong arity exits 2', async () => {
      const fixture = await createSigningFixture({ subject: DEVELOPER_ID_SUBJECT });

      await createFakeGh({ fixtureRoot: fixtureRoot, answers: [] });

      const run = await runSetupSigning([
        'install',
        fixture.folder,
        fixture.certificatePath,
        fixture.apiKeyPath,
        KEY_ID,
      ]);

      expect(run.exitCode).toBe(2);
      expect(await loadFakeGhCalls({ fixtureRoot: fixtureRoot })).toEqual([]);
      await expectRequestKept(fixture.folder);
    });
  });
});
