# Contributing

## Branches

Work happens on a short-lived branch cut from `main`, named after its type:
`feat/…`, `fix/…`, `docs/…`, `chore/…`. Changes reach `main` through a pull request.

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <imperative summary>
```

Types in use: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`. Keep one logical change per commit.

## Pull requests

A pull request description covers:

- **Summary** — what changes and why.
- **Related issue** — `Closes #<n>` when one exists.
- **Changes** — the files or components touched.
- **Testing** — commands run and their result, or why none apply.

Evidence in a pull request (test output, logs, screenshots) must come from a real run. If something
could not be run, say so.

## Before opening a pull request

```bash
cd services/<service> && ./mvnw test
cd services/web-ui    && npm run typecheck
```

## Keeping the logs current

- Add a dated entry to [`docs/devlog/PROGRESS.md`](docs/devlog/PROGRESS.md) for each working day.
- Record notable changes under `[Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
