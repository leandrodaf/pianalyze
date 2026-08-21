# Contributing to Pianalyze

Thanks for your interest in contributing! This project is a cross-platform desktop app built with Go, Wails, and Svelte.

## Getting started

```bash
make dev          # hot-reload dev mode (Wails + frontend)
go test -race -tags webkit2_41 ./...
golangci-lint run --build-tags webkit2_41 ./...
cd frontend && npm ci && npm run check && npm test
```

See [CLAUDE.md](CLAUDE.md) for a full architecture overview and command reference.

## Before opening a PR

- `go vet` and `golangci-lint` must pass (`--build-tags webkit2_41`).
- Add or update tests for any behavior change; `go test -race` must pass.
- Frontend changes must pass `npm run check` (svelte-check) and `npm test`.
- Keep commits focused — one logical change per commit.

## Reporting bugs / requesting features

Use the issue templates. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Code style

- Go: idiomatic Go, enforced by `golangci-lint` (see `.golangci.yml`).
- Frontend: TypeScript + Svelte, checked by `svelte-check`.
- No unrelated refactors in the same PR as a bug fix or feature.
