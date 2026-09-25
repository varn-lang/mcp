#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { z } = require("zod");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const { VarnLspClient, toUri } = require("./lsp-client");

const workspaceRoot = path.resolve(
    process.env.VARN_MCP_WORKSPACE || path.resolve(__dirname, "..", "..", "varn-lang")
);

const client = new VarnLspClient(workspaceRoot);

function text(payload) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    return { content: [{ type: "text", text: body }] };
}

function resolveInWorkspace(relOrAbsPath) {
    const abs = path.isAbsolute(relOrAbsPath)
        ? relOrAbsPath
        : path.join(workspaceRoot, relOrAbsPath);
    return path.normalize(abs);
}

const server = new McpServer({
    name: "varn-mcp",
    version: "0.1.0"
});

server.registerTool(
    "varn_list_files",
    {
        title: "List Varn files",
        description:
            "List every .vn file under the workspace (or a subdirectory), the same files the editor's workspace symbol search sees.",
        inputSchema: {
            subdir: z.string().optional().describe("Subdirectory relative to the workspace root, e.g. 'std/task'.")
        }
    },
    async ({ subdir }) => {
        const root = subdir ? resolveInWorkspace(subdir) : workspaceRoot;
        const out = [];
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.name === "target" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.name.endsWith(".vn")) out.push(path.relative(workspaceRoot, full));
            }
        };
        walk(root);
        return text(out);
    }
);

server.registerTool(
    "varn_read_file",
    {
        title: "Read a Varn source file",
        description: "Read a .vn file's raw text, path relative to the workspace root.",
        inputSchema: { path: z.string() }
    },
    async ({ path: relPath }) => {
        const abs = resolveInWorkspace(relPath);
        return text(fs.readFileSync(abs, "utf8"));
    }
);

server.registerTool(
    "varn_hover",
    {
        title: "Hover",
        description: "The same hover text the editor shows at a position — type, signature, doc comment.",
        inputSchema: { path: z.string(), line: z.number().int(), character: z.number().int() }
    },
    async ({ path: relPath, line, character }) => {
        const abs = resolveInWorkspace(relPath);
        const uri = await client.ensureOpen(abs);
        const result = await client.request("textDocument/hover", {
            textDocument: { uri },
            position: { line, character }
        });
        return text(result);
    }
);

server.registerTool(
    "varn_diagnostics",
    {
        title: "Diagnostics",
        description: "The last diagnostics batch the server published for this file (errors/warnings, as the editor's Problems panel would show).",
        inputSchema: { path: z.string() }
    },
    async ({ path: relPath }) => {
        const abs = resolveInWorkspace(relPath);
        await client.ensureOpen(abs);
        return text(client.getDiagnostics(abs));
    }
);

server.registerTool(
    "varn_definition",
    {
        title: "Go to definition",
        description: "Where the symbol at a position is declared.",
        inputSchema: { path: z.string(), line: z.number().int(), character: z.number().int() }
    },
    async ({ path: relPath, line, character }) => {
        const abs = resolveInWorkspace(relPath);
        const uri = await client.ensureOpen(abs);
        const result = await client.request("textDocument/definition", {
            textDocument: { uri },
            position: { line, character }
        });
        return text(result);
    }
);

server.registerTool(
    "varn_references",
    {
        title: "Find references",
        description: "Every reference to the symbol at a position, workspace-wide.",
        inputSchema: { path: z.string(), line: z.number().int(), character: z.number().int() }
    },
    async ({ path: relPath, line, character }) => {
        const abs = resolveInWorkspace(relPath);
        const uri = await client.ensureOpen(abs);
        const result = await client.request("textDocument/references", {
            textDocument: { uri },
            position: { line, character },
            context: { includeDeclaration: true }
        });
        return text(result);
    }
);

function compilerInspectTool(name, command, title, description) {
    server.registerTool(
        name,
        { title, description, inputSchema: { path: z.string() } },
        async ({ path: relPath }) => {
            const abs = resolveInWorkspace(relPath);
            const uri = await client.ensureOpen(abs);
            const result = await client.executeCommand(command, [uri]);
            return text(result);
        }
    );
}

compilerInspectTool(
    "varn_ast",
    "varn.showAst",
    "Show AST",
    "The parsed syntax tree, as `Varn: Show AST` renders it in the editor."
);
compilerInspectTool(
    "varn_bytecode",
    "varn.showBytecode",
    "Show bytecode",
    "Compiles the file and disassembles the bytecode the VM would actually run — what `Varn: Show Bytecode` shows."
);
compilerInspectTool(
    "varn_ssa",
    "varn.showSSA",
    "Show SSA",
    "The TIR/SSA the JIT lowers from, one function at a time."
);
compilerInspectTool(
    "varn_cfg",
    "varn.getCFG",
    "Get CFG",
    "The control-flow graph the visual debugger draws, as structured JSON."
);

server.registerTool(
    "varn_raw_request",
    {
        title: "Raw LSP request",
        description:
            "Send an arbitrary LSP method with raw params straight to `vn lsp` and return its raw response — for anything not covered by a dedicated tool, or to inspect the protocol directly.",
        inputSchema: {
            method: z.string().describe("LSP method name, e.g. 'textDocument/documentSymbol'."),
            params: z.record(z.string(), z.unknown()).optional(),
            notification: z
                .boolean()
                .optional()
                .describe("Send as a notification (no response expected) instead of a request.")
        }
    },
    async ({ method, params, notification }) => {
        if (notification) {
            await client.notify(method, params ?? {});
            return text({ sent: true, method, params });
        }
        const result = await client.request(method, params ?? {});
        return text(result);
    }
);

server.registerTool(
    "varn_lsp_log",
    {
        title: "Raw JSON-RPC log",
        description:
            "The raw wire trace between this MCP server and `vn lsp` — every request, response and notification, newest last. This is exactly what an editor's LSP output channel shows.",
        inputSchema: { limit: z.number().int().optional().describe("How many recent entries to return (default 200).") }
    },
    async ({ limit }) => {
        return text(client.getTrace(limit));
    }
);

async function main() {
    await client.ensureStarted();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    process.stderr.write(`varn-mcp fatal: ${err?.stack || err}\n`);
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
