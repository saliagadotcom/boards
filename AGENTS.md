# AGENTS.md

## Architecture & Layout

Monorepo with 4 packages. `@boards/core` is the dialect-agnostic domain layer — all business logic lives here. `@boards/cli`, `@boards/server`, and `@boards/gui` are thin adapters that must not duplicate core logic.

- See `packages/boards-core/src/types.ts` and `packages/boards-core/src/store.ts` for design decisions and package boundaries

## TypeScript Conventions

Follow the compiler settings — they are strict and intentional. Use `.js` extensions on relative imports, `import type` for type-only imports, and never mix value and type imports.

- See `tsconfig.base.json` for all compiler options

## Commands

Use `just` and `bun` for all build, test, and dev workflows. Do not use `npm` or `yarn` at runtime.

- See `justfile` for build, install, test, publish, and bump recipes

## Domain Model

Statuses, issue types, dependency types, ID format, and priority are fixed enums/constraints defined in core. Do not invent new values or bypass validation.

- See `packages/boards-core/src/types.ts` for all domain types and enums
- See `packages/boards-core/src/store.ts` for the full store interface
- See `packages/boards-core/src/validation.ts` for validation rules

## Error Handling

All errors use `BoardsError` with a typed `ErrorCode`. JSON error shape is `{ error: { code, message } }`. Many operations are intentionally idempotent (e.g., closing an already-closed issue is a no-op).

- See `packages/boards-core/src/errors.ts` for error codes and the `BoardsError` class
- See `packages/boards-server/src/errors.ts` for HTTP status mapping
