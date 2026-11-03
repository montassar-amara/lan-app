$ErrorActionPreference = 'Stop'
$root = 'C:\myapp'
$d = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory | Sort-Object { [int]$_.Name } -Descending | Select-Object -First 1
$pg = "$($d.FullName)\bin"
$l = Get-Content "$root\config\app.env" | Where-Object { $_ -like 'DATABASE_URL=*' } | Select-Object -First 1
$url = $l.Substring('DATABASE_URL='.Length)
$f = "$root\backups\daily-$(Get-Date -Format yyyy-MM-dd).dump"
& "$pg\pg_dump.exe" --dbname=$url -Fc -f $f
if ($LASTEXITCODE) { throw 'pg_dump failed' }
Get-ChildItem "$root\backups" -Filter 'daily-*.dump' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-14) |
  Remove-Item -Force
