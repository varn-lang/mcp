"use strict";

const { z } = require("zod");

function register(server, ctx) {
    const { client, resolveInWorkspace, text } = ctx;

    const define = (name, command, title, description) => {
        server.registerTool(
            name,
            { title, description, inputSchema: { path: z.string() } },
            async ({ path: relPath }) => {
                const uri = await client.ensureOpen(resolveInWorkspace(relPath));
                const result = await client.executeCommand(command, [uri]);
                return text(result);
            }
        );
    };

    define("vn_ast", "vn.showAst", "Show AST", "The parsed syntax tree, as `Varn: Show AST` renders it in the editor.");
    define(
        "vn_bytecode",
        "vn.showBytecode",
        "Show bytecode",
        "Compiles the file and disassembles the bytecode the VM would actually run — what `Varn: Show Bytecode` shows."
    );
    define("vn_ssa", "vn.showSSA", "Show SSA", "The TIR/SSA the JIT lowers from, one function at a time.");
    define("vn_cfg", "vn.getCFG", "Get CFG", "The control-flow graph the visual debugger draws, as structured JSON.");
}

module.exports = { register };
