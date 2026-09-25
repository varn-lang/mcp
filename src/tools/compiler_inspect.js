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

    define("varn_ast", "varn.showAst", "Show AST", "The parsed syntax tree, as `Varn: Show AST` renders it in the editor.");
    define(
        "varn_bytecode",
        "varn.showBytecode",
        "Show bytecode",
        "Compiles the file and disassembles the bytecode the VM would actually run — what `Varn: Show Bytecode` shows."
    );
    define("varn_ssa", "varn.showSSA", "Show SSA", "The TIR/SSA the JIT lowers from, one function at a time.");
    define("varn_cfg", "varn.getCFG", "Get CFG", "The control-flow graph the visual debugger draws, as structured JSON.");
}

module.exports = { register };
