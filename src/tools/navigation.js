"use strict";

const { z } = require("zod");

const position = { line: z.number().int(), character: z.number().int() };

function register(server, ctx) {
    const { client, resolveInWorkspace, text } = ctx;

    server.registerTool(
        "vn_hover",
        {
            title: "Hover",
            description: "The same hover text the editor shows at a position — type, signature, doc comment.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/hover", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_definition",
        {
            title: "Go to definition",
            description: "Where the symbol at a position is declared.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/definition", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_type_definition",
        {
            title: "Go to type definition",
            description: "Where the TYPE of the symbol at a position is declared — distinct from the symbol's own declaration.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/typeDefinition", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_implementation",
        {
            title: "Go to implementation",
            description: "Concrete implementations of the interface/abstract member at a position.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/implementation", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_references",
        {
            title: "Find references",
            description: "Every reference to the symbol at a position, workspace-wide.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/references", {
                textDocument: { uri },
                position: { line, character },
                context: { includeDeclaration: true }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_document_symbols",
        {
            title: "Document outline",
            description: "The file's symbol outline (classes, functions, fields...) — the same tree the editor's Outline view shows.",
            inputSchema: { path: z.string() }
        },
        async ({ path: relPath }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/documentSymbol", { textDocument: { uri } });
            return text(result);
        }
    );

    server.registerTool(
        "vn_workspace_symbols",
        {
            title: "Search workspace symbols",
            description: "Search every symbol in the workspace by (partial) name — the editor's Ctrl+T.",
            inputSchema: { query: z.string() }
        },
        async ({ query }) => {
            const result = await client.request("workspace/symbol", { query });
            return text(result);
        }
    );

    server.registerTool(
        "vn_signature_help",
        {
            title: "Signature help",
            description: "The parameter-hint popup the editor shows inside a call's parentheses.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/signatureHelp", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_completions",
        {
            title: "Completions",
            description: "What the editor would suggest at a position — same trigger characters and ranking the completion popup uses.",
            inputSchema: { path: z.string(), ...position }
        },
        async ({ path: relPath, line, character }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const result = await client.request("textDocument/completion", {
                textDocument: { uri },
                position: { line, character }
            });
            return text(result);
        }
    );

    server.registerTool(
        "vn_call_hierarchy",
        {
            title: "Call hierarchy",
            description: "Who calls this function, or what this function calls — pick a direction.",
            inputSchema: {
                path: z.string(),
                ...position,
                direction: z.enum(["incoming", "outgoing"]).default("incoming")
            }
        },
        async ({ path: relPath, line, character, direction }) => {
            const uri = await client.ensureOpen(resolveInWorkspace(relPath));
            const items = await client.request("textDocument/prepareCallHierarchy", {
                textDocument: { uri },
                position: { line, character }
            });
            if (!items || items.length === 0) return text({ items: [], calls: [] });

            const method = direction === "outgoing" ? "callHierarchy/outgoingCalls" : "callHierarchy/incomingCalls";
            const calls = await Promise.all(items.map((item) => client.request(method, { item })));
            return text({ items, calls: calls.flat() });
        }
    );
}

module.exports = { register };
