$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # progress bars make downloads crawl on old PCs
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'montassar-amara/lan-app'; $root = 'C:\myapp'; $svc = 'myapp'
Start-Transcript "$root\logs\update.log" -Append | Out-Null

function Point($t) {
  if (Test-Path "$root\current") { cmd /c rmdir "$root\current" | Out-Null }  # removes the link only
  cmd /c mklink /J "$root\current" "$root\releases\$t" | Out-Null
}
function Healthy($t) {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep 2
    try { if ((Invoke-RestMethod http://127.0.0.1:8080/api/health -TimeoutSec 3).version -eq $t) { return $true } } catch {}
  }
  return $false
}
function PgBin {
  $d = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1
  "$($d.FullName)\bin"
}
function DbUrl {
  $l = Get-Content "$root\config\app.env" | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
  $l.Substring('DATABASE_URL='.Length)
}

try {
  $cur = if (Test-Path "$root\current\VERSION") { (Get-Content "$root\current\VERSION").Trim() } else { '' }
  $bad = if (Test-Path "$root\bad.txt") { Get-Content "$root\bad.txt" } else { @() }
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'myapp-updater' }
  $tag = $rel.tag_name
  if ($tag -eq $cur -or $bad -contains $tag) { return }

  $dir = "$root\releases\$tag"
  if (-not (Test-Path $dir)) {
    $a = $rel.assets | Where-Object name -eq 'app.zip'
    $s = $rel.assets | Where-Object name -eq 'app.zip.sha256'
    Invoke-WebRequest $a.browser_download_url -OutFile "$root\dl.zip"
    Invoke-WebRequest $s.browser_download_url -OutFile "$root\dl.sha256"
    $want = (Get-Content "$root\dl.sha256" -Raw).Trim().Split(' ')[0]
    if ((Get-FileHash "$root\dl.zip" -Algorithm SHA256).Hash -ne $want) { throw 'checksum mismatch' }
    New-Item -ItemType Directory "$dir.tmp" | Out-Null
    tar -xf "$root\dl.zip" -C "$dir.tmp"          # far faster than Expand-Archive on old PCs
    if ($LASTEXITCODE) { throw 'extract failed' }
    Rename-Item "$dir.tmp" $tag
    Remove-Item "$root\dl.zip", "$root\dl.sha256"
  }

  $prev = $cur
  $hasSvc = [bool](Get-Service $svc -ErrorAction SilentlyContinue)
  if ($hasSvc) {
    $pg = PgBin; $url = DbUrl
    Stop-Service $svc -Force
    $dump = "$root\backups\pre-$tag.dump"
    & "$pg\pg_dump.exe" --dbname=$url -Fc -f $dump
    if ($LASTEXITCODE) { Start-Service $svc; throw 'pre-update pg_dump failed; update aborted' }

    Point $tag
    Push-Location "$root\current"
    & .\node.exe "--env-file=$root\config\app.env" node_modules\prisma\build\index.js migrate deploy
    $migrated = ($LASTEXITCODE -eq 0)
    Pop-Location

    $ok = $false
    if ($migrated) { Start-Service $svc; $ok = Healthy $tag }
    if (-not $ok) {
      Stop-Service $svc -Force
      & "$pg\pg_restore.exe" --dbname=$url --clean --if-exists --no-owner $dump
      if ($prev) { Point $prev }
      Start-Service $svc
      Add-Content "$root\bad.txt" $tag
      throw "release $tag failed (migrated=$migrated); restored database and rolled back to $prev"
    }
  } else {
    Point $tag    # first install: service and database do not exist yet (see Phase 10)
  }

  Get-ChildItem "$root\releases" -Directory | Sort-Object CreationTime -Descending |
    Select-Object -Skip 3 | Remove-Item -Recurse -Force
  Get-ChildItem "$root\backups" -Filter 'pre-*.dump' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) |
    Remove-Item -Force
  Copy-Item "$root\current\ops\update.ps1" "$root\update.ps1" -Force   # updater updates itself
  Copy-Item "$root\current\ops\backup.ps1" "$root\backup.ps1" -Force
}
finally { Stop-Transcript | Out-Null }
