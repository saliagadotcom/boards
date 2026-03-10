# Default recipe shows available commands
[private]
default:
    @just --list --unsorted

# Build the bd CLI binary
build:
    cd packages/boards-cli && bun run build

# Build and install bd to ~/.local/bin
install: build
    install -d ~/.local/bin
    install -m 755 dist/bd ~/.local/bin/bd
    @echo "Installed bd to ~/.local/bin/bd"

# Run all tests (excludes benchmarks)
test:
    bun test --test-name-pattern '(?!benchmarks)'

# Run performance benchmarks
bench:
    bun test packages/boards-core/test/benchmarks.test.ts

# --- Publishing ---

# Bump all packages to the same version (level: patch, minor, major)
bump level="patch":
    #!/usr/bin/env bash
    set -euo pipefail
    for pkg in packages/*/package.json; do
        (cd "$(dirname "$pkg")" && npm version {{level}} --no-git-tag-version)
    done
    version=$(jq -r .version packages/boards-core/package.json)
    echo "Bumped all packages to $version"

# Tag current version and push to trigger CI release
release:
    #!/usr/bin/env bash
    set -euo pipefail
    version=$(jq -r .version packages/boards-core/package.json)
    tag="v$version"
    if git rev-parse "$tag" >/dev/null 2>&1; then
        echo "Error: tag $tag already exists" >&2
        exit 1
    fi
    git tag "$tag"
    git push origin "$tag"
    echo "Pushed $tag — CI will handle npm publish + GitHub release"
