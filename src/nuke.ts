import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'bin', 'obj', '.vs', 'out']);
const MAX_DEPTH = 3;
const NUKE_REFERENCE = /\b(?:Include|Update|Remove)\s*=\s*["']Nuke\./i;

function isDirectory(p: string): boolean {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

/** The migrator renames a `.nuke/` directory; a legacy single file or an empty folder is not worth migrating. */
function hasNukeDirectory(dir: string): boolean {
    const nuke = path.join(dir, '.nuke');
    try {
        return isDirectory(nuke) && fs.readdirSync(nuke).length > 0;
    } catch {
        return false;
    }
}

function referencesNuke(csproj: string): boolean {
    try {
        return NUKE_REFERENCE.test(fs.readFileSync(csproj, 'utf8'));
    } catch {
        return false;
    }
}

/**
 * Unmigrated NUKE repositories at or below `folder` (a few levels deep, for nested repos).
 * A repository counts when it has a non-empty `.nuke/` directory, or a `_build.csproj` that still
 * references `Nuke.*` (any quote style, `Include`/`Update`/`Remove`), and it has no `.fallout/` yet.
 */
export function findNukeRoots(folder: string): string[] {
    const roots = new Set<string>();
    const walk = (dir: string, depth: number): void => {
        if (isDirectory(path.join(dir, '.fallout'))) {
            return;
        }
        if (hasNukeDirectory(dir)) {
            roots.add(dir);
        }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        if (entries.some(e => e.isFile() && e.name === '_build.csproj') && referencesNuke(path.join(dir, '_build.csproj'))) {
            roots.add(path.basename(dir) === 'build' ? path.dirname(dir) : dir);
        }
        if (depth >= MAX_DEPTH) {
            return;
        }
        for (const e of entries) {
            if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) {
                walk(path.join(dir, e.name), depth + 1);
            }
        }
    };
    walk(folder, 0);
    // A csproj in a child maps to the parent root, which the walk above may not have checked for .fallout/.
    return [...roots].filter(r => !isDirectory(path.join(r, '.fallout')));
}
