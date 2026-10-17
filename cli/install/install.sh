#!/bin/sh
# Hivemind installer (macOS, Linux, Git Bash):
#   curl -fsSL https://hivemind-q17i.onrender.com/install.sh | sh
#
#   1. checks Node.js >= 20 (and npm)
#   2. installs the CLI, `hivemind` and its short alias `hm`, linked to a hivemind checkout so it updates itself
#   3. runs `hivemind init` in the git repo you ran this from (skip with HIVEMIND_NO_INIT=1)
#   4. prints what's left: token, user, `hm c`
#
# Where the CLI comes from (the repo is private for now):
#   HIVEMIND_SRC=<path>        an existing hivemind clone
#   else the hivemind checkout you're standing in (if you are)
#   else ~/.hivemind/src       cloned once with your own git access (HIVEMIND_REPO_URL overrides the URL)
# TODO(npm): publish cli/ as @hivemind-dev/cli ("hivemind-cli" is taken on npm). Then step 2 is just
#   `npm i -g @hivemind-dev/cli` (no clone, no git access) and the checkout logic below becomes the fallback.
#
# Other env: NPM_CONFIG_PREFIX (where npm puts global commands), HIVEMIND_API_URL (passed through to init).
# Safe to re-run: it re-links the CLI and `init` only merges what's missing.
set -eu

REPO_URL=${HIVEMIND_REPO_URL:-https://github.com/michae6345-crypto/hivemind.git}

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  HEX="$(printf '\033[38;5;214m')⬢$(printf '\033[0m')"; DIM="$(printf '\033[2m')"; BOLD="$(printf '\033[1m')"; OFF="$(printf '\033[0m')"
else
  HEX="⬢"; DIM=""; BOLD=""; OFF=""
fi
say() { printf '%s\n' "$HEX Hivemind · $*"; }
step() { printf '  %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die() { printf '%s\n' "$HEX Hivemind · $*" >&2; exit 1; }

# Is $1 a hivemind checkout (has cli/hivemind.mjs and the CLI's package.json)?
is_checkout() { [ -f "$1/cli/hivemind.mjs" ] && grep -q '"name": "hivemind-cli"' "$1/cli/package.json" 2>/dev/null; }

main() {
  say "install"

  # 1. Node >= 20
  command -v node >/dev/null 2>&1 || die "Node.js 20+ is required: https://nodejs.org (or: brew install node, nvm install 20)"
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 20 ] || die "Node.js 20+ is required (you have $(node --version)): https://nodejs.org"
  command -v npm >/dev/null 2>&1 || die "npm is missing; it ships with Node.js: https://nodejs.org"
  step "node $(node --version)"

  # 2. The CLI source
  src=""
  if [ -n "${HIVEMIND_SRC:-}" ]; then
    is_checkout "$HIVEMIND_SRC" || die "HIVEMIND_SRC=$HIVEMIND_SRC is not a hivemind checkout (no cli/hivemind.mjs)"
    src=$HIVEMIND_SRC
  else
    d=$PWD
    while [ -n "$d" ] && [ "$d" != "/" ]; do
      if is_checkout "$d"; then src=$d; break; fi
      d=$(dirname "$d")
    done
  fi
  if [ -z "$src" ]; then
    src="$HOME/.hivemind/src"
    if is_checkout "$src"; then
      step "updating $src"
      git -C "$src" pull --ff-only --quiet </dev/null >/dev/null 2>&1 || warn "couldn't update $src; using it as is"
    else
      command -v git >/dev/null 2>&1 || die "git is required to fetch the CLI: https://git-scm.com"
      step "cloning $REPO_URL"
      mkdir -p "$HOME/.hivemind"
      # No credential prompt can work under curl | sh: rely on your git credential helper / SSH agent / gh auth.
      GIT_TERMINAL_PROMPT=0 git clone --quiet --filter=blob:none "$REPO_URL" "$src" </dev/null ||
        die "couldn't clone $REPO_URL. The repo is private: ask for access (or run gh auth login), or clone it yourself and re-run with HIVEMIND_SRC=<your clone>"
    fi
  fi
  step "cli from $src"

  # npm puts global commands in <prefix>/bin (Git Bash on Windows: <prefix> itself). A root-owned prefix (Linux
  # /usr, Homebrew-less macOS /usr/local) would need sudo: use ~/.local instead, like pip --user.
  prefix=$(npm config get prefix)
  if [ ! -w "$prefix" ] || { [ -d "$prefix/lib" ] && [ ! -w "$prefix/lib" ]; }; then
    prefix="$HOME/.local"
    mkdir -p "$prefix"
    NPM_CONFIG_PREFIX=$prefix
    export NPM_CONFIG_PREFIX
    warn "npm's global folder isn't writable without sudo; installing to $prefix instead"
  fi
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) bindir=$(cygpath -u "$prefix" 2>/dev/null || printf %s "$prefix") ;; # PATH holds /c/… here
    *) bindir=$prefix/bin ;;
  esac

  npm install --global --no-fund --no-audit --loglevel=error "$src/cli" </dev/null >/dev/null ||
    die "npm install -g $src/cli failed (see above)"
  hm_bin="$bindir/hivemind"
  [ -x "$hm_bin" ] || [ -f "$hm_bin.cmd" ] || die "installed, but $hm_bin is missing; check: npm ls -g hivemind-cli"
  version=$(HIVEMIND_NO_UPDATE=1 node "$src/cli/hivemind.mjs" --version)
  step "installed $BOLD$version$OFF as ${BOLD}hivemind$OFF and ${BOLD}hm$OFF ${DIM}($bindir)$OFF"
  on_path=1
  case ":$PATH:" in *":$bindir:"*) ;; *) on_path=0 ;; esac

  # 3. hivemind init in the repo you're in (never in the hivemind checkout itself)
  top=$(git rev-parse --show-toplevel 2>/dev/null || true)
  inited=0
  if [ -n "${HIVEMIND_NO_INIT:-}" ]; then
    step "skipped hivemind init (HIVEMIND_NO_INIT)"
  elif [ -n "$top" ] && ! is_checkout "$top"; then
    printf '\n'
    if node "$src/cli/hivemind.mjs" init </dev/null; then inited=1; else warn "hivemind init failed; run it again in $top once the issue above is fixed"; fi
  fi

  # 4. What's left
  printf '\n%s\n' "$HEX ${BOLD}Hivemind is ready.$OFF"
  n=1
  if [ "$on_path" = 0 ]; then
    step "$n. add it to your PATH:  export PATH=\"$bindir:\$PATH\"   ${DIM}(and put that line in ~/.zshrc or ~/.bashrc)$OFF"; n=$((n + 1))
  fi
  if [ -z "${HIVEMIND_TOKEN:-}" ]; then
    step "$n. export HIVEMIND_TOKEN=<token>   ${DIM}(ask your Hivemind admin)$OFF"; n=$((n + 1))
  fi
  if [ -z "${HIVEMIND_USER:-}" ]; then
    guess=$(git config user.email 2>/dev/null | sed 's/@.*//' || true)
    step "$n. export HIVEMIND_USER=${guess:-<you>}   ${DIM}(your Hivemind handle)$OFF"; n=$((n + 1))
  fi
  if [ "$inited" = 0 ]; then
    step "$n. cd your-repo && hivemind init"; n=$((n + 1))
  fi
  step "$n. ${BOLD}hm c$OFF   ${DIM}Claude Code on the left, Hivemind on the right$OFF"
}

main "$@"
