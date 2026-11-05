import { spawnSync } from 'node:child_process';

export default function globalSetup(): void {
  const result = spawnSync('npx', ['tsx', 'scripts/e2e-prepare.ts'], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
