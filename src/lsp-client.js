"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const rpc = require("vscode-jsonrpc/node");

const { resolveCliPath, resolveServerPath } = require("./binary");

const LOG_LIMIT = 4000;

function toUri(absPath) {
    const norm = absPath.replace(/\\/g, "/");
    return norm.startsWith("/") ? `file://${norm}` : `file:///${norm}`;
}

function fromUri(uri) {
    return decodeURIComponent(uri.replace(/^file:\/\/\/?/, process.platform === "win32" ? "" : "/"));
}

/**
 * A full LSP client for `vn lsp` — the same binary and wire protocol
 * vscode-languageclient drives inside the VS Code extension. Nothing here is
 * a re-derivation of what the server knows: every answer is the server's own,
 * over the same JSON-RPC connection an editor would use.
 */
class VarnLspClient {
    constructor(workspaceRoot) {
        this.workspaceRoot = path.resolve(workspaceRoot);
        this.connection = null;
        this.proc = null;
        this.diagnostics = new Map(); // uri -> Diagnostic[]
        this.openDocs = new Map(); // uri -> version
        this.trace = []; // ring buffer: { ts, direction, text }
        this._starting = null;
        this._diagWaiters = new Map(); // uri -> resolve[] — see waitForDiagnostics
    }

    _pushTrace(direction, text) {
        this.trace.push({ ts: Date.now(), direction, text });
        if (this.trace.length > LOG_LIMIT) this.trace.shift();
    }

    /** Idempotent: safe to call from every tool handler. */
    async ensureStarted() {
        if (this.connection) return;
        if (this._starting) return this._starting;
        this._starting = this._start();
        await this._starting;
    }

    async _start() {
        const cliPath = resolveCliPath(this.workspaceRoot);
        if (!cliPath) {
            throw new Error(
                `vn binary not found under ${this.workspaceRoot}. Set VARN_CLI_PATH or build with cargo build --bin vn.`
            );
        }
        this.cliPath = cliPath;
        this.cliMtime = fs.statSync(cliPath).mtime;
        this.startedAt = Date.now();

        this.proc = spawn(resolveServerPath(cliPath), ["lsp"], { cwd: this.workspaceRoot });
        this.proc.stderr.on("data", (d) => this._pushTrace("stderr", d.toString()));
        // The exit notification below asks the server to close its own end
        // of the pipe; a queued write racing that close is expected during
        // every shutdown, not a real fault — without this listener it is an
        // unhandled 'error' event, which Node treats as fatal.
        this.proc.stdin.on("error", () => {});
        this.proc.on("exit", (code) => {
            this._pushTrace("exit", `vn lsp exited with code ${code}`);
            this.connection = null;
        });

        this.connection = rpc.createMessageConnection(
            new rpc.StreamMessageReader(this.proc.stdout),
            new rpc.StreamMessageWriter(this.proc.stdin)
        );

        // Verbose trace is the raw wire log the user asked to see — every
        // request, response and notification, both directions.
        this.connection.trace(rpc.Trace.Verbose, {
            log: (message, data) => this._pushTrace("rpc", data ? `${message}\n${data}` : String(message))
        });

        this.connection.onNotification("textDocument/publishDiagnostics", (params) => {
            this.diagnostics.set(params.uri, params.diagnostics);
            const waiters = this._diagWaiters.get(params.uri);
            if (waiters) {
                for (const resolve of waiters) resolve(params.diagnostics);
                this._diagWaiters.delete(params.uri);
            }
        });

        this.connection.listen();

        const rootUri = toUri(this.workspaceRoot);
        await this.connection.sendRequest("initialize", {
            processId: process.pid,
            rootUri,
            capabilities: {},
            workspaceFolders: [{ uri: rootUri, name: path.basename(this.workspaceRoot) }]
        });
        this.connection.sendNotification("initialized", {});
    }

    /** Opens `absPath` with the server if it isn't already, returns its uri. */
    async ensureOpen(absPath) {
        await this.ensureStarted();
        const uri = toUri(absPath);
        if (this.openDocs.has(uri)) return uri;
        const text = fs.readFileSync(absPath, "utf8");
        this.connection.sendNotification("textDocument/didOpen", {
            textDocument: { uri, languageId: "varn", version: 1, text }
        });
        this.openDocs.set(uri, 1);
        return uri;
    }

    async request(method, params) {
        await this.ensureStarted();
        return this.connection.sendRequest(method, params);
    }

    async notify(method, params) {
        await this.ensureStarted();
        return this.connection.sendNotification(method, params);
    }

    async executeCommand(command, args) {
        return this.request("workspace/executeCommand", { command, arguments: args });
    }

    getDiagnostics(absPath) {
        return this.diagnostics.get(toUri(absPath)) || [];
    }

    /**
     * Diagnostics arrive as a push notification after didOpen, not in the
     * response — reading `diagnostics` immediately after `ensureOpen` races
     * the server. Resolves as soon as the first batch for `absPath` lands
     * (or immediately, if it already has), falling back to whatever's cached
     * (possibly none) after `timeoutMs`.
     */
    async waitForDiagnostics(absPath, timeoutMs = 2000) {
        const uri = toUri(absPath);
        if (this.diagnostics.has(uri)) return this.diagnostics.get(uri);
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                const arr = this._diagWaiters.get(uri);
                if (arr) {
                    const idx = arr.indexOf(wrapped);
                    if (idx >= 0) arr.splice(idx, 1);
                }
                resolve(this.diagnostics.get(uri) || []);
            }, timeoutMs);
            const wrapped = (diags) => {
                clearTimeout(timer);
                resolve(diags);
            };
            if (!this._diagWaiters.has(uri)) this._diagWaiters.set(uri, []);
            this._diagWaiters.get(uri).push(wrapped);
        });
    }

    getTrace(limit) {
        const n = limit && limit > 0 ? limit : 200;
        return this.trace.slice(-n);
    }

    /** Close a document server-side and drop its local diagnostics/tracking. */
    async closeDocument(absPath) {
        const uri = toUri(absPath);
        if (!this.openDocs.has(uri)) return;
        await this.notify("textDocument/didClose", { textDocument: { uri } });
        this.openDocs.delete(uri);
        this.diagnostics.delete(uri);
    }

    status() {
        return {
            running: !!this.connection,
            pid: this.proc ? this.proc.pid : null,
            cliPath: this.cliPath || null,
            cliMtime: this.cliMtime || null,
            startedAt: this.startedAt || null,
            uptimeMs: this.startedAt ? Date.now() - this.startedAt : null,
            openDocuments: Array.from(this.openDocs.keys()).map(fromUri),
            workspaceRoot: this.workspaceRoot
        };
    }

    /** Tear down and spin up a fresh `vn lsp` — picks up a rebuilt binary. */
    async restart() {
        await this.stop();
        this.openDocs.clear();
        this.diagnostics.clear();
        this._starting = null;
        await this.ensureStarted();
    }

    async stop() {
        try {
            if (this.connection) await this.connection.sendRequest("shutdown", null);
        } catch {}
        try {
            if (this.connection) await this.connection.sendNotification("exit", null);
        } catch {}
        if (this.connection) this.connection.dispose();
        if (this.proc) {
            this.proc.stdin.destroy();
            this.proc.kill();
        }
        this.connection = null;
    }
}

module.exports = { VarnLspClient, toUri, fromUri };
