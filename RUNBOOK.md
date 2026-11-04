# Target PC runbook

Everything below runs in an **elevated cmd** (`Win+X`, "Terminal (Admin)") on the old Windows PC,
64-bit. Run the steps in order.

## Values used here

| Name | Value |
|---|---|
| GitHub repo | `montassar-amara/lan-app` |
| App root | `C:\myapp` |
| Windows service | `myapp` |
| PostgreSQL role / database | `myapp` / `myapp` |
| Public hostname | `olive-press.duckdns.org` (DuckDNS) |
| Let's Encrypt email | `<ACME_EMAIL>` |
| DuckDNS subdomain | `olive-press` |
| Target LAN IP | `192.168.1.10` |
| PostgreSQL service | `PG_SERVICE` (find it in step 3) |
| PostgreSQL superuser password | `<PG_SUPER_PASS>` (you choose it in step 3) |
| App database password | `<DB_PASS>` (generate it in step 2) |

The DuckDNS hostname is `olive-press.duckdns.org`. Never commit `DB_PASS`, `PG_SUPER_PASS`,
`JWT_SECRET` or the DuckDNS token; they live only on the PC.

## 1. Folders and first install

```bat
winget install NSSM.NSSM
winget install CaddyServer.Caddy
```

Close and reopen the elevated cmd, then:

```bat
mkdir C:\myapp\backups C:\myapp\logs C:\myapp\config C:\myapp\releases C:\myapp\caddy
curl -L -o C:\myapp\update.ps1 https://raw.githubusercontent.com/montassar-amara/lan-app/main/ops/update.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\update.ps1
dir C:\myapp\current
```

`C:\myapp\current` must contain `node.exe`, `dist`, `public`, `node_modules`, `prisma`,
`prisma.config.ts` and `VERSION`. There is no service or database yet, so the updater only
downloads, unpacks and points `current` at the newest release.

## 2. Generate secrets

```bat
C:\myapp\current\node.exe -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run it twice:

- the first value is `JWT_SECRET`;
- the second is `DB_PASS` (hex only, safe inside a URL).

Write them down. They are used in step 4.

## 3. Install and configure PostgreSQL

```bat
winget search postgresql
winget install PostgreSQL.PostgreSQL.17 --override "--mode unattended --unattendedmodeui none --superpassword <PG_SUPER_PASS> --serverport 5432"
```

If the unattended flags are rejected, install normally and use the GUI: choose `<PG_SUPER_PASS>`,
port 5432, skip Stack Builder. Then find the service name:

```bat
sc query state= all | findstr /i "postgresql"
```

Use that name below as `PG_SERVICE` (usually `postgresql-x64-17`). Create the role and database:

```bat
set PGPASSWORD=<PG_SUPER_PASS>
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE ROLE myapp LOGIN PASSWORD '<DB_PASS>';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "CREATE DATABASE myapp OWNER myapp;"
```

Tune for a weak PC and keep PostgreSQL on localhost only:

```bat
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET shared_buffers='128MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET max_connections=20;"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET work_mem='4MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET maintenance_work_mem='32MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET effective_cache_size='512MB';"
"C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "ALTER SYSTEM SET listen_addresses='localhost';"
net stop PG_SERVICE
net start PG_SERVICE
```

If the PC has 2 GB RAM or less, use `shared_buffers='64MB'`. Leave `fsync` and
`synchronous_commit` on: the PC may lose power. **Do not** open port 5432 in the firewall and
**do not** forward it on the router.

## 4. App config and first migration

Create `C:\myapp\config\app.env` (no quotes):

```
PORT=8080
DATABASE_URL=postgresql://myapp:<DB_PASS>@127.0.0.1:5432/myapp
JWT_SECRET=<64 hex chars from step 2>
ADMIN_USER=admin
ADMIN_PASS=<long first-admin password>
```

Apply the migrations once:

```bat
cd /d C:\myapp\current
node.exe --env-file=C:\myapp\config\app.env node_modules\prisma\build\index.js migrate deploy
```

It must list the applied migrations without errors.

## 5. Permissions and the app service

```bat
icacls C:\myapp\config /inheritance:r /grant "SYSTEM:(OI)(CI)F" "Administrators:(OI)(CI)F" "NT AUTHORITY\LocalService:(OI)(CI)R"
icacls C:\myapp\logs   /grant "NT AUTHORITY\LocalService:(OI)(CI)M"

nssm install myapp C:\myapp\current\node.exe
nssm set myapp AppParameters "--max-old-space-size=256 --env-file=C:\myapp\config\app.env dist\main.js"
nssm set myapp AppDirectory C:\myapp\current
nssm set myapp ObjectName "NT AUTHORITY\LocalService"
nssm set myapp DependOnService PG_SERVICE
nssm set myapp Start SERVICE_AUTO_START
nssm set myapp AppStdout C:\myapp\logs\out.log
nssm set myapp AppStderr C:\myapp\logs\err.log
nssm set myapp AppRotateFiles 1
nssm set myapp AppRotateBytes 5000000
nssm set myapp AppRestartDelay 5000
nssm set myapp AppStopMethodConsole 15000
nssm start myapp
curl http://localhost:8080/api/health
```

The health response must be `{"ok":true,"version":"v..."}`. On the very first successful start the
admin account is seeded; after confirming login works, remove the `ADMIN_PASS` line from
`app.env` and run `nssm restart myapp`.

`DependOnService` makes Windows start PostgreSQL before the app after every reboot.
`C:\myapp\current` is a junction the updater repoints, so releases need no service changes. If the
service cannot read the release, grant read access:
`icacls C:\myapp\releases /grant "NT AUTHORITY\LocalService:(OI)(CI)RX"`.

## 6. Caddy (HTTPS)

`C:\myapp\Caddyfile`:

```
{
	email <ACME_EMAIL>
}

olive-press.duckdns.org {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
		-Server
	}
	@lanonly path /api/admin/* /api/ingest/*
	respond @lanonly 404
	reverse_proxy 127.0.0.1:8080
}
```

The `@lanonly` prefixes are reserved for future write/admin/ingestion routes: they stay reachable
on the LAN at `:8080` but return 404 from the internet.

```bat
where caddy
nssm install caddy "C:\Program Files\caddy\caddy.exe"
nssm set caddy AppParameters "run --config C:\myapp\Caddyfile"
nssm set caddy AppEnvironmentExtra XDG_DATA_HOME=C:\myapp\caddy
nssm set caddy Start SERVICE_AUTO_START
nssm start caddy
```

Use the path printed by `where caddy` if it differs.

## 7. Firewall, schedules, power

```bat
netsh advfirewall firewall add rule name="myapp web" dir=in action=allow protocol=TCP localport=80,443
netsh advfirewall firewall add rule name="myapp lan" dir=in action=allow protocol=TCP localport=8080 remoteip=localsubnet

schtasks /create /f /tn myapp-update /sc hourly /ru SYSTEM /rl HIGHEST /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\update.ps1"
schtasks /create /f /tn myapp-backup /sc daily /st 02:00 /ru SYSTEM /rl HIGHEST /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\backup.ps1"

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /h off
sc config w32time start= auto
```

## 8. DuckDNS (dynamic public IP)

The WAN address is dynamic, so keep the DuckDNS A record updated every 5 minutes:

```bat
echo curl -s "https://www.duckdns.org/update?domains=olive-press&token=<DUCKDNS_TOKEN>&ip=" > C:\myapp\duck.cmd
schtasks /create /f /tn duckdns /sc minute /mo 5 /ru SYSTEM /tr C:\myapp\duck.cmd
```

`duck.cmd` contains the token: do not copy it into the repo. Test it once with
`type C:\myapp\duck.cmd` then run `C:\myapp\duck.cmd` (expected output `OK`).

The DuckDNS hostname must be `olive-press.duckdns.org`; Caddy then obtains the certificate automatically on
ports 80/443.

## 9. Router and BIOS

- Give the PC the DHCP reservation `192.168.1.10`.
- Forward **TCP 80 and 443** to `192.168.1.10`. Do **not** forward 8080, 5432 or any other port.
- BIOS: set "Restore on AC power loss" to **Power On**.

If the router's WAN IP turns out not to match the public IP, the ISP uses CGNAT and port
forwarding cannot work. In that case replace Caddy + DuckDNS with a Cloudflare Tunnel
(`cloudflared` as a Windows service); the app, database and backups stay unchanged.

## 10. Prove the backup

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File C:\myapp\backup.ps1
dir C:\myapp\backups
```

A fresh `daily-YYYY-MM-DD.dump` must appear.

## 11. Manual restore (disaster recovery)

```bat
net stop myapp
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --dbname=postgresql://myapp:<DB_PASS>@127.0.0.1:5432/myapp --clean --if-exists --no-owner C:\myapp\backups\daily-YYYY-MM-DD.dump
net start myapp
```

A rollback performed by `update.ps1` also restores the pre-update dump, so any data written
between the update and the rollback is lost. Keep the health-check window short.

## 12. Final checks

| Check | How | Expected |
|---|---|---|
| LAN works | Open `http://192.168.1.10:8080` from another LAN device | Login page, can log in |
| Internet works | Phone on **mobile data**, open `https://olive-press.duckdns.org` | Valid HTTPS certificate, login works |
| Offline works | Unplug the router's internet cable, open the LAN URL | Still works, data still saves |
| Database not exposed | From another LAN device: `Test-NetConnection 192.168.1.10 -Port 5432` | Fails |
| Auto-update | Release `v1.0.1`, then wait an hour or run `C:\myapp\update.ps1` | `current\VERSION` and `/api/health` show `v1.0.1`; `backups\pre-v1.0.1.dump` exists |
| Migration applied | Ship a release with a new additive migration | The new table/column exists and the app works |
| Rollback | Staging box only: release a build with a failing migration or startup crash | Log shows rollback, database restored, old version running, tag in `bad.txt` |
| Reboot | Restart the PC | PostgreSQL, `myapp` and `caddy` start automatically; health is OK |
| Backup | Check `C:\myapp\backups` the next morning | A fresh `daily-*.dump` |

## 13. Day-to-day commands

```bat
nssm restart myapp
nssm restart caddy
type C:\myapp\logs\err.log
type C:\myapp\logs\update.log
sc query myapp
```
