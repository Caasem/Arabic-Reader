import { spawnSync } from 'node:child_process';

const gradleCommand = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
const result = spawnSync(gradleCommand, ['assembleDebug'], {
  cwd: 'android',
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
