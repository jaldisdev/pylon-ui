# Pylon UI

Web GUI for Pylon — a REPL, Query Editor, Data Explorer, and AI chat for a
running `pylon serve` instance.

## Requirements

- Node.js 20+
- A running `pylon serve` process (see the [pylon](../pylon) repo)

## Development

```bash
npm install
npm run dev
```

By default the dev server proxies `/api` requests to
`http://localhost:5656`. To point it at a different `pylon serve` instance,
copy `.env.example` to `.env.local` and set `PYLON_SERVE_URL`.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — typecheck and build for production
- `npm run typecheck` — typecheck only
- `npm run preview` — preview a production build locally
- `npm run generate:pyql-lang` — regenerate the PyQL Lezer grammar after
  editing `src/lib/editor/lang-pyql/lang.grammar`

## Project structure

- `src/features/repl` — the PyQL REPL tab
- `src/features/queryEditor` — the Query Editor tab (query history,
  parameters, results, `analyze` visualization)
- `src/features/dataExplorer` — the Data Explorer tab (data grid, inline
  editing, filters)
- `src/features/ai` — the AI chat tab
- `src/features/dashboard` — the dashboard/landing tab
- `src/lib/editor` — the PyQL CodeMirror language package
- `src/lib/api` — the API client and schema/data hooks
- `src/ui` — shared UI primitives

## License

Licensed under either of [MIT](LICENSE-MIT) or
[Apache License, Version 2.0](LICENSE-APACHE) at your option.
