import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(`[promptit] ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const envUpdates = [];
  const unsetKeys = [];
  let useXvfbAuto = false;
  let index = 0;

  while (index < args.length) {
    const arg = args[index];

    if (arg === '--') {
      return {
        envUpdates,
        unsetKeys,
        useXvfbAuto,
        commandArgs: args.slice(index + 1),
      };
    }

    if (arg === '--env') {
      const assignment = args[index + 1];

      if (!assignment || !assignment.includes('=')) {
        fail('--env requires KEY=VALUE.');
      }

      const equalIndex = assignment.indexOf('=');
      const key = assignment.slice(0, equalIndex);
      const value = assignment.slice(equalIndex + 1);

      if (!key) {
        fail('--env requires a non-empty KEY.');
      }

      envUpdates.push([key, value]);
      index += 2;
      continue;
    }

    if (arg === '--unset') {
      const key = args[index + 1];

      if (!key) {
        fail('--unset requires KEY.');
      }

      unsetKeys.push(key);
      index += 2;
      continue;
    }

    if (arg === '--xvfb-auto') {
      useXvfbAuto = true;
      index += 1;
      continue;
    }

    fail(`Unknown option ${arg}. Use -- to separate wrapper options from the command.`);
  }

  fail('Missing -- separator and command.');
}

function findExecutable(command, env) {
  const searchPath = env.PATH ?? '';
  const pathEntries = searchPath.split(path.delimiter).filter(Boolean);

  for (const directory of pathEntries) {
    const candidate = path.join(directory, command);

    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }

  return null;
}

const { envUpdates, unsetKeys, useXvfbAuto, commandArgs } = parseArgs(
  process.argv.slice(2),
);

if (commandArgs.length === 0) {
  fail('Missing command after --.');
}

const childEnv = { ...process.env };

for (const key of unsetKeys) {
  delete childEnv[key];
}

for (const [key, value] of envUpdates) {
  childEnv[key] = value;
}

let command = commandArgs[0];
let args = commandArgs.slice(1);

if (
  useXvfbAuto &&
  process.platform === 'linux' &&
  !childEnv.DISPLAY &&
  !childEnv.WAYLAND_DISPLAY
) {
  if (!findExecutable('xvfb-run', childEnv)) {
    fail(
      'Headed extension tests on display-less Linux require DISPLAY, WAYLAND_DISPLAY, or xvfb-run on PATH.',
    );
  }

  args = ['-a', command, ...args];
  command = 'xvfb-run';
}

const child = spawn(command, args, {
  env: childEnv,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`[promptit] failed to run ${command}: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
