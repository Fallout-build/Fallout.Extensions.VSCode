// Run-configuration persistence: no `vscode` import, so it runs under plain Node (unit tests).
/** A build parameter passed to a local run as `--name value`. */
export interface Parameter {
    name: string;
    value: string;
}

/** The slice of `vscode.Memento` the store needs. */
export interface StateStore {
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): PromiseLike<void>;
}

/** The slice of `vscode.SecretStorage` the store needs. */
export interface SecretStore {
    store(key: string, value: string): PromiseLike<void>;
    get(key: string): PromiseLike<string | undefined>;
    delete(key: string): PromiseLike<void>;
}

/** The slice of `vscode.ExtensionContext` the store needs, so it runs without VS Code. */
export interface RunConfigContext {
    workspaceState: StateStore;
    secrets: SecretStore;
}

const PARAMS_KEY = 'fallout.parameters';
const SECRET_NAMES_KEY = 'fallout.secretNames';
const SECRET_PREFIX = 'fallout.secret.';

/**
 * Persists the local run configuration: parameters live in workspace state (plain,
 * per-workspace); secret *values* live in VS Code's SecretStorage (OS keychain-backed)
 * and are never rendered into the webview — only their names are. Parameters become
 * CLI args (`--name value`); secrets become environment variables so they don't leak
 * into shell history or the process list.
 */
export class RunConfigStore {
    private readonly listeners = new Set<() => void>();

    /** Subscribes to changes; the returned handle is structurally a `vscode.Disposable`. */
    readonly onDidChange = (listener: () => void): { dispose(): void } => {
        this.listeners.add(listener);
        return { dispose: () => { this.listeners.delete(listener); } };
    };

    constructor(private readonly context: RunConfigContext) {}

    private fire(): void {
        for (const listener of [...this.listeners]) {
            listener();
        }
    }

    getParameters(): Parameter[] {
        return this.context.workspaceState.get<Parameter[]>(PARAMS_KEY, []);
    }

    async setParameter(name: string, value: string): Promise<void> {
        const params = this.getParameters().filter(p => p.name !== name);
        params.push({ name, value });
        params.sort((a, b) => a.name.localeCompare(b.name));
        await this.context.workspaceState.update(PARAMS_KEY, params);
        this.fire();
    }

    async removeParameter(name: string): Promise<void> {
        await this.context.workspaceState.update(PARAMS_KEY, this.getParameters().filter(p => p.name !== name));
        this.fire();
    }

    getSecretNames(): string[] {
        return this.context.workspaceState.get<string[]>(SECRET_NAMES_KEY, []);
    }

    async setSecret(name: string, value: string): Promise<void> {
        await this.context.secrets.store(SECRET_PREFIX + name, value);
        if (!this.getSecretNames().includes(name)) {
            await this.context.workspaceState.update(SECRET_NAMES_KEY, [...this.getSecretNames(), name].sort());
        }
        this.fire();
    }

    async removeSecret(name: string): Promise<void> {
        await this.context.secrets.delete(SECRET_PREFIX + name);
        await this.context.workspaceState.update(SECRET_NAMES_KEY, this.getSecretNames().filter(n => n !== name));
        this.fire();
    }

    /** Parameters rendered as a CLI argument string, e.g. `--configuration Release`. */
    buildArgs(): string {
        return this.getParameters()
            .map(p => `--${p.name} ${quoteArg(p.value)}`)
            .join(' ');
    }

    /** Resolves all stored secrets into an environment map for a local run. */
    async buildEnv(): Promise<Record<string, string>> {
        const env: Record<string, string> = {};
        for (const name of this.getSecretNames()) {
            const value = await this.context.secrets.get(SECRET_PREFIX + name);
            if (value !== undefined) {
                env[name] = value;
            }
        }
        return env;
    }
}

export function quoteArg(value: string): string {
    return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
