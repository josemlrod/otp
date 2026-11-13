import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as assert from 'remix/assert';
import { describe, it } from 'remix/test';

// Keeps ARCHITECTURE.md honest. It can't tell whether a box is wired right, but it catches the
// common drift: a component that landed without a line in the map, or a line that outlived its
// code. Fix a failure by updating ARCHITECTURE.md, not this list.

const ROOT = path.join(import.meta.dirname, '..');
const doc = readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');

// Every source file directly in these directories is a component of its own.
const FILE_LEVEL = ['.', 'app', 'app/actions', 'app/actions/public', 'app/lib', 'app/ui', 'app/data'];
// Every directory directly in these is a component of its own (named with a trailing slash).
const DIR_LEVEL = ['app', 'app/actions/public', 'app/lib', 'scripts', 'db'];

const isSource = (name: string) => /\.(ts|tsx)$/.test(name) && !/\.test(\.browser|\.e2e)?\.tsx?$/.test(name);

function entries(dir: string) {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).filter(
    (entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules',
  );
}

function components(): string[] {
  const files = FILE_LEVEL.flatMap((dir) =>
    entries(dir)
      .filter((entry) => entry.isFile() && isSource(entry.name))
      .map((entry) => path.posix.join(dir, entry.name)),
  );
  const dirs = DIR_LEVEL.flatMap((dir) =>
    entries(dir)
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${path.posix.join(dir, entry.name)}/`)
      // A directory whose files are listed one by one doesn't need its own line.
      .filter((dirPath) => !FILE_LEVEL.includes(dirPath.slice(0, -1))),
  );
  return [...files, ...dirs];
}

// Paths the map names: `code spans` that look like repo paths, and relative link targets.
function namedPaths(): string[] {
  const spans = [...doc.matchAll(/`([A-Za-z0-9._][A-Za-z0-9._/-]*)`/g)]
    .map((match) => match[1])
    .filter((span) => span.includes('/') || /\.(ts|tsx|md|html|toml|json)$/.test(span));
  const links = [...doc.matchAll(/\]\(([^)#\s]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/.test(target));
  return [...new Set([...spans, ...links])];
}

describe('ARCHITECTURE.md', () => {
  it('names every component on disk', () => {
    const missing = components().filter((component) => !doc.includes(`\`${component}\``));
    assert.deepEqual(missing, [], `Add these to ARCHITECTURE.md: ${missing.join(', ')}`);
  });

  it('names only paths that exist', () => {
    const gone = namedPaths().filter((named) => !existsSync(path.join(ROOT, named)));
    assert.deepEqual(gone, [], `ARCHITECTURE.md names paths that no longer exist: ${gone.join(', ')}`);
  });
});
