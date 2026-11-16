import * as vscode from 'vscode';
import { BuildGraph, GraphSource, compatibilityMessage, locateGraphFile } from './graph';

export * from './graph';

const warned = new Set<string>();

/** Warns once per distinct message when the graph and extension don't line up. */
export function checkCompatibility(graph: BuildGraph, extensionVersion: string): void {
    const message = compatibilityMessage(graph, extensionVersion);
    if (message && !warned.has(message)) {
        warned.add(message);
        void vscode.window.showWarningMessage(message);
    }
}

export function findGraphFile(): GraphSource | undefined {
    return locateGraphFile((vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath));
}
