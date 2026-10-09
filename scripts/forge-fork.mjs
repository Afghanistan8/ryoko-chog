// Runs the Monad mainnet fork tests. Cross-platform way to set RUN_FORK for forge.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..', 'contracts');
const result = spawnSync('forge', ['test', '--match-path', 'test/fork/*', '-vv'], {
  cwd,
  stdio: 'inherit',
  env: { ...process.env, RUN_FORK: 'true' },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
