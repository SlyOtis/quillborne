#!/bin/sh
set -e

BIN="$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin"
GO_VERSION=$(sed -n 's/^go \([0-9.]*\)$/\1/p' go.mod)
SMIG_VERSION=$(sed -n 's/.*samna-migrate\/cmd@\(v[0-9.]*\).*/\1/p' Dockerfile | head -1)
SAUTH_VERSION=$(sed -n 's/.*samna-auth\/cmd\/sauth@\(v[0-9A-Za-z.-]*\).*/\1/p' .github/workflows/azure-deploy.yml | head -1)

has() {
    command -v "$1" > /dev/null 2>&1
}

at_least() {
    [ -n "$1" ] && [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

version() {
    case "$1" in
        go) go version | sed 's/.*go\([0-9.]*\).*/\1/' ;;
        pnpm) pnpm --version ;;
        node) node --version | sed 's/^v//' ;;
        jq) jq --version | sed 's/^jq-//' ;;
        smig) smig --version | awk '{print $NF}' ;;
        sauth) sauth --version | awk '{print $NF}' ;;
        air) air -v 2>&1 | grep -o 'v[0-9.]*' | head -1 ;;
        tygo) tygo --version 2>/dev/null | grep -o "v[0-9.]*" | head -1 ;;
        docker) docker --version | sed 's/.*version \([0-9.]*\).*/\1/' ;;
        az) az version | jq -r '."azure-cli"' ;;
        playwright-cli) brew list --versions playwright-cli 2>/dev/null | awk '{print $2}' ;;
    esac
}

brew_install() {
    if ! has brew; then
        echo "$1 needs installing and Homebrew is not here to do it. Install $1, then run just install again."
        exit 1
    fi
    brew install "$@" || brew upgrade "$@"
}

go_install() {
    GOPRIVATE=github.com/nimling/* go install "$@"
}

ensure() {
    name=$1
    want=$2
    shift 2
    have=""
    if has "$name"; then
        have=$(version "$name" 2>/dev/null || true)
    fi
    if has "$name" && { [ -z "$want" ] || at_least "$have" "$want"; }; then
        echo "$name: found ${have:-}"
        return
    fi
    if has "$name"; then
        echo "$name: $have is below $want, installing $want"
    else
        echo "$name: installing ${want:-latest}"
    fi
    "$@"
    if ! has "$name"; then
        echo "$name: could not be installed"
        exit 1
    fi
}

ensure go "$GO_VERSION" brew_install go
ensure pnpm "" brew_install pnpm
ensure node "" brew_install node
ensure jq "" brew_install jq
ensure docker "" brew_install --cask orbstack
ensure az "" brew_install azure-cli
ensure playwright-cli "" brew_install playwright-cli
ensure air "" go_install github.com/air-verse/air@latest
ensure tygo "" go_install github.com/gzuidhof/tygo@latest
ensure smig "$SMIG_VERSION" sh -c "GOPRIVATE=github.com/nimling/* go install -ldflags '-X github.com/nimling/samna-migrate/pkg/cli.Version=$SMIG_VERSION' github.com/nimling/samna-migrate/cmd@$SMIG_VERSION && mv '$BIN/cmd' '$BIN/smig'"
ensure sauth "$SAUTH_VERSION" go_install "github.com/nimling/samna-auth/cmd/sauth@$SAUTH_VERSION"

case ":$PATH:" in
    *":$BIN:"*) ;;
    *) echo "Add $BIN to PATH so smig, sauth, air and tygo are found." ;;
esac

cd web && pnpm install
cd ..
go mod download
echo "Installed."
