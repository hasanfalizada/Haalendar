#!/usr/bin/env bash
# +++===+++ 2026-11-01 — Hasan Alizada — HAAL-144. DAST of the API with OWASP ZAP (Apache-2.0; Docker image pinned by
# digest, no install): the throw-away stack (scripts/dev/stack-up.sh --scan), a first administrator signed in, and ZAP's
# API scan (passive and active rules) over every operation of api/openapi.yaml with that session. ZAP runs in its own
# container network (it opens unauthenticated ports of its own, never on the host) and silent (no add-on updates: the
# pinned image is what runs); it reaches the API on the Docker bridge address through a forwarder this script starts. Operations that would end
# the scanner's own session or lock its account are left out (DAST_SKIP below). The web pages are not scanned here: on
# this stack `vite preview` serves them, not the app with its own headers — the whole app is scanned on the demo stand
# (HAAL-154). Rule decisions (environment-specific alerts, accepted ones) with reasons: scripts/dev/dast-rules.tsv.
# Rate limits are raised for the scan (otherwise most requests end in 429; the limits are tested in test_security.py).
# Reports: .dev/dast/report.{html,json,md}. Takes 10–30 minutes. Not part of check-all.
# Usage: scripts/dev/dast.sh   (exit code 0 only when no alert is left at WARN or FAIL)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/.dev/dast"
IMAGE="ghcr.io/zaproxy/zaproxy:20261016-stable@sha256:5ccfff9a411743ab2615136a2edd7416bec9ce41572fa94e935df38c14adb2b6"
API="http://127.0.0.1:8081/api/v1"
export SCAN_HOST
SCAN_HOST="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')" || exit 1
SCAN_PORT=18081
mkdir -p "$OUT"
rm -f "$OUT"/report.* "$OUT"/openapi*.json "$OUT"/rules.conf

"$ROOT/scripts/dev/stack-up.sh" --scan || exit 1
FORWARDER=""
cleanup() {
  [ -n "$FORWARDER" ] && kill "$FORWARDER" 2>/dev/null
  "$ROOT/scripts/dev/stack-down.sh" >/dev/null 2>&1
}
trap cleanup EXIT
# The bridge address (reachable from this host and its containers only) forwarded to the API on 127.0.0.1.
python3 -I - "$SCAN_HOST" "$SCAN_PORT" <<'EOF' &
import asyncio, sys

async def pipe(reader, writer):
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    finally:
        writer.close()

async def handle(client_reader, client_writer):
    api_reader, api_writer = await asyncio.open_connection("127.0.0.1", 8081)
    await asyncio.gather(pipe(client_reader, api_writer), pipe(api_reader, client_writer), return_exceptions=True)

async def main():
    server = await asyncio.start_server(handle, sys.argv[1], int(sys.argv[2]))
    async with server:
        await server.serve_forever()

asyncio.run(main())
EOF
FORWARDER=$!

# The contract as one file, for the scan: served from this stack, without the operations the server does not serve
# and without those that would end the session ZAP scans with.
npx -y @redocly/cli@2.63.0 bundle "$ROOT/api/openapi.yaml" --ext json -o "$OUT/openapi.bundled.json" >/dev/null || exit 1
python3 -I - "$OUT" "http://$SCAN_HOST:$SCAN_PORT/api/v1" <<'EOF' || exit 1
import json, sys
out = sys.argv[1]
DAST_SKIP = {
    ("post", "/auth/logout"),  # ends the session
    ("post", "/auth/login"),  # wrong passwords lock the account (tested in test_login_protection.py)
    ("post", "/auth/reauth"),  # the same
    ("post", "/me/password"),  # changes the password and ends the other sessions
    ("delete", "/me/sessions/{id}"),  # ends sessions
    ("post", "/me/sessions/revoke-others"),
    ("post", "/me/totp/setup"),  # turns two-factor sign-in on or off for the scanning account
    ("post", "/me/totp/enable"),
    ("post", "/me/totp/disable"),
    ("post", "/me/totp/recovery-codes"),
    ("patch", "/admin/users/{id}"),  # role and status changes (self-changes are refused, others would lock users out)
    ("post", "/admin/users/{id}/{action}"),
    # Outside production any push endpoint is accepted (local fake services); the production allow-list is tested in
    # test_push.py, so a scan here would only report the development setting.
    ("post", "/me/push-subscriptions"),
    # The live stream stays open (text/event-stream) and only tells changes of the user's own data, tested in
    # test_live.py; ZAP reports its content type as unexpected and waits on it.
    ("get", "/stream"),
}
spec = json.load(open(f"{out}/openapi.bundled.json"))
spec["servers"] = [{"url": sys.argv[2]}]
for path, item in list(spec["paths"].items()):
    for method in list(item):
        op = item[method]
        if not isinstance(op, dict) or method not in ("get", "put", "post", "patch", "delete"):
            continue
        if op.get("x-not-implemented") or (method, path) in DAST_SKIP:
            del item[method]
    if not any(m in item for m in ("get", "put", "post", "patch", "delete")):
        del spec["paths"][path]
json.dump(spec, open(f"{out}/openapi.json", "w"), indent=1)
print(f"scan: {sum(len([m for m in i if m in ('get','put','post','patch','delete')]) for i in spec['paths'].values())} operations")
EOF

# The first administrator and a session (cookie and CSRF token) for every request ZAP sends.
read -r COOKIE CSRF < <(python3 -I - "$API" <<'EOF'
import http.cookies, json, secrets, sys, urllib.request
api = sys.argv[1]
password = secrets.token_urlsafe(18)
def post(path, body):
    request = urllib.request.Request(f"{api}{path}", data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(request)
admin = {"email": "dast@example.org", "password": password, "display_name": "DAST", "time_zone": "Europe/Berlin"}
answer = post("/setup/admin", admin)  # the first administrator is signed in at once
cookie = http.cookies.SimpleCookie(answer.headers["Set-Cookie"])
name = next(iter(cookie))
print(f"{name}={cookie[name].value}", json.loads(answer.read())["csrf_token"])
EOF
) || exit 1
[ -n "${CSRF:-}" ] || { echo "sign-in for the scan failed"; exit 1; }

# Rule decisions: the TSV with reasons becomes ZAP's tab-separated config (id, action, name).
cut -f1-3 <(grep -v '^#' "$ROOT/scripts/dev/dast-rules.tsv") > "$OUT/rules.conf"

replacer() {  # index, header, value
  printf -- '-config replacer.full_list(%s).description=%s -config replacer.full_list(%s).enabled=true ' "$1" "$2" "$1"
  printf -- '-config replacer.full_list(%s).matchtype=REQ_HEADER -config replacer.full_list(%s).matchstr=%s ' "$1" "$1" "$2"
  printf -- '-config replacer.full_list(%s).regex=false -config replacer.full_list(%s).replacement=%s ' "$1" "$1" "$3"
}
OPTIONS="-silent $(replacer 0 Cookie "$COOKIE")$(replacer 1 X-CSRF-Token "$CSRF")-config scanner.maxScanDurationInMins=40"

docker run --rm -v "$OUT:/zap/wrk:rw" "$IMAGE" zap-api-scan.py \
  -t /zap/wrk/openapi.json -f openapi -c rules.conf -r report.html -J report.json -w report.md -z "$OPTIONS"
status=$?  # 0: nothing above INFO; 1: FAIL; 2: WARN (an alert without a decision in dast-rules.tsv); 3: ZAP failed
[ -s "$OUT/report.json" ] || { echo "ZAP wrote no report (exit $status)"; exit 3; }
python3 -I - "$OUT/report.json" <<'EOF'
import json, sys
report = json.load(open(sys.argv[1]))
alerts = [a for site in report.get("site", []) for a in site.get("alerts", [])]
for a in sorted(alerts, key=lambda a: -int(a["riskcode"])):
    print(f"{a['riskdesc']:<22} {a['pluginid']:>6}  {a['alert']}  ({a['count']}×)")
print(f"{len(alerts)} alert types")
EOF
exit "$status"
