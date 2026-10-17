# Hivemind installer (Windows PowerShell 5.1+ and PowerShell 7):
#   irm https://hivemind-q17i.onrender.com/install.ps1 | iex
#
#   1. checks Node.js >= 20 (and npm)
#   2. installs the CLI, `hivemind` and its short alias `hm`, linked to a hivemind checkout so it updates itself
#   3. runs `hivemind init` in the git repo you ran this from (skip with $env:HIVEMIND_NO_INIT=1)
#   4. prints what's left: token, user, `hm c`
#
# Where the CLI comes from (the repo is private for now):
#   $env:HIVEMIND_SRC = <path>   an existing hivemind clone
#   else the hivemind checkout you're standing in (if you are)
#   else ~\.hivemind\src         cloned once with your own git access ($env:HIVEMIND_REPO_URL overrides the URL)
# TODO(npm): publish cli/ as @hivemind-dev/cli ("hivemind-cli" is taken on npm). Then step 2 is just
#   `npm i -g @hivemind-dev/cli` (no clone, no git access) and the checkout logic below becomes the fallback.
#
# Runs inside your session (irm | iex), so it never calls `exit`: errors print and return. ASCII only, so Windows
# PowerShell 5.1's console shows it right. npm.cmd / hivemind.cmd are called directly: the .ps1 shims npm also
# installs can be blocked by the execution policy. Safe to re-run.
& {
  # Not Stop: in Windows PowerShell 5.1 a native command's stderr (git, npm) would then throw. Every step checks itself.
  $ErrorActionPreference = 'Continue'
  $repoUrl = if ($env:HIVEMIND_REPO_URL) { $env:HIVEMIND_REPO_URL } else { 'https://github.com/michae6345-crypto/hivemind.git' }

  function Say($m) { Write-Host "Hivemind - $m" -ForegroundColor Yellow }
  function Step($m) { Write-Host "  $m" }
  function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
  function Fail($m) { Write-Host "Hivemind - $m" -ForegroundColor Red }
  function Test-Checkout($dir) {
    $pkg = Join-Path $dir 'cli\package.json'
    (Test-Path (Join-Path $dir 'cli\hivemind.mjs')) -and (Test-Path $pkg) -and ((Get-Content $pkg -Raw) -match '"name": "hivemind-cli"')
  }

  Say 'install'

  # 1. Node >= 20
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail 'Node.js 20+ is required: winget install OpenJS.NodeJS.LTS  (or https://nodejs.org), then open a new terminal and re-run'
    return
  }
  $major = [int](& node -p "process.versions.node.split('.')[0]")
  if ($major -lt 20) { Fail "Node.js 20+ is required (you have $(& node --version)): winget upgrade OpenJS.NodeJS.LTS"; return }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { Fail 'npm is missing; it ships with Node.js: https://nodejs.org'; return }
  Step "node $(& node --version)"

  # 2. The CLI source
  $src = $null
  if ($env:HIVEMIND_SRC) {
    if (-not (Test-Checkout $env:HIVEMIND_SRC)) { Fail "HIVEMIND_SRC=$($env:HIVEMIND_SRC) is not a hivemind checkout (no cli\hivemind.mjs)"; return }
    $src = (Resolve-Path $env:HIVEMIND_SRC).Path
  } else {
    $d = (Get-Location).ProviderPath
    while ($d) {
      if (Test-Checkout $d) { $src = $d; break }
      $parent = Split-Path $d -Parent
      if ($parent -eq $d) { break }
      $d = $parent
    }
  }
  if (-not $src) {
    $src = Join-Path $HOME '.hivemind\src'
    if (Test-Checkout $src) {
      Step "updating $src"
      & git -C $src pull --ff-only --quiet 2>$null | Out-Null
      if ($LASTEXITCODE) { Warn "couldn't update $src; using it as is" }
    } else {
      if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'git is required to fetch the CLI: winget install Git.Git'; return }
      Step "cloning $repoUrl"
      New-Item -ItemType Directory -Force (Join-Path $HOME '.hivemind') | Out-Null
      # Uses your git credential manager / gh auth; never waits on a prompt.
      $prev = $env:GIT_TERMINAL_PROMPT; $env:GIT_TERMINAL_PROMPT = '0'
      & git clone --quiet --filter=blob:none $repoUrl $src
      $code = $LASTEXITCODE; $env:GIT_TERMINAL_PROMPT = $prev
      if ($code) {
        Fail "couldn't clone $repoUrl. The repo is private: ask for access (or run gh auth login), or clone it yourself and re-run with `$env:HIVEMIND_SRC = '<your clone>'"
        return
      }
    }
  }
  Step "cli from $src"

  & npm.cmd install --global --no-fund --no-audit --loglevel=error (Join-Path $src 'cli') | Out-Null
  if ($LASTEXITCODE) { Fail "npm install -g $src\cli failed (see above)"; return }
  $prefix = (& npm.cmd config get prefix).Trim()
  if (-not (Test-Path (Join-Path $prefix 'hivemind.cmd'))) { Fail "installed, but $prefix\hivemind.cmd is missing; check: npm ls -g hivemind-cli"; return }
  $prevNoUpdate = $env:HIVEMIND_NO_UPDATE; $env:HIVEMIND_NO_UPDATE = '1'
  $version = & node (Join-Path $src 'cli\hivemind.mjs') --version
  $env:HIVEMIND_NO_UPDATE = $prevNoUpdate
  Step "installed $version as hivemind and hm ($prefix)"
  $onPath = ($env:Path -split ';' | ForEach-Object { $_.TrimEnd('\') }) -contains $prefix.TrimEnd('\')
  if (-not $onPath) { $env:Path = "$prefix;$env:Path" } # usable in this window right away

  # 3. hivemind init in the repo you're in (never in the hivemind checkout itself)
  $top = (& git rev-parse --show-toplevel 2>$null)
  $inited = $false
  if ($env:HIVEMIND_NO_INIT) {
    Step 'skipped hivemind init (HIVEMIND_NO_INIT)'
  } elseif ($top -and -not (Test-Checkout $top)) {
    Write-Host ''
    & node (Join-Path $src 'cli\hivemind.mjs') init
    if ($LASTEXITCODE) { Warn "hivemind init failed; run it again in $top once the issue above is fixed" } else { $inited = $true }
  }

  # 4. What's left
  Write-Host ''
  Write-Host 'Hivemind is ready.' -ForegroundColor Yellow
  $n = 1
  if (-not $onPath) { Step "$n. add $prefix to your PATH (Settings > Environment Variables); this window already has it"; $n++ }
  if (-not $env:HIVEMIND_TOKEN) { Step "$n. setx HIVEMIND_TOKEN <token>    (ask your Hivemind admin; new terminals pick it up)"; $n++ }
  if (-not $env:HIVEMIND_USER) {
    $email = (& git config user.email 2>$null)
    $guess = if ($email) { ($email -split '@')[0] } else { '<you>' }
    Step "$n. setx HIVEMIND_USER $guess    (your Hivemind handle)"; $n++
  }
  if (-not $inited) { Step "$n. cd your-repo; hivemind init"; $n++ }
  Step "$n. hm c    Claude Code on the left, Hivemind on the right (or: hivemind setup-shortcut for a Windows Terminal profile)"
}
