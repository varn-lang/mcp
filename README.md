# Varn MCP

An MCP server that gives an agent the same view of a Varn workspace the
editor gets — it speaks LSP directly to `vn lsp`, the exact binary and wire
protocol `vscode-languageclient` drives inside the VS Code extension, plus
runs the CLI's own subcommands (`run`/`check`/`bench`) for real, not
simulated, output. Nothing here re-derives an answer the checker already
gave; every tool is a thin wrapper over a real request against a real
running process.

## Tools

**Files**
- `vn_list_files` — every `.vn` file under the workspace (or a subdirectory).
- `vn_read_file` — a file's raw text.

**Navigation**
- `vn_hover` — hover text at a position (type, signature, doc comment).
- `vn_definition` / `vn_type_definition` / `vn_implementation` — go to
  declaration / type / implementation.
- `vn_references` — every reference to a symbol, workspace-wide.
- `vn_document_symbols` — a file's outline.
- `vn_workspace_symbols` — search symbols by name across the workspace.
- `vn_signature_help` — the parameter-hint popup inside a call.
- `vn_completions` — what the editor would suggest at a position.
- `vn_call_hierarchy` — incoming or outgoing calls for a function.

**Diagnostics**
- `vn_diagnostics` — the last diagnostics batch for one file.
- `vn_workspace_diagnostics` — diagnostics for every file opened so far in
  this session.
- `vn_code_actions` — quick fixes / refactors available for a range.

**Compiler views**
- `vn_ast` / `vn_bytecode` / `vn_ssa` / `vn_cfg` — the same views the
  editor's "Show AST" / "Show Bytecode" / "Show SSA" / CFG commands render.

**Editing previews** (never write to disk)
- `vn_format_preview` — the TextEdit[] the formatter would apply.
- `vn_rename_preview` — the WorkspaceEdit a rename would produce.

**Execution** (spawns `vn` directly, not through the LSP session)
- `vn_run_file` — `vn run <file>`, real stdout/stderr/exit code.
- `vn_check_file` — `vn check <file>`.
- `vn_bench_file` — `vn bench <file>`.

**Protocol / lifecycle**
- `vn_raw_request` — send any LSP method/params straight through and get
  the raw response back.
- `vn_lsp_log` — the raw JSON-RPC wire trace (every request, response,
  notification, both directions) — what an editor's LSP output channel shows.
- `vn_server_status` — is the server alive, which binary + mtime it's
  running (confirms a rebuild actually took), pid, uptime, open documents.
- `vn_restart_server` — tear down and relaunch `vn lsp`, e.g. after a
  rebuild.
- `vn_close_file` — drop a file's open/diagnostics tracking.

## How it resolves `vn`

Same order as `varn-extension/src/binary.ts`: `VN_CLI_PATH` override,
`VN_HOME/bin`, `<workspace>/target/{debug,release}` (mode via
`VN_BUILD_MODE`, default debug), the sibling `varn-lang` checkout, then
`PATH`.

## Workspace root

Defaults to the sibling `varn-lang` directory (`../varn-lang` relative to
this package). Override with `VN_MCP_WORKSPACE`.

## Registering

- Claude Code: `varn-lang/.mcp.json` points at `../varn-mcp/src/index.js` as
  a project-scoped server named `vn`.
- VS Code: `varn.code-workspace`'s `mcp.servers.vn` does the same, using
  `${workspaceFolder:varn-mcp}`.

## License

Apache-2.0, see `LICENSE`.
