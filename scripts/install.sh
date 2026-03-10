#!/usr/bin/env bash
#
# Boards (bd) Install Script
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/saliagadotcom/boards/main/scripts/install.sh | bash
#
# Environment Variables:
#   INSTALL_DIR - Installation directory (default: auto-detected)
#   VERSION     - Specific version to install (default: latest)
#
# ⚠️ IMPORTANT: This script must be EXECUTED, never SOURCED
# ❌ WRONG: source install.sh (will exit your shell on errors)
# ✅ CORRECT: bash install.sh
# ✅ CORRECT: curl -fsSL ... | bash
#

set -e

# Configuration
OWNER="saliagadotcom"
REPO="boards"
BINARY="bd"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}==>${NC} $1"
}

log_success() {
    echo -e "${GREEN}==>${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}==>${NC} $1"
}

log_error() {
    echo -e "${RED}Error:${NC} $1" >&2
}

# Download a file using curl or wget
download_file() {
    local url=$1
    local output_path=$2

    if command -v curl &> /dev/null; then
        curl -fsSL -o "$output_path" "$url"
        return $?
    fi

    if command -v wget &> /dev/null; then
        wget -q -O "$output_path" "$url"
        return $?
    fi

    log_error "Neither curl nor wget found. Please install one of them."
    return 1
}

# Fetch a URL to stdout using curl or wget
fetch_url() {
    local url=$1

    if command -v curl &> /dev/null; then
        curl -fsSL "$url"
        return $?
    fi

    if command -v wget &> /dev/null; then
        wget -qO- "$url"
        return $?
    fi

    log_error "Neither curl nor wget found. Please install one of them."
    return 1
}

# Check if a release has a specific asset
release_has_asset() {
    local release_json=$1
    local asset_name=$2

    if echo "$release_json" | grep -Fq "\"name\": \"$asset_name\""; then
        return 0
    fi

    return 1
}

# Compute SHA256 of a file (supports multiple tools)
sha256_file() {
    local file_path=$1

    if command -v sha256sum &> /dev/null; then
        sha256sum "$file_path" | awk '{print $1}'
        return 0
    fi

    if command -v shasum &> /dev/null; then
        shasum -a 256 "$file_path" | awk '{print $1}'
        return 0
    fi

    if command -v openssl &> /dev/null; then
        openssl dgst -sha256 "$file_path" | awk '{print $2}'
        return 0
    fi

    return 1
}

# Verify SHA256 checksum against release checksums.txt
verify_release_checksum() {
    local release_json=$1
    local version=$2
    local archive_name=$3
    local archive_path=$4

    local checksums_name="checksums.txt"
    local checksums_url="https://github.com/$OWNER/$REPO/releases/download/${version}/${checksums_name}"

    if ! release_has_asset "$release_json" "$checksums_name"; then
        log_error "Release metadata is missing ${checksums_name}; refusing to install unverified binary"
        return 1
    fi

    if ! download_file "$checksums_url" "$checksums_name"; then
        log_error "Failed to download ${checksums_name}; refusing to install unverified binary"
        return 1
    fi

    local expected
    expected=$(awk -v target="$archive_name" '{name=$2; sub(/^\*/, "", name); if (name == target) {print $1; exit}}' "$checksums_name")
    if [ -z "$expected" ]; then
        log_error "No checksum entry found for ${archive_name} in ${checksums_name}"
        return 1
    fi

    local actual
    actual=$(sha256_file "$archive_path") || {
        log_error "No SHA256 tool found (need one of: sha256sum, shasum, openssl)"
        return 1
    }

    if [ "$expected" != "$actual" ]; then
        log_error "Checksum mismatch for ${archive_name}; refusing to install"
        return 1
    fi

    log_success "Checksum verified for ${archive_name}"
    return 0
}

# Re-sign binary for macOS only when explicitly requested
resign_for_macos() {
    local binary_path=$1

    if [[ "$(uname -s)" != "Darwin" ]]; then
        return 0
    fi

    if [ "${BD_INSTALL_RESIGN_MACOS:-0}" != "1" ]; then
        log_info "Skipping macOS ad-hoc re-signing (default)"
        log_info "Set BD_INSTALL_RESIGN_MACOS=1 to opt in"
        return 0
    fi

    if ! command -v codesign &> /dev/null; then
        log_warning "codesign not found, skipping re-signing"
        return 0
    fi

    log_warning "Opt-in macOS re-sign enabled: replacing release signature with local ad-hoc signature"
    codesign --remove-signature "$binary_path" 2>/dev/null || true
    if codesign --force --sign - "$binary_path"; then
        log_success "Binary re-signed for this machine"
    else
        log_warning "Failed to re-sign binary (non-fatal)"
    fi
}

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Darwin)
            os="darwin"
            ;;
        Linux)
            os="linux"
            ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            exit 1
            ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)
            arch="amd64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $(uname -m)"
            exit 1
            ;;
    esac

    echo "${os}_${arch}"
}

# Determine install directory
determine_install_dir() {
    if [ -n "$INSTALL_DIR" ]; then
        echo "$INSTALL_DIR"
    elif [[ -w /usr/local/bin ]]; then
        echo "/usr/local/bin"
    else
        echo "$HOME/.local/bin"
    fi
}

# Returns paths to all 'bd' executables found in PATH
get_bd_paths_in_path() {
    local IFS=':'
    local -a entries
    read -ra entries <<< "$PATH"
    local -a found
    local p
    for p in "${entries[@]}"; do
        [ -z "$p" ] && continue
        if [ -x "$p/$BINARY" ]; then
            local resolved
            if command -v readlink >/dev/null 2>&1; then
                resolved=$(readlink -f "$p/$BINARY" 2>/dev/null || printf '%s' "$p/$BINARY")
            else
                resolved="$p/$BINARY"
            fi
            local skip=0
            for existing in "${found[@]:-}"; do
                if [ "$existing" = "$resolved" ]; then skip=1; break; fi
            done
            if [ $skip -eq 0 ]; then
                found+=("$resolved")
            fi
        fi
    done
    for item in "${found[@]:-}"; do
        printf '%s\n' "$item"
    done
}

# Warn if multiple bd binaries exist on PATH
warn_if_multiple_bd() {
    local install_path=$1
    local bd_paths=()
    while IFS= read -r line; do
        [ -n "$line" ] && bd_paths+=("$line")
    done < <(get_bd_paths_in_path)

    if [ "${#bd_paths[@]}" -le 1 ]; then
        return 0
    fi

    log_warning "Multiple '$BINARY' executables found on your PATH."
    echo "  Found the following (entries earlier in PATH take precedence):"
    local i=1
    for p in "${bd_paths[@]}"; do
        local ver
        if [ -x "$p" ]; then
            ver=$("$p" --version 2>/dev/null || true)
        fi
        if [ -z "$ver" ]; then ver="<unknown version>"; fi
        echo "    $i. $p  -> $ver"
        i=$((i+1))
    done

    if [ -n "$install_path" ]; then
        echo ""
        echo "  We installed to: $install_path"
        local first="${bd_paths[0]}"
        if [ "$first" != "$install_path" ]; then
            log_warning "An older '$BINARY' appears first in your PATH."
            echo "  Either remove $first or reorder your PATH so $(dirname "$install_path") comes first."
        fi
    fi
}

# Download and install from GitHub releases
install_from_release() {
    local platform=$1
    local install_dir=$2

    log_info "Fetching latest release..."
    local release_json version
    release_json=$(fetch_url "https://api.github.com/repos/$OWNER/$REPO/releases/latest") || {
        log_error "Failed to fetch release information"
        return 1
    }

    if [ -n "$VERSION" ]; then
        version="$VERSION"
        log_info "Using specified version: $version"
    else
        version=$(echo "$release_json" | grep '"tag_name"' | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')
        if [ -z "$version" ]; then
            log_error "Failed to determine latest version"
            return 1
        fi
        log_info "Latest version: $version"
    fi

    local version_num="${version#v}"
    local archive_name="${BINARY}_${version_num}_${platform}.tar.gz"
    local download_url="https://github.com/$OWNER/$REPO/releases/download/${version}/${archive_name}"

    if ! release_has_asset "$release_json" "$archive_name"; then
        log_error "No prebuilt binary available for platform ${platform}"
        return 1
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d)
    trap "rm -rf $tmp_dir" EXIT
    cd "$tmp_dir"

    log_info "Downloading $archive_name..."
    if ! download_file "$download_url" "$archive_name"; then
        log_error "Download failed"
        return 1
    fi

    log_info "Verifying release checksum..."
    if ! verify_release_checksum "$release_json" "$version" "$archive_name" "$archive_name"; then
        return 1
    fi

    log_info "Extracting archive..."
    if ! tar -xzf "$archive_name"; then
        log_error "Failed to extract archive. The download may be corrupted."
        return 1
    fi

    if [ ! -f "$BINARY" ]; then
        log_error "Binary not found in archive."
        return 1
    fi

    # Create install directory if needed
    log_info "Installing to $install_dir..."
    if [ ! -d "$install_dir" ]; then
        if ! mkdir -p "$install_dir" 2>/dev/null; then
            log_warning "Cannot create $install_dir. Trying with sudo..."
            sudo mkdir -p "$install_dir"
        fi
    fi

    # Move binary
    if [[ -w "$install_dir" ]]; then
        mv "$BINARY" "$install_dir/"
    else
        log_warning "Cannot write to $install_dir. Trying with sudo..."
        sudo mv "$BINARY" "$install_dir/"
    fi

    chmod +x "$install_dir/$BINARY" 2>/dev/null || sudo chmod +x "$install_dir/$BINARY"

    # Optional macOS re-signing
    resign_for_macos "$install_dir/$BINARY"

    cd - > /dev/null || cd "$HOME"
    return 0
}

# Verify installation and print getting-started info
verify_installation() {
    local install_dir=$1

    warn_if_multiple_bd "$install_dir/$BINARY" || true

    if command -v "$BINARY" &> /dev/null; then
        local installed_version
        installed_version=$("$BINARY" --version 2>/dev/null | head -1)
        log_success "Successfully installed: $installed_version"
    elif [ -x "$install_dir/$BINARY" ]; then
        local installed_version
        installed_version=$("$install_dir/$BINARY" --version 2>/dev/null | head -1)
        log_success "Successfully installed: $installed_version"

        if [[ ":$PATH:" != *":$install_dir:"* ]]; then
            echo ""
            log_warning "$install_dir is not in your PATH"
            echo ""
            echo "  Add the following to your shell profile (~/.bashrc, ~/.zshrc, or ~/.profile):"
            echo ""
            echo "    export PATH=\"$install_dir:\$PATH\""
            echo ""
            echo "  Then reload your shell or run:"
            echo ""
            echo "    source ~/.profile  # or ~/.bashrc, ~/.zshrc"
            echo ""
        fi
    else
        log_error "Installation verification failed."
        exit 1
    fi

    echo ""
    echo "  Get started:"
    echo "    cd your-project"
    echo "    bd init"
    echo ""
}

main() {
    echo ""
    echo "📋 Boards (bd) Installer"
    echo ""

    log_info "Detecting platform..."
    local platform install_dir
    platform=$(detect_platform)
    install_dir=$(determine_install_dir)
    log_info "Platform: $platform"

    install_from_release "$platform" "$install_dir"

    verify_installation "$install_dir"

    log_success "Installation complete!"
    echo ""
}

main "$@"
