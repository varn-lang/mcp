# varn-mcp

An MCP server that gives an agent the same view of a Varn workspace the
editor gets — it speaks LSP directly to `vn lsp`, the exact binary and wire
protocol `vscode-languageclient` drives inside the VS Code extension. Nothing
here re-derives an answer the checker already gave; every tool is a thin
wrapper over a real LSP request against a real running server.

## Tools

- `varn_list_files` — every `.vn` file under the workspace (or a subdirectory).
- `varn_read_file` — a file's raw text.
- `varn_hover` — hover text at a position (type, signature, doc comment).
- `varn_diagnostics` — the last diagnostics batch published for a file.
- `varn_definition` / `varn_references` — go to definition / find references.
- `varn_ast` / `varn_bytecode` / `varn_ssa` / `varn_cfg` — the same compiler
  views the editor's "Show AST" / "Show Bytecode" / "Show SSA" / CFG commands
  render, via `workspace/executeCommand`.
- `varn_raw_request` — send any LSP method/params straight through and get
  the raw response back; for anything not covered by a dedicated tool.
- `varn_lsp_log` — the raw JSON-RPC wire trace between this server and
  `vn lsp` (every request, response, notification) — what an editor's LSP
  output channel shows.

## How it resolves `vn`

Same order as `varn-extension/src/binary.js`: `VARN_CLI_PATH` override,
`VARN_HOME/bin`, `<workspace>/target/{debug,release}` (mode via
`VARN_BUILD_MODE`, default debug), the sibling `varn-lang` checkout, then
`PATH`.

## Workspace root

Defaults to the sibling `varn-lang` directory (`../varn-lang` relative to
this package). Override with `VARN_MCP_WORKSPACE`.

## Registering with Claude Code

`varn-lang/.mcp.json` already points at `../varn-mcp/src/index.js` as a
project-scoped server named `varn`.
