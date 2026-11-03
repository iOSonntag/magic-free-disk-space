import { loadFileAttributes, loadMachineRegistryDword } from '../win32Bindings.js';

// Runs the plain kernel32 and advapi32 calls in a process of its own, so a crash of bun:ffi
// shows as an exit code in the annotation instead of ending the test run. Writes one JSON line.
//   kernelProbe.ts file-attributes <path>...
//   kernelProbe.ts long-paths-setting

const command = process.argv[2];

if (command === 'file-attributes') {
  const readings = process.argv.slice(3).map((path) => loadFileAttributes(path));

  process.stdout.write(`${JSON.stringify({ readings: readings })}\n`);
} else if (command === 'long-paths-setting') {
  const reading = loadMachineRegistryDword({
    subKey: 'SYSTEM\\CurrentControlSet\\Control\\FileSystem',
    valueName: 'LongPathsEnabled',
  });

  process.stdout.write(`${JSON.stringify(reading)}\n`);
} else {
  process.stderr.write(`Unknown command: ${command}\n`);
  process.exit(2);
}
