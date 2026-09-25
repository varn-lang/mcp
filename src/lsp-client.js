"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const rpc = require("vscode-jsonrpc/node");

const { resolveCliPath } = require("./binary");

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

        this.proc = spawn(cliPath, ["lsp"], { cwd: this.workspaceRoot });
        this.proc.stderr.on("data", (d) => this._pushTrace("stderr", d.toString()));
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

    getTrace(limit) {
        const n = limit && limit > 0 ? limit : 200;
        return this.trace.slice(-n);
    }

    async stop() {
        try {
            if (this.connection) await this.connection.sendRequest("shutdown", null);
        } catch {}
        try {
            if (this.connection) this.connection.sendNotification("exit", null);
        } catch {}
        if (this.connection) this.connection.dispose();
        if (this.proc) this.proc.kill();
        this.connection = null;
    }
}

module.exports = { VarnLspClient, toUri, fromUri };
