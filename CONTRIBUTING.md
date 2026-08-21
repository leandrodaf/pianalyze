# Contributing to Pianalyze

Thanks for taking the time to contribute! This document covers everything you need
to get a change merged smoothly.

## Before you start

- For small fixes, feel free to open a PR directly.
- For anything non-trivial (new features, architectural changes), please open an issue
  first to discuss the approach — it saves everyone rework.
- Check open issues and PRs first to avoid duplicate work.

## Development setup

```bash
git clone https://github.com/leandrodaf/pianalyze.git
cd pianalyze
make dev   # hot-reload dev mode (frontend + Go backend)
```

See the [README](README.md#-getting-started) for prerequisites (Go, Node, Wails CLI,
platform-specific system packages).

## Branch naming

Branch off `main` using `<type>/<short-description>`, matching the commit type below:

```
feat/waterfall-zoom
fix/pedal-cc-mislabel
chore/bump-wails
docs/update-pia-format
```

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <description>

[optional body]
```

Types used in this repo: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `ci`.
Scope is usually the package or component touched, e.g. `fix(sheet-canvas): …`,
`feat(practice): …`. Look at `git log` for examples of the house style.

## Before opening a PR

Run the same checks CI runs, so you don't wait on a red build:

```bash
# Go
go build -tags webkit2_41 ./...
go vet -tags webkit2_41 ./...
go test -race -tags webkit2_41 ./...
golangci-lint run --build-tags webkit2_41 ./...

# Frontend (run from frontend/)
npm run check   # svelte-check (type-check)
npm test        # vitest
npm run build   # production build
```

If you touched Go files, make sure they're `gofmt`-clean:

```bash
gofmt -l .   # should print nothing
```

## Opening the PR

- Target `main`.
- Fill in the PR template — a short summary of *why*, plus how you tested it.
- Reference the issue it closes, if any (`Fixes #123`), so it closes automatically on merge.
- Keep PRs focused — one logical change per PR is much easier to review than a bundle
  of unrelated fixes.

## What happens after you open it

- CI runs automatically (`Lint`, `Test / ubuntu-latest`, `Test / macos-latest`,
  `Test / windows-latest`, `Frontend`) — all must pass before merge.
- The PR needs at least one approving review before it can be merged.
- PRs are merged via **squash merge** — your branch's commits become a single commit
  on `main`, so don't worry about a tidy commit-by-commit history; do worry about a
  good final PR title/description, since that becomes the squash commit message.
- Your branch is deleted automatically after merge.

## Reporting bugs

Open an issue with:
- What you did, what you expected, what happened instead
- Steps to reproduce, if you have them
- Platform (OS, and MIDI device if relevant)
- Relevant log output — Pianalyze logs via Zap; include the JSON/console output around
  the failure if you have it

## Code style

- Go: idiomatic Go, `gofmt`-formatted, `golangci-lint`-clean. See `CLAUDE.md` for the
  architecture (pipeline stages, contracts, concurrency model).
- Frontend: Svelte + TypeScript, no new dependencies without discussing first.
- No commented-out code, no debug `console.log`/`fmt.Println` left behind.
- Match the existing patterns in the file you're editing over introducing a new one.

## License

By contributing, you agree your contributions are licensed under the same license as
this repository.
