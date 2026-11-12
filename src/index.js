#!/usr/bin/env node
"use strict";

const path = require("path");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const { VnLspClient } = require("./lsp-client");

const workspaceRoot = path.resolve(
    process.env.VN_MCP_WORKSPACE || path.resolve(__dirname, "..", "..", "varn-lang")
);

const client = new VnLspClient(workspaceRoot);

function text(payload) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { content: [{ type: "text", text: body }] };
}

function resolveInWorkspace(relOrAbsPath) {
    const abs = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.join(workspaceRoot, relOrAbsPath);
    return path.normalize(abs);
}

const ctx = { client, workspaceRoot, resolveInWorkspace, text };

const server = new McpServer({ name: "vn-mcp", version: "0.1.0" });

for (const mod of [
    require("./tools/files"),
    require("./tools/navigation"),
    require("./tools/diagnostics"),
    require("./tools/compiler_inspect"),
    require("./tools/editing"),
    require("./tools/execution"),
    require("./tools/cli"),
    require("./tools/protocol")
]) {
    mod.register(server, ctx);
}

async function main() {
    await client.ensureStarted();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`vn-mcp fatal: ${err?.stack || err}\n`);
    process.exit(1);
});

process.on("SIGINT", async () => {
    await client.stop();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await client.stop();
    process.exit(0);
});
