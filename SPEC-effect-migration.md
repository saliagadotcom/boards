# Boards Effect v4 Migration Specification

## 1. Overview

**Goal**: Big-bang migrate the boards monorepo from hand-rolled TypeScript (Commander, Hono, raw `fetch`, `bun:test`) to Effect v4 (`ServiceMap.Service`, `Schema`, `effect/unstable/cli`, `effect/unstable/httpapi`, `@effect/vitest`), keeping Kysely for SQL and Ink/React for the TUI.

**Non-goals**:
- Migrating `boards-tui` (Ink/React is its own paradigm)
- Replacing Kysely with `@effect/sql` or `@effect/sql-kysely`
- Changing the CLI command names, flags, or user-facing behavior
- Changing the HTTP API paths or response shapes (wire-compatible)
- Adding new features — this is a pure infrastructure migration

**Core Concept**:
```
┌──────────────────────────────────────────────────────────┐
│                     boards-core                          │
│                                                          │
│  Schema.Class ─── Domain types (Board, Issue, …)         │
│  TaggedError  ─── Typed errors (NotFound, Conflict, …)   │
│  ServiceMap   ─── BoardsStore service contract           │
│  HttpApi      ─── BoardsApi endpoint declarations        │
│  Layer        ─── SqliteBoardsStore (Kysely internals)   │
│                                                          │
└────────────┬─────────────┬───────────────┬───────────────┘
             │             │               │
     ┌───────▼──────┐  ┌──▼────────┐  ┌───▼──────────┐
     │ boards-server│  │ boards-cli│  │ boards-client│
     │              │  │           │  │              │
     │ HttpApiBuilder│ │ Effect CLI│  │ HttpApiClient│
     │ BunRuntime   │  │ BunRuntime│  │ (typed HTTP) │
     └──────────────┘  └───────────┘  └──────────────┘
```

## 2. User Stories (Prioritized)

### Story: Domain types become Effect Schemas (P1)

Replace plain TypeScript interfaces (`Board`, `Issue`, `Comment`, etc.) and string-literal unions (`Status`, `IssueType`, etc.) with `Schema.Class` and `Schema.Literal` so that validation, serialization, and type-narrowing come from a single source of truth.

**Why this priority**: Every other migration phase depends on Schema-based types. Without them, errors can't use `Schema.TaggedError`, the HttpApi can't declare endpoint schemas, and the CLI can't validate arguments with `Argument.withSchema`.

**Acceptance Criteria**:
1. **Given** the existing `types.ts` interfaces, **When** migrated to `Schema.Class`, **Then** every field has an Effect Schema (e.g., `Schema.String`, `Schema.Number`, branded IDs)
2. **Given** string-literal unions like `Status`, **When** migrated, **Then** they use `Schema.Literal` and validation is automatic (no hand-rolled `parseStatus`)
3. **Given** the existing `validation.ts` parse functions, **When** Schema is adopted, **Then** `parseStatus`, `parseIssueType`, `parseDependencyType`, `parseDirection`, `parsePriority`, `parseResolution` are deleted and replaced by Schema decode

### Story: Errors become Schema.TaggedError (P1)

Replace the single `BoardsError` class (which carries an `ErrorCode` string) with individual `Schema.TaggedErrorClass` subclasses — one per error code — so errors are type-tracked in the Effect channel.

**Why this priority**: Typed errors are the primary Effect benefit. The server needs them for HTTP status mapping; the CLI needs them for user-facing messages; tests need them for assertions.

**Acceptance Criteria**:
1. **Given** the 8 existing error codes, **When** migrated, **Then** there are 8 `Schema.TaggedErrorClass` definitions: `NotFoundError`, `ConflictError`, `InvalidRequestError`, `InvalidTransitionError`, `SelfDependencyError`, `CircularDependencyError`, `CrossBoardError`, `InternalError`
2. **Given** a store method that throws `BoardsError`, **When** migrated, **Then** its Effect signature declares the specific error tags in the `E` channel (e.g., `Effect<Issue, NotFoundError | InvalidRequestError>`)
3. **Given** the server error handler, **When** migrated, **Then** HTTP status mapping uses `catchTag` / `catchTags` instead of `instanceof BoardsError`

### Story: BoardsStore becomes a ServiceMap.Service (P1)

Replace the `IBoardsStore` interface and `BoardsStore` class with an Effect `ServiceMap.Service` and a `Layer.effect` implementation backed by Kysely.

**Why this priority**: The service boundary is the architectural centerpiece. CLI, server, and client all consume it.

**Acceptance Criteria**:
1. **Given** `IBoardsStore` with 20+ Promise-returning methods, **When** migrated, **Then** `BoardsStore` is a `ServiceMap.Service` with Effect-returning methods
2. **Given** the current `BoardsStore` class that takes `Kysely<Database>`, **When** migrated, **Then** there is a `BoardsStore.SqliteLayer` that wraps Kysely calls in `Effect.tryPromise`
3. **Given** the `openDatabase` function, **When** migrated, **Then** database setup (PRAGMA, WAL, foreign keys) is a scoped `Layer` with automatic cleanup via `addFinalizer`
4. **Given** the migration function, **When** migrated, **Then** `migrate(db)` is part of the `SqliteLayer` construction

### Story: HttpApi contract in boards-core (P1)

Define the full REST API as an `HttpApi` with `HttpApiGroup`s and `HttpApiEndpoint`s in `boards-core`, using the Schema types for request/response.

**Why this priority**: Both the server (HttpApiBuilder) and client (HttpApiClient) derive from this contract. It must exist before either can be built.

**Acceptance Criteria**:
1. **Given** the 9 route groups (boards, issues, deps, labels, ready, claim, comments, epics, metadata), **When** migrated, **Then** there are corresponding `HttpApiGroup`s
2. **Given** each route handler's request/response shapes, **When** migrated, **Then** each endpoint declares params, query, payload, success, and error schemas
3. **Given** the `/api/v1` prefix, **When** migrated, **Then** the `HttpApi` uses `.prefix("/api/v1")`
4. **Given** the existing URL structure (e.g., `/boards/:board/issues/:id`), **When** migrated, **Then** endpoint paths are identical — wire-compatible

### Story: Server uses HttpApiBuilder (P2)

Replace Hono with `HttpApiBuilder.group` / `HttpApiBuilder.layer` to implement the `BoardsApi` contract, with `BunRuntime.runMain` as entry point.

**Why this priority**: Depends on the HttpApi contract and BoardsStore service from P1.

**Acceptance Criteria**:
1. **Given** the existing `createApp(store)` function, **When** migrated, **Then** the server is a `Layer` composition: `HttpApiBuilder.layer(BoardsApi)` + group handlers + `BoardsStore.SqliteLayer`
2. **Given** the existing error handler mapping `ErrorCode → HTTP status`, **When** migrated, **Then** errors are mapped via `HttpApiSchema.withStatus` annotations on the `TaggedError` classes
3. **Given** `Bun.serve({ fetch: app.fetch })`, **When** migrated, **Then** entry point uses `BunRuntime.runMain` with Effect's HTTP server
4. **Given** the existing `SIGINT`/`SIGTERM` handlers, **When** migrated, **Then** graceful shutdown is handled by Effect's `Scope` / `addFinalizer`

### Story: CLI uses Effect CLI (P2)

Replace Commander with `effect/unstable/cli` — `Command.make`, `Argument`, `Flag` — keeping the `bd` binary name and all existing subcommands.

**Why this priority**: Depends on BoardsStore service. Can be done in parallel with server migration.

**Acceptance Criteria**:
1. **Given** the 23 existing subcommands, **When** migrated, **Then** all subcommands exist as `Command.make` definitions with identical names
2. **Given** Commander flags like `-p, --priority <n>`, **When** migrated, **Then** they are `Flag.integer("priority").pipe(Flag.withAlias("p"), Flag.withDefault(1))`
3. **Given** the `--server <url>` global option, **When** migrated, **Then** it controls whether `BoardsStore.SqliteLayer` or `BoardsStore.HttpLayer` is provided
4. **Given** the `--json` output flag, **When** migrated, **Then** JSON output behavior is preserved
5. **Given** `bd --help` and `bd <command> --help`, **When** migrated, **Then** help text matches current UX (description, examples, environment variables)
6. **Given** the `bin/bd.ts` entry point, **When** migrated, **Then** it uses `Command.run` with `BunRuntime.runMain`

### Story: Client uses HttpApiClient (P2)

Replace `RemoteBoardsStore` (raw `fetch`) with an `HttpApiClient.make(BoardsApi)` that derives a fully typed client from the shared contract.

**Why this priority**: Depends on HttpApi contract. Small package (~150 LoC), straightforward.

**Acceptance Criteria**:
1. **Given** the `RemoteBoardsStore` class, **When** migrated, **Then** there is a `BoardsStore.HttpLayer` that provides `BoardsStore` via `HttpApiClient`
2. **Given** the hand-rolled error mapping (parse JSON `{ error: { code, message } }`), **When** migrated, **Then** error mapping is automatic from the HttpApi error schemas
3. **Given** `createRemoteStore(url)`, **When** migrated, **Then** there is a `BoardsStore.httpLayer(url)` factory

### Story: Tests use @effect/vitest (P3)

Migrate the ~3,600 lines of `bun:test` tests (14 test files in core, 4 in server, 1 in client) to `@effect/vitest` with `it.effect`.

**Why this priority**: Tests are the last thing to migrate. The code must work first.

**Acceptance Criteria**:
1. **Given** tests using `bun:test` `describe`/`it`/`expect`, **When** migrated, **Then** they use `@effect/vitest` with `it.effect`
2. **Given** test setup creating `Kysely<Database>` directly, **When** migrated, **Then** tests use `BoardsStore.TestLayer` (in-memory SQLite)
3. **Given** server integration tests, **When** migrated, **Then** they test via `HttpApiClient` against the `HttpApiBuilder` layer (no network I/O)
4. **Given** `bun test` as the test runner, **When** migrated, **Then** tests run via `bun vitest` (or `bunx vitest`)

### Story: Repo setup for Effect (P1)

Configure the repository for Effect v4: language service, tsconfig, dependencies, agent instructions.

**Why this priority**: Must be done first so all subsequent code has proper tooling.

**Acceptance Criteria**:
1. **Given** the repo has no Effect dependencies, **When** setup is complete, **Then** `effect` and `@effect/platform-bun` are installed at root
2. **Given** `tsconfig.base.json`, **When** setup is complete, **Then** it includes `@effect/language-service` plugin and recommended settings (`noUnusedLocals`, `noImplicitOverride`)
3. **Given** no `prepare` script, **When** setup is complete, **Then** `"prepare": "effect-language-service patch"` exists in root `package.json`
4. **Given** the `.vscode` directory doesn't exist, **When** setup is complete, **Then** `.vscode/settings.json` exists with `typescript.tsdk` pointing to workspace TypeScript
5. **Given** `AGENTS.md` exists, **When** setup is complete, **Then** it includes `effect-solutions` best practices block

## 3. Edge Cases

- **Kysely errors**: `Effect.tryPromise` wrapping must catch all Kysely/SQLite errors and map unique constraint violations to `ConflictError`, not `InternalError`
- **Schema decode failures on API input**: `HttpApiEndpoint` automatically returns 400 via `BadRequest` — verify this covers all current validation (status, issue_type, priority, etc.)
- **Empty/null fields**: `Issue.resolution` is `Resolution | ''` — Schema must handle the empty-string case without breaking decode
- **`board = '_'` wildcard**: Several routes use `_` as a wildcard board param (e.g., `GET /boards/_/issues/:id`). The HttpApi path params must allow this
- **Concurrent database access**: SQLite WAL mode + `PRAGMA busy_timeout = 5000` must survive the Layer wrapping — verify existing concurrency tests pass
- **Graceful shutdown**: `addFinalizer` must close the Kysely connection and stop the HTTP server on SIGINT/SIGTERM
- **`--json` flag idempotency**: CLI JSON output format `{ "ok": true, "data": ... }` and `{ "ok": false, "error": { "code", "message" } }` must be preserved exactly
- **Labels stored as JSON array**: Issues store `labels` as a JSON string column but expose `string[]` — Schema must handle this serialization boundary

## 4. Success Metrics

- **SC-001**: All existing tests pass after migration (0 regressions)
- **SC-002**: CLI `bd --help` output is identical to current (modulo minor formatting from Effect CLI)
- **SC-003**: HTTP API is wire-compatible — same paths, same request/response JSON shapes
- **SC-004**: `tsc --noEmit` passes with zero errors (Effect language service enabled)
- **SC-005**: No `any` casts in migrated code (except Kysely internals in `sqlite.ts`)
- **SC-006**: All store methods have typed errors in the `E` channel — no `Effect<A, never>` for methods that can fail

## 5. Technical Context

```
Language/Version:    TypeScript 5.8+ with Effect v4 (beta)
Primary Dependencies:
  - effect (core, Schema, ServiceMap, Layer)
  - effect/unstable/cli (CLI framework)
  - effect/unstable/httpapi (HttpApi, HttpApiBuilder, HttpApiClient)
  - @effect/platform-bun (BunRuntime, BunServices)
  - @effect/vitest (test runner)
  - @effect/language-service (editor + build diagnostics)
  - kysely ^0.27.6 (SQL query builder — retained)
Storage:            SQLite via bun:sqlite + Kysely
Platform:           Bun >=1.0.0
Package Manager:    bun
Performance Goals:  No regression from current (SQLite is the bottleneck, not the framework)
Constraints:        Effect v4 is beta — pin version; Kysely stays at ^0.27.6
```

## 6. Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        boards-core                          │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │   schemas/   │  │   errors/    │  │   api.ts          │  │
│  │ Board.ts     │  │ NotFound     │  │ BoardsApi         │  │
│  │ Issue.ts     │  │ Conflict     │  │  .add(boards)     │  │
│  │ Comment.ts   │  │ InvalidReq   │  │  .add(issues)     │  │
│  │ ...          │  │ ...          │  │  .add(deps)       │  │
│  └──────┬───────┘  └──────┬───────┘  │  ...              │  │
│         │                 │          └─────────┬─────────┘  │
│         ▼                 ▼                    │            │
│  ┌──────────────────────────────┐              │            │
│  │  BoardsStore (Service)       │◄─────────────┘            │
│  │  .createBoard()  → Effect   │                            │
│  │  .listIssues()   → Effect   │                            │
│  │  .closeIssue()   → Effect   │                            │
│  └──────────┬───────────────────┘                            │
│             │                                               │
│  ┌──────────▼───────────────────┐                            │
│  │  SqliteBoardsStore (Layer)   │                            │
│  │  Kysely<Database> internals  │                            │
│  └──────────────────────────────┘                            │
└──────────┬──────────────┬────────────────┬──────────────────┘
           │              │                │
   ┌───────▼───────┐  ┌──▼─────────┐  ┌───▼──────────────┐
   │ boards-server  │  │ boards-cli │  │ boards-client    │
   │                │  │            │  │                  │
   │ HttpApiBuilder │  │ Command    │  │ HttpApiClient    │
   │ .group(Api,    │  │ .make("bd")│  │ .make(BoardsApi) │
   │  "boards",…)  │  │            │  │                  │
   │                │  │ provides:  │  │ → HttpBoardsStore│
   │ BunRuntime     │  │ SqliteLayer│  │   (Layer)        │
   │ .runMain       │  │ or         │  │                  │
   │                │  │ HttpLayer  │  │                  │
   └────────────────┘  └────────────┘  └──────────────────┘
```

### Repository Structure

```
packages/
├── boards-core/
│   ├── src/
│   │   ├── index.ts              # Public exports
│   │   ├── schemas/              # Schema.Class definitions
│   │   │   ├── Board.ts          # Board, BoardWithCounts
│   │   │   ├── Issue.ts          # Issue, IssueDetail, CreateIssueInput, ...
│   │   │   ├── Comment.ts        # Comment
│   │   │   ├── Dependency.ts     # DependencyWithIssue, AddDependencyInput
│   │   │   ├── common.ts         # Status, IssueType, DependencyType, Resolution, Priority
│   │   │   └── Metadata.ts       # Metadata
│   │   ├── errors.ts             # Schema.TaggedErrorClass definitions
│   │   ├── BoardsStore.ts        # ServiceMap.Service definition
│   │   ├── SqliteBoardsStore.ts  # Layer.effect implementation (Kysely)
│   │   ├── api.ts                # HttpApi + HttpApiGroup + HttpApiEndpoint
│   │   ├── schema.ts             # Kysely Database types (unchanged)
│   │   ├── sqlite.ts             # BunSqliteDialect + openDatabase Layer
│   │   ├── migrate.ts            # Migration logic (wrapped in Effect)
│   │   └── id.ts                 # generateId (unchanged)
│   └── test/
│       ├── helpers.ts            # Test layer setup
│       └── *.test.ts             # @effect/vitest tests
├── boards-server/
│   ├── src/
│   │   ├── index.ts
│   │   ├── handlers/             # HttpApiBuilder.group implementations
│   │   │   ├── boards.ts
│   │   │   ├── issues.ts
│   │   │   ├── deps.ts
│   │   │   ├── labels.ts
│   │   │   ├── ready.ts
│   │   │   ├── claim.ts
│   │   │   ├── comments.ts
│   │   │   ├── epics.ts
│   │   │   └── metadata.ts
│   │   ├── server.ts             # Layer composition + BunRuntime.runMain
│   │   └── live.ts               # Full app Layer (SqliteLayer + all handlers)
│   └── test/
│       └── *.test.ts             # @effect/vitest with HttpApiClient
├── boards-cli/
│   ├── bin/bd.ts                 # Command.run + BunRuntime.runMain
│   ├── src/
│   │   ├── index.ts              # Root Command.make("bd")
│   │   ├── commands/             # One file per subcommand
│   │   │   ├── create.ts
│   │   │   ├── list.ts
│   │   │   ├── show.ts
│   │   │   └── ...
│   │   ├── format.ts             # Output formatting (kept)
│   │   ├── config.ts             # Config resolution (wrapped in Effect.Config)
│   │   └── layers.ts             # SqliteLayer vs HttpLayer wiring
│   └── test/
├── boards-client/
│   ├── src/
│   │   ├── index.ts
│   │   └── HttpBoardsStore.ts    # BoardsStore.HttpLayer via HttpApiClient
│   └── test/
└── boards-tui/                   # UNCHANGED — out of scope
```

### Data Flow

1. **CLI local mode**: `bd create "Fix bug"` → Effect CLI parses args → `BoardsStore.createIssue` effect → provided by `SqliteLayer` → Kysely INSERT → SQLite
2. **CLI remote mode**: `bd --server http://localhost:3000 create "Fix bug"` → same Effect → provided by `HttpLayer` → `HttpApiClient.make(BoardsApi)` → HTTP POST → server
3. **Server**: HTTP request → `HttpApiBuilder` decodes params/query/body via Schema → calls `BoardsStore` effect → `SqliteLayer` → Kysely → SQLite → Schema-encoded response
4. **Error flow**: Store method yields `NotFoundError` → server's HttpApi maps it to 404 with `{ error: { code: "not_found", message: "..." } }` JSON body

## 7. Design Decisions (ADR-Style)

### 1. One TaggedError per ErrorCode (not a single union)

```typescript
class NotFoundError extends Schema.TaggedErrorClass("NotFoundError")(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String }
) {}

class ConflictError extends Schema.TaggedErrorClass("ConflictError")(
  "ConflictError",
  { message: Schema.String }
) {}
```

**Why?**
- Effect's `catchTag` works on individual tags — separate classes enable granular recovery
- Each error can carry context-specific fields (not just `code` + `message`)
- HTTP status mapping is declarative via `HttpApiSchema.withStatus(404)` on each class

**Trade-off**: More boilerplate than a single `BoardsError` class. Worth it for type-safety in the `E` channel.

### 2. HttpApi contract lives in boards-core

```typescript
// boards-core/src/api.ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export class BoardsApi extends HttpApi.make("boards-api")
  .add(BoardsGroup, IssuesGroup, DepsGroup, LabelsGroup, ...)
  .prefix("/api/v1") {}
```

**Why?**
- The API contract is just schemas — no server/client runtime dependency
- Both `boards-server` (HttpApiBuilder) and `boards-client` (HttpApiClient) import from core
- Avoids a `boards-api` package for ~200 lines of declarations
- Core already owns all domain types the API refers to

**Trade-off**: Core gains HTTP-awareness at the type level, but no HTTP runtime code.

### 3. Kysely stays unwrapped (no @effect/sql-kysely)

```typescript
const createBoard = Effect.fn("BoardsStore.createBoard")(
  function* (input: typeof CreateBoardInput.Type) {
    return yield* Effect.tryPromise({
      try: () => db.insertInto("boards").values({...}).returningAll().executeTakeFirstOrThrow(),
      catch: (e) => isUniqueViolation(e)
        ? new ConflictError({ message: `Board "${input.name}" already exists` })
        : new InternalError({ cause: e })
    })
  }
)
```

**Why?**
- `@effect/sql-kysely` warns about Kysely internal dependencies — fragile
- The wrapping is trivial: `Effect.tryPromise` at each call site
- Kysely's type-safe query builder is the value — we keep that
- ~20 store methods to wrap, not hundreds

**Trade-off**: Manual `Effect.tryPromise` wrapping at each Kysely call. Acceptable for the codebase size.

### 4. Database Layer owns lifecycle

```typescript
const SqliteLayer = Layer.scoped(
  BoardsStore,
  Effect.gen(function* () {
    const config = yield* BoardsConfig
    const raw = new BunDatabase(config.dbPath)
    raw.run("PRAGMA busy_timeout = 5000")
    raw.run("PRAGMA journal_mode = WAL")
    raw.run("PRAGMA foreign_keys = ON")
    const db = new Kysely<Database>({ dialect: new BunSqliteDialect(raw) })

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => db.destroy())
    )

    yield* Effect.tryPromise({ try: () => migrate(db), catch: (e) => new InternalError({ cause: e }) })

    return { /* store methods */ }
  })
)
```

**Why?**
- PRAGMA setup, migration, and cleanup belong together
- `addFinalizer` guarantees cleanup on shutdown (replaces manual SIGINT/SIGTERM handlers)
- The Layer is the natural lifecycle boundary in Effect

**Trade-off**: Database is opened eagerly at Layer construction time. Fine for a CLI/server — not a long-lived connection pool.

### 5. CLI wires SqliteLayer or HttpLayer based on --server flag

```typescript
const mainLayer = serverUrl
  ? BoardsStore.httpLayer(serverUrl)
  : BoardsStore.sqliteLayer(dbPath)
```

**Why?**
- Exactly mirrors current `resolveStore()` logic
- Same `BoardsStore` service contract — commands don't know which transport they're using
- `httpLayer` is a thin wrapper around `HttpApiClient.make(BoardsApi)`

**Trade-off**: Two Layer implementations to maintain. Already the case today with `BoardsStore` + `RemoteBoardsStore`.

### 6. Error-to-HTTP mapping via Schema annotations

```typescript
class NotFoundError extends Schema.TaggedErrorClass("NotFoundError")(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String }
) {}

// In the endpoint definition:
HttpApiEndpoint.get("showIssue", "/boards/:board/issues/:id", { params: { board: Schema.String, id: Schema.String } })
  .addSuccess(IssueDetail)
  .addError(NotFoundError, { status: 404 })
  .addError(InvalidRequestError, { status: 400 })
```

**Why?**
- Declarative — no error handler function to maintain
- The mapping is co-located with the endpoint definition
- HttpApiBuilder automatically catches tagged errors and returns the right status
- OpenAPI spec gets error schemas for free

**Trade-off**: Error responses must conform to the Schema shape. We need to ensure the `{ error: { code, message } }` format is preserved.

### 7. Preserve JSON wire format via Schema encoding

```typescript
class NotFoundError extends Schema.TaggedErrorClass("NotFoundError")(
  "NotFoundError",
  { resource: Schema.String, id: Schema.String }
) {
  get code() { return "not_found" as const }
}
```

The JSON response shape `{ error: { code, message } }` will be maintained through Schema encoding annotations or a custom error response wrapper, ensuring wire compatibility with existing clients.

**Why?**
- Existing consumers (boards-client, boards skill) depend on this shape
- Backward compatibility is a non-goal to *break*, even during a big-bang migration

**Trade-off**: May need a custom `HttpApiMiddleware` or Schema transform to wrap errors in the `{ error: { ... } }` envelope.

## 8. Contracts/APIs

### BoardsStore Service

```typescript
import { Effect, Schema, ServiceMap } from "effect"

class BoardsStore extends ServiceMap.Service<
  BoardsStore,
  {
    // Boards
    readonly createBoard: (input: typeof CreateBoardInput.Type) => Effect.Effect<Board, ConflictError | InvalidRequestError>
    readonly listBoards: () => Effect.Effect<ReadonlyArray<BoardWithCounts>>
    readonly deleteBoard: (name: string) => Effect.Effect<void, NotFoundError>

    // Issues
    readonly createIssue: (input: typeof CreateIssueInput.Type) => Effect.Effect<Issue, NotFoundError | InvalidRequestError>
    readonly showIssue: (id: string) => Effect.Effect<IssueDetail, NotFoundError>
    readonly listIssues: (board: string, filter?: typeof ListIssuesFilter.Type) => Effect.Effect<ReadonlyArray<Issue>>
    readonly updateIssue: (id: string, input: typeof UpdateIssueInput.Type) => Effect.Effect<Issue, NotFoundError | InvalidRequestError>
    readonly closeIssue: (id: string, reason?: string, resolution?: Resolution) => Effect.Effect<Issue, NotFoundError | InvalidTransitionError>
    readonly deleteIssue: (id: string) => Effect.Effect<void, NotFoundError>
    readonly createIssueWithParent: (input: typeof CreateIssueInput.Type, parentId: string) => Effect.Effect<Issue, NotFoundError | InvalidRequestError>
    readonly deleteIssues: (ids: ReadonlyArray<string>) => Effect.Effect<DeleteResult>
    readonly reopenIssue: (id: string, status?: "open" | "in_progress") => Effect.Effect<Issue, NotFoundError | InvalidTransitionError>

    // Comments
    readonly addComment: (issueId: string, author: string, text: string) => Effect.Effect<Comment, NotFoundError>
    readonly listComments: (issueId: string) => Effect.Effect<ReadonlyArray<Comment>>
    readonly deleteComment: (commentId: number) => Effect.Effect<void, NotFoundError>

    // Dependencies
    readonly addDependency: (input: typeof AddDependencyInput.Type) => Effect.Effect<void, NotFoundError | SelfDependencyError | CircularDependencyError | CrossBoardError>
    readonly removeDependency: (issueId: string, dependsOnId: string) => Effect.Effect<void, NotFoundError>
    readonly listDependencies: (issueId: string, direction: "up" | "down", type?: DependencyType) => Effect.Effect<ReadonlyArray<DependencyWithIssue>>

    // Labels
    readonly addLabel: (issueId: string, label: string) => Effect.Effect<void, NotFoundError>
    readonly removeLabel: (issueId: string, label: string) => Effect.Effect<void, NotFoundError>

    // Epics
    readonly epicStatus: (board: string) => Effect.Effect<ReadonlyArray<EpicStatus>>

    // Ready Work + Claim
    readonly readyWork: (board: string, filter?: typeof ReadyWorkFilter.Type) => Effect.Effect<ReadonlyArray<Issue>>
    readonly claimIssue: (id: string, assignee: string) => Effect.Effect<Issue, NotFoundError | InvalidTransitionError>

    // Search
    readonly searchIssues: (board: string, query: string) => Effect.Effect<ReadonlyArray<Issue>>

    // Metadata
    readonly getMetadata: () => Effect.Effect<Metadata>
  }
>()("@boards/BoardsStore") {
  static readonly SqliteLayer: Layer.Layer<BoardsStore, never, BoardsConfig>
  static readonly HttpLayer: (baseUrl: string) => Layer.Layer<BoardsStore>
  static readonly TestLayer: Layer.Layer<BoardsStore>
}
```

### HttpApi Contract

```typescript
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

// Groups
const BoardsGroup = HttpApiGroup.make("boards").add(
  HttpApiEndpoint.post("createBoard", "/boards")
    .addPayload(CreateBoardInput)
    .addSuccess(Board, { status: 201 })
    .addError(ConflictError, { status: 409 }),
  HttpApiEndpoint.get("listBoards", "/boards")
    .addSuccess(Schema.Array(BoardWithCounts)),
  HttpApiEndpoint.del("deleteBoard", "/boards/:name", { params: { name: Schema.String } })
    .addError(NotFoundError, { status: 404 })
)

const IssuesGroup = HttpApiGroup.make("issues").add(
  HttpApiEndpoint.post("createIssue", "/boards/:board/issues", { params: { board: Schema.String } })
    .addPayload(CreateIssuePayload)
    .addSuccess(Issue, { status: 201 })
    .addError(NotFoundError, { status: 404 }),
  HttpApiEndpoint.get("listIssues", "/boards/:board/issues", {
    params: { board: Schema.String },
    query: { status: Schema.optional(Status), priority: Schema.optional(Schema.NumberFromString), /* ... */ }
  }).addSuccess(Schema.Array(Issue)),
  // ... remaining endpoints
)

export class BoardsApi extends HttpApi.make("boards-api")
  .add(BoardsGroup, IssuesGroup, DepsGroup, LabelsGroup, ReadyGroup, ClaimGroup, CommentsGroup, EpicsGroup, MetadataGroup)
  .prefix("/api/v1") {}
```

### Error Types

```typescript
class NotFoundError extends Schema.TaggedErrorClass("NotFoundError")("NotFoundError", {
  resource: Schema.String,
  id: Schema.String,
}) {}

class ConflictError extends Schema.TaggedErrorClass("ConflictError")("ConflictError", {
  message: Schema.String,
}) {}

class InvalidRequestError extends Schema.TaggedErrorClass("InvalidRequestError")("InvalidRequestError", {
  message: Schema.String,
}) {}

class InvalidTransitionError extends Schema.TaggedErrorClass("InvalidTransitionError")("InvalidTransitionError", {
  message: Schema.String,
}) {}

class SelfDependencyError extends Schema.TaggedErrorClass("SelfDependencyError")("SelfDependencyError", {
  issueId: Schema.String,
}) {}

class CircularDependencyError extends Schema.TaggedErrorClass("CircularDependencyError")("CircularDependencyError", {
  issueId: Schema.String,
  dependsOnId: Schema.String,
}) {}

class CrossBoardError extends Schema.TaggedErrorClass("CrossBoardError")("CrossBoardError", {
  message: Schema.String,
}) {}

class InternalError extends Schema.TaggedErrorClass("InternalError")("InternalError", {
  cause: Schema.Defect,
}) {}
```

## 9. Error Handling Strategy

**Error taxonomy**:
| Category | Effect pattern | Examples |
|----------|---------------|----------|
| Domain errors | `Schema.TaggedErrorClass` in `E` channel | `NotFoundError`, `ConflictError`, `InvalidTransitionError` |
| Validation errors | Automatic via Schema decode (HttpApi returns 400) | Malformed status, invalid priority |
| Infrastructure errors | `Effect.tryPromise` catch → `InternalError` | SQLite failures, network errors |
| Defects | `Effect.die` / uncaught | Bugs, invariant violations |

**Propagation rules**:
- Store methods declare specific errors in `E` — callers see exactly what can fail
- `Effect.tryPromise` wraps all Kysely calls — SQLite errors become `InternalError` or specific domain errors (e.g., unique violation → `ConflictError`)
- HttpApi maps each `TaggedError` to an HTTP status via `addError(ErrorClass, { status })` 
- CLI catches tagged errors via `Effect.catchTags` for user-facing messages
- Unhandled errors (defects) crash with a stack trace — Effect's default behavior

**Idempotency preservation**:
- Closing an already-closed issue is still a no-op (not an error)
- Adding a label that already exists is still a no-op
- These behaviors are preserved in the store layer, not changed by Effect

## 10. Complexity Governance

| Complexity | Why Needed | Simpler Alternative Rejected Because |
|------------|------------|--------------------------------------|
| `ServiceMap.Service` for `BoardsStore` | Type-safe DI across CLI, server, client with swappable layers (SQLite vs HTTP) | Manual constructor injection doesn't give typed error channels or automatic lifecycle management |
| `HttpApi` contract in core | Single source of truth for server + client types, automatic 400 validation, OpenAPI generation | Separate server/client type definitions would drift |
| `Schema.TaggedErrorClass` per error code | Type-tracked errors in `E` channel enable `catchTag` and declarative HTTP status mapping | Single `BoardsError` class loses type information in the Effect channel |
| `@effect/vitest` for tests | `it.effect` handles Effect lifecycle; test layers compose naturally | `bun:test` + `Effect.runPromise` in every test is verbose and error-prone |

No other complexity violations identified. Kysely, SQLite, and file structure remain simple.

## 11. Extension Points

**Adding a new store method**:
1. Add the method signature to `BoardsStore` service definition
2. Implement in `SqliteBoardsStore` layer (Kysely query wrapped in Effect)
3. Add `HttpApiEndpoint` to the relevant group in `api.ts`
4. Add handler in `boards-server/src/handlers/`
5. `HttpLayer` gets the method automatically via `HttpApiClient`

**Adding a new CLI command**:
```typescript
const myCommand = Command.make("my-command", { arg: Argument.string("name") }, ({ arg }) =>
  Effect.gen(function* () {
    const store = yield* BoardsStore
    // ... use store
  })
)
// Add to root: Command.withSubcommands([..., myCommand])
```

**Adding a new error type**:
1. Define `Schema.TaggedErrorClass` in `errors.ts`
2. Add to relevant store method signatures
3. Add `.addError(NewError, { status: 4xx })` to relevant HttpApi endpoints
4. Handle in CLI via `Effect.catchTag("NewError", ...)`

**Swapping the database**:
Create a new `Layer` (e.g., `PostgresBoardsStore`) that implements the same `BoardsStore` service. No other code changes needed.

## 12. Future Considerations

- **Effect v4 stabilization**: Currently beta — pin version, upgrade when stable. API may change for `effect/unstable/*` imports
- **OpenAPI generation**: `HttpApiBuilder.layer(api, { openapiPath: "/openapi" })` is available — can expose Swagger/Scalar UI
- **Streaming**: Effect supports `Stream` for large result sets — could stream `listIssues` for huge boards
- **Observability**: Effect's built-in tracing (`Effect.fn` provides call-site traces) — can connect to OpenTelemetry later
- **boards-tui migration**: Could eventually use Effect for data fetching while keeping Ink for rendering, but this is a separate effort
- **WebSocket/real-time**: Effect has `Socket` support — could add real-time issue updates later
- **@effect/sql-kysely**: If it stabilizes and removes the Kysely-internals disclaimer, consider adopting for cleaner query wrapping
