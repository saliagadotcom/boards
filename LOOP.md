# Effect Migration Loop

- Load the following skills: boards, effect-core-patterns, effect-dependency-injection, effect-error-handling, effect-schema, effect-testing, effect-resource-management, self-documenting-code, code-reviewer, typescript-best-practices
- Don't guess about Effect patterns — run `effect-solutions show <topic>` and search ~/.local/share/effect-solutions/effect for real implementations before writing Effect code. Use context7 for Kysely questions.
- Reference SPEC-effect-migration.md for architecture decisions, contracts, and error types before implementing any issue.
- Prior to committing any code, use code-reviewer skill to review. Ensure `bun tsc --noEmit` passes and all tests pass (`bun vitest run`).
- Feel free to use subagents to parallelize independent work (e.g., separate HttpApiGroup handlers, separate CLI commands).
- All work happens on the `effect` branch. Commit with `git commit` — do not use `gt create` or stacked diffs.
- Stop working after committing — do not continue to the next phase. Close parent epics if all child issues are complete (`bd epic close-eligible`).
- Run `bd ready --board effectbd` and start tasks (always compare task to SPEC-effect-migration.md and current implementation). IF THERE ARE NO TASKS YOU ARE DONE!
