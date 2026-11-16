// Pure build-graph logic: no `vscode` import, so it runs under plain Node (unit tests).
import * as path from 'path';
import * as fs from 'fs';

/** How one target relates to another in the build graph. */
export type Relation = 'dependsOn' | 'after' | 'triggeredBy' | 'triggers';

/** Every relation, in the order the tree shows them as children. */
export const RELATIONS: readonly Relation[] = ['dependsOn', 'after', 'triggeredBy', 'triggers'];

/** A single build target, as emitted into build-graph.json. */
export interface Target {
    name: string;
    /** Emitted as `null` (not omitted) when a target has no description. */
    description?: string | null;
    default: boolean;
    listed: boolean;
    /** Declaring C# type (class or interface) — disambiguates go-to-definition. */
    declaredIn?: string;
    dependsOn: string[];
    after: string[];
    triggeredBy: string[];
    triggers: string[];
}

/** Parsed contents of build-graph.json. */
export interface BuildGraph {
    version: number;
    falloutVersion?: string;
    targets: Target[];
}

/** Where the graph was found: the workspace root plus the absolute file path. */
export interface GraphSource {
    root: string;
    file: string;
}

/** Schema version of build-graph.json this extension understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Versioning contract: the extension's major.minor track the Fallout framework
 * release line (e.g. 10.4.x against Fallout 10.4); the patch moves independently.
 * The schema `version` is the hard gate, the major.minor comparison a drift warning.
 * Returns the warning to show, or undefined when the graph lines up.
 */
export function compatibilityMessage(graph: BuildGraph, extensionVersion: string): string | undefined {
    if (graph.version !== SUPPORTED_SCHEMA_VERSION) {
        return `Fallout: build-graph.json uses schema v${graph.version}, but this extension understands v${SUPPORTED_SCHEMA_VERSION}. ` +
            'Update the extension or the Fallout package — the view may be incomplete.';
    }
    if (graph.falloutVersion) {
        const [exMajor, exMinor] = extensionVersion.split('.');
        const [fwMajor, fwMinor] = graph.falloutVersion.split('-')[0].split('.');
        if (exMajor !== fwMajor || exMinor !== fwMinor) {
            return `Fallout: this workspace builds with Fallout ${graph.falloutVersion}, but the extension is versioned ${extensionVersion} ` +
                `(coupled to Fallout ${exMajor}.${exMinor}). Things may not line up.`;
        }
    }
    return undefined;
}

const GRAPH_LOCATIONS = ['.fallout/temp/build-graph.json', '.nuke/temp/build-graph.json'];

/** Probes each root for a graph file: `.fallout/temp` first, then legacy `.nuke/temp`. */
export function locateGraphFile(roots: readonly string[]): GraphSource | undefined {
    for (const root of roots) {
        for (const rel of GRAPH_LOCATIONS) {
            const file = path.join(root, ...rel.split('/'));
            if (fs.existsSync(file)) {
                return { root, file };
            }
        }
    }
    return undefined;
}

export function loadGraph(source: GraphSource): BuildGraph {
    return JSON.parse(fs.readFileSync(source.file, 'utf8'));
}

/**
 * Builds the Mermaid flowchart definition. Same edge semantics as the --plan HTML:
 * solid = execution dependency, dashed = order dependency, thick = trigger.
 * Arrows point in execution-flow direction (prerequisite --> dependent).
 */
export function toMermaid(graph: BuildGraph): string {
    const lines = ['flowchart TD'];
    for (const t of graph.targets) {
        lines.push(`  ${t.name}["${t.name}"]`);
    }
    for (const t of graph.targets) {
        t.dependsOn.forEach(d => lines.push(`  ${d} --> ${t.name}`));
        t.after.forEach(d => lines.push(`  ${d} -.-> ${t.name}`));
        // triggeredBy is the same edge seen from the other side - emitting triggers alone avoids duplicates
        t.triggers.forEach(d => lines.push(`  ${t.name} ==> ${d}`));
    }
    const defaults = graph.targets.filter(t => t.default).map(t => t.name);
    if (defaults.length > 0) {
        lines.push(`  class ${defaults.join(',')} defaultTarget`);
    }
    const unlisted = graph.targets.filter(t => !t.listed).map(t => t.name);
    if (unlisted.length > 0) {
        lines.push(`  class ${unlisted.join(',')} unlisted`);
    }
    lines.push('  classDef defaultTarget stroke-width:3px,font-weight:bold');
    lines.push('  classDef unlisted opacity:0.45,stroke-dasharray:3 3');
    return lines.join('\n');
}

/** Whether a target has any relation to expand in the tree. */
export function hasRelations(target: Target): boolean {
    return RELATIONS.some(r => target[r].length > 0);
}

/** Root order for the tree: listed targets first, then alphabetical. */
export function sortTargets(targets: readonly Target[]): Target[] {
    return targets
        .slice()
        .sort((a, b) => Number(b.listed) - Number(a.listed) || a.name.localeCompare(b.name));
}

/**
 * The expandable children of a target: one entry per related target, grouped by relation
 * in {@link RELATIONS} order. Names the graph doesn't declare are dropped.
 */
export function relatedTargets(target: Target, byName: ReadonlyMap<string, Target>): { relation: Relation; target: Target }[] {
    return RELATIONS.flatMap(relation =>
        target[relation]
            .map(name => byName.get(name))
            .filter((t): t is Target => t !== undefined)
            .map(t => ({ relation, target: t })));
}
