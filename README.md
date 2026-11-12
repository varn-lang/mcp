# varn-mcp

An MCP server that gives an agent the same view of a Varn workspace the
editor gets — it speaks LSP directly to `vn lsp`, the exact binary and wire
protocol `vscode-languageclient` drives inside the VS Code extension, plus
runs the CLI's own subcommands (`run`/`check`/`bench`) for real, not
simulated, output. Nothing here re-derives an answer the checker already
gave; every tool is a thin wrapper over a real request against a real
running process.

## Tools

**Files**
- `varn_list_files` — every `.vn` file under the workspace (or a subdirectory).
- `varn_read_file` — a file's raw text.

**Navigation**
- `varn_hover` — hover text at a position (type, signature, doc comment).
- `varn_definition` / `varn_type_definition` / `varn_implementation` — go to
  declaration / type / implementation.
- `varn_references` — every reference to a symbol, workspace-wide.
- `varn_document_symbols` — a file's outline.
- `varn_workspace_symbols` — search symbols by name across the workspace.
- `varn_signature_help` — the parameter-hint popup inside a call.
- `varn_completions` — what the editor would suggest at a position.
- `varn_call_hierarchy` — incoming or outgoing calls for a function.

**Diagnostics**
- `varn_diagnostics` — the last diagnostics batch for one file.
- `varn_workspace_diagnostics` — diagnostics for every file opened so far in
  this session.
- `varn_code_actions` — quick fixes / refactors available for a range.

**Compiler views**
- `varn_ast` / `varn_bytecode` / `varn_ssa` / `varn_cfg` — the same views the
  editor's "Show AST" / "Show Bytecode" / "Show SSA" / CFG commands render.

**Editing previews** (never write to disk)
- `varn_format_preview` — the TextEdit[] the formatter would apply.
- `varn_rename_preview` — the WorkspaceEdit a rename would produce.

**Execution** (spawns `vn` directly, not through the LSP session)
- `varn_run_file` — `vn run <file>`, real stdout/stderr/exit code.
- `varn_check_file` — `vn check <file>`.
- `varn_bench_file` — `vn bench <file>`.

**Protocol / lifecycle**
- `varn_raw_request` — send any LSP method/params straight through and get
  the raw response back.
- `varn_lsp_log` — the raw JSON-RPC wire trace (every request, response,
  notification, both directions) — what an editor's LSP output channel shows.
- `varn_server_status` — is the server alive, which binary + mtime it's
  running (confirms a rebuild actually took), pid, uptime, open documents.
- `varn_restart_server` — tear down and relaunch `vn lsp`, e.g. after a
  rebuild.
- `varn_close_file` — drop a file's open/diagnostics tracking.

## How it resolves `vn`

Same order as `varn-extension/src/binary.js`: `VARN_CLI_PATH` override,
`VARN_HOME/bin`, `<workspace>/target/{debug,release}` (mode via
`VARN_BUILD_MODE`, default debug), the sibling `varn-lang` checkout, then
`PATH`.

## Workspace root

Defaults to the sibling `varn-lang` directory (`../varn-lang` relative to
this package). Override with `VARN_MCP_WORKSPACE`.

## Registering

- Claude Code: `varn-lang/.mcp.json` points at `../varn-mcp/src/index.js` as
  a project-scoped server named `varn`.
- VS Code: `varn.code-workspace`'s `mcp.servers.varn` does the same, using
  `${workspaceFolder:varn-mcp}`.

## License

Apache-2.0, see `LICENSE`.
