import { spawn } from 'node:child_process';
import process from 'node:process';

const matchRules = [
  {
    pattern: 'chrome-devtools-mcp',
    matches: (commandLine) =>
      commandLine.includes('chrome-devtools-mcp') &&
      (commandLine.includes('promptit') ||
        commandLine.includes('puppeteer_dev_chrome_profile')),
  },
  {
    pattern: 'puppeteer_dev_chrome_profile',
    matches: (commandLine) => commandLine.includes('puppeteer_dev_chrome_profile'),
  },
  {
    pattern: 'promptit-extension-',
    matches: (commandLine) => commandLine.includes('promptit-extension-'),
  },
  {
    pattern: 'promptit-playwright',
    matches: (commandLine) => commandLine.includes('promptit-playwright'),
  },
  {
    pattern: 'promptit-production-extension-',
    matches: (commandLine) => commandLine.includes('promptit-production-extension-'),
  },
  {
    pattern: 'promptit-production-playwright',
    matches: (commandLine) =>
      commandLine.includes('promptit-production-playwright'),
  },
  {
    pattern: 'xvfb',
    matches: (commandLine) => commandLine.includes('xvfb'),
  },
];

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

function parseUnixProcesses(output) {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.*)$/);

      if (!match) {
        return null;
      }

      return {
        pid: match[1],
        commandLine: match[2],
      };
    })
    .filter(Boolean);
}

function parseWindowsProcesses(output) {
  const trimmedOutput = output.trim();

  if (!trimmedOutput) {
    return [];
  }

  const parsed = JSON.parse(trimmedOutput);
  const entries = Array.isArray(parsed) ? parsed : [parsed];

  return entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      pid: String(entry.ProcessId ?? ''),
      commandLine: String(entry.CommandLine ?? ''),
    }))
    .filter((entry) => entry.pid && entry.commandLine);
}

async function listProcesses() {
  if (process.platform === 'win32') {
    const powershellQuery =
      'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
    const output = await runProcess('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      powershellQuery,
    ]);

    return parseWindowsProcesses(output);
  }

  const output = await runProcess('ps', ['-eo', 'pid=,args=']);

  return parseUnixProcesses(output);
}

function findMatches(processes) {
  return processes
    .map((entry) => {
      const commandLine = entry.commandLine.toLowerCase();
      const rule = matchRules.find((candidate) => candidate.matches(commandLine));

      if (!rule) {
        return null;
      }

      return {
        ...entry,
        pattern: rule.pattern,
      };
    })
    .filter(Boolean);
}

try {
  const processes = await listProcesses();
  const matches = findMatches(processes);

  if (matches.length === 0) {
    console.log('[promptit] no matching test browser/helper processes found.');
    process.exit(0);
  }

  console.error(
    '[promptit] potential test browser/helper processes found; inspect before killing:',
  );

  for (const match of matches) {
    console.error(`- pid ${match.pid} (${match.pattern}): ${match.commandLine}`);
  }

  process.exit(1);
} catch (error) {
  console.error(
    `[promptit] failed to scan test browser/helper processes: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
