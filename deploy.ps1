# Builds the web version and publishes it on Cloudflare Pages.
#
#   .\deploy.ps1                         pull, build, deploy to https://ti-companion-plus.pages.dev
#   .\deploy.ps1 -NoPull                 build what is checked out now
#   .\deploy.ps1 -DryRun                 build only, then serve tiweb\out yourself to check it
#   .\deploy.ps1 -GameData C:\ti-gamedata\gamedata   use an extract made earlier
#
# The game-data extract (templates and translations, Pavonis' data) is made
# from your Terra Invicta install by `python -m ticore.bundle`, so the site
# always matches the game version you have. It goes to the site, never to git.
#
# One-time setup (needs a free Cloudflare account):
#   cd tiweb
#   npx --yes wrangler@4 login
#   npx --yes wrangler@4 pages project create ti-companion-plus --production-branch main
# If that name is taken, pick another and pass it with -Project.

param(
    [string]$Project = "ti-companion-plus",
    [string]$SiteUrl = "",           # default: https://<Project>.pages.dev
    [string]$GameData = "",          # folder with an existing extract (manifest.json inside)
    [switch]$NoPull,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$web = Join-Path $root "tiweb"
if (-not $SiteUrl) { $SiteUrl = "https://$Project.pages.dev" }

function Step($text) { Write-Host "`n== $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host "`n$text" -ForegroundColor Red; exit 1 }

if (-not $NoPull) {
    Step "git pull"
    git -C $root pull --ff-only
    if ($LASTEXITCODE -ne 0) { Fail "git pull failed: commit or stash your changes, or use -NoPull." }
}

if (-not (Test-Path (Join-Path $web "node_modules"))) {
    Step "npm install (first build only)"
    Push-Location $web
    npm install
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) { Fail "npm install failed." }
}

Step "Build for $SiteUrl"
$env:NEXT_PUBLIC_SITE_URL = $SiteUrl
if ($GameData) {
    if (-not (Test-Path (Join-Path $GameData "manifest.json"))) { Fail "No manifest.json in $GameData." }
    $env:TI_GAMEDATA = (Resolve-Path $GameData).Path
} else {
    Remove-Item Env:TI_GAMEDATA -ErrorAction SilentlyContinue
}
Push-Location $web
npm run build:web
$code = $LASTEXITCODE
Pop-Location
Remove-Item Env:NEXT_PUBLIC_SITE_URL, Env:TI_GAMEDATA -ErrorAction SilentlyContinue
if ($code -ne 0) { Fail "Build failed: copy the last 20 lines above." }

# Without the extract the site would ask every visitor for the game folder:
# better not to publish it at all.
$out = Join-Path $web "out"
if (-not (Test-Path (Join-Path $out "gamedata\manifest.json"))) {
    Fail "The build has no game-data extract (tiweb\out\gamedata). Is Terra Invicta installed? Try: python -m ticore.bundle --check"
}
$files = (Get-ChildItem $out -Recurse -File | Measure-Object -Property Length -Sum)
Write-Host ("Built {0} files, {1:N1} MB" -f $files.Count, ($files.Sum / 1MB))

if ($DryRun) {
    Write-Host "`nDry run: not deployed. To look at it: cd tiweb\out; python -m http.server 8080" -ForegroundColor Yellow
    exit 0
}

Step "Deploy to Cloudflare Pages ($Project)"
Push-Location $web
npx --yes wrangler@4 pages deploy out --project-name $Project --branch main --commit-dirty=true
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { Fail "Deploy failed. First time? See the one-time setup at the top of deploy.ps1." }

Write-Host "`nLive at $SiteUrl" -ForegroundColor Green
