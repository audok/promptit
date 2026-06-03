import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

function fail(message) {
  console.error(`[promptit] ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    directory: 'tests/fixtures',
    host: '127.0.0.1',
    port: 4173,
  };
  let index = 0;

  while (index < args.length) {
    const arg = args[index];
    const value = args[index + 1];

    if (arg === '--directory') {
      if (!value) {
        fail('--directory requires a path.');
      }

      options.directory = value;
      index += 2;
      continue;
    }

    if (arg === '--host') {
      if (!value) {
        fail('--host requires a host.');
      }

      options.host = value;
      index += 2;
      continue;
    }

    if (arg === '--port') {
      if (!value || !/^\d+$/.test(value)) {
        fail('--port requires a numeric port.');
      }

      options.port = Number(value);
      index += 2;
      continue;
    }

    fail(`Unknown option ${arg}.`);
  }

  return options;
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
  });
  response.end(text);
}

function resolveRequestedPath(rootPath, requestUrl) {
  let pathname;

  try {
    const rawPathname = requestUrl.split(/[?#]/, 1)[0];
    const decodedRawPathname = decodeURIComponent(rawPathname);

    if (
      decodedRawPathname.includes('\0') ||
      decodedRawPathname.split(/[\\/]+/).includes('..')
    ) {
      return null;
    }

    pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }

  if (pathname.includes('\0')) {
    return null;
  }

  if (pathname.split(/[\\/]+/).includes('..')) {
    return null;
  }

  const normalizedPath = path.normalize(pathname).replace(/^[/\\]+/, '');
  const filePath = path.resolve(rootPath, normalizedPath);

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }

  return filePath;
}

const options = parseArgs(process.argv.slice(2));
const rootPath = path.resolve(process.cwd(), options.directory);

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendText(response, 400, 'Bad Request');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {
      Allow: 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end('Method Not Allowed');
    return;
  }

  const filePath = resolveRequestedPath(rootPath, request.url);

  if (!filePath) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let fileStat;

  try {
    fileStat = await stat(filePath);
  } catch {
    sendText(response, 404, 'Not Found');
    return;
  }

  if (!fileStat.isFile()) {
    sendText(response, 404, 'Not Found');
    return;
  }

  response.writeHead(200, {
    'Content-Length': String(fileStat.size),
    'Content-Type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
});

server.on('error', (error) => {
  console.error(`[promptit] fixture server failed: ${error.message}`);
  process.exit(1);
});

server.listen(options.port, options.host, () => {
  console.log(
    `[promptit] serving fixtures from ${rootPath} at http://${options.host}:${options.port}/`,
  );
});

function closeServer() {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
