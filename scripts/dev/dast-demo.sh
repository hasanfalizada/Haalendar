#!/usr/bin/env bash
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The full DAST of the app on the demo stand (the scan of the API alone is
# scripts/dev/dast.sh): first HTTPS as a visitor gets it (old TLS refused, HTTP redirected, HSTS and the other headers on
# a page), then OWASP ZAP's full scan (spider, passive and active rules; image pinned, no add-on updates) of the web pages,
# signed in as a demo account. +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The pages are made in the browser, so the
# plain spider sees little of them (34 addresses in the first run): the AJAX spider goes through the app in a real browser
# (two of them: ZAP's default for -j, the client spider, starts over twenty and ran out of memory), and the API calls it
# makes are attacked too. Every operation of the API is the job of scripts/dev/dast.sh.
# The stand's rate limit stays on, so ZAP goes slowly enough for it; a reset ends its session, so start right after one. Only against your own demo: it sends attacks. Rule decisions with reasons:
# scripts/dev/dast-rules.tsv. Reports: .dev/dast-demo/report.{html,json,md}.
# Usage: scripts/dev/dast-demo.sh https://demo.example.org   (exit code 0 only when nothing is left at WARN or FAIL)
set -uo pipefail
URL="${1:-}"
case "$URL" in
  https://*) URL="${URL%/}" ;;
  *) echo "usage: $0 https://<the demo>"; exit 2 ;;
esac
HOST="${URL#https://}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$ROOT/.dev/dast-demo"
IMAGE="$(sed -n 's/^IMAGE="\(.*\)"$/\1/p' "$ROOT/scripts/dev/dast.sh")"
MINUTES=22
# +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. A scan may not take the machine: left alone, ZAP took 7.8 GB and the host ran out of memory.
ZAP_LIMITS=(--memory 4g --memory-swap 4g -e _JAVA_OPTIONS=-Xmx3g)
mkdir -p "$OUT"
chmod 777 "$OUT"  # ZAP's user in the container writes the reports here
rm -f "$OUT"/report.* "$OUT"/rules.conf

FAILED=0
expect() {
  local name=$1; shift
  if "$@"; then echo "ok      $name"; else echo "FAILED  $name"; FAILED=1; fi
}
tls_refused() { ! openssl s_client -connect "$HOST:443" -servername "$HOST" "$1" </dev/null >/dev/null 2>&1; }
tls_accepted() { openssl s_client -connect "$HOST:443" -servername "$HOST" "$1" </dev/null >/dev/null 2>&1; }

echo "== HTTPS"
expect "the certificate is valid for the name" curl -fsS -o /dev/null "$URL/api/v1/health/live"
expect "TLS 1.2 or newer is accepted" tls_accepted -tls1_2
expect "TLS 1.1 is refused" tls_refused -tls1_1
expect "TLS 1.0 is refused" tls_refused -tls1
redirect="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' "http://$HOST/")"
expect "HTTP redirects to HTTPS ($redirect)" grep -Eq "^30[18] https://$HOST/" <<<"$redirect"
headers="$(curl -fsSI "$URL/login")"
for header in strict-transport-security content-security-policy x-content-type-options referrer-policy x-robots-tag; do
  expect "a page has $header" grep -iq "^$header:" <<<"$headers"
done
expect "a page does not say which server runs it" sh -c '! grep -iE "^(server: .*[0-9]|x-powered-by:)" <<EOT
'"$headers"'
EOT'

echo "== sign in"
read -r COOKIE CSRF < <(python3 -I - "$URL/api/v1" <<'PY'
import http.cookies, json, sys, urllib.request
api = sys.argv[1]
status = json.load(urllib.request.urlopen(f"{api}/demo/status"))
assert status["demo_mode"], "this is not a demo: nothing is scanned"
account = status["accounts"][0]
request = urllib.request.Request(f"{api}/auth/login", method="POST", headers={"Content-Type": "application/json"},
                                 data=json.dumps({"email": account["email"], "password": account["password"]}).encode())
answer = urllib.request.urlopen(request)
cookie = http.cookies.SimpleCookie(answer.headers["Set-Cookie"])
name = next(iter(cookie))
print(f"{name}={cookie[name].value}", json.loads(answer.read())["csrf_token"])
PY
) || exit 1
[ -n "${CSRF:-}" ] || { echo "not signed in: is this a demo?"; exit 1; }

cut -f1-3 <(grep -v '^#' "$ROOT/scripts/dev/dast-rules.tsv") > "$OUT/rules.conf"
replacer() {  # index, header, value
  printf -- '-config replacer.full_list(%s).description=%s -config replacer.full_list(%s).enabled=true ' "$1" "$2" "$1"
  printf -- '-config replacer.full_list(%s).matchtype=REQ_HEADER -config replacer.full_list(%s).matchstr=%s ' "$1" "$1" "$2"
  printf -- '-config replacer.full_list(%s).regex=false -config replacer.full_list(%s).replacement=%s ' "$1" "$1" "$3"
}
# About 240 requests a minute: under the stand's limit of 300. +++===+++ 2026-11-09 — Hasan Alizada — HAAL-154. The
# attacks themselves stop after $MINUTES minutes (-T does not limit them: the first full run took two hours and went on
# signed out after the reset at the next mark).
OPTIONS="-silent $(replacer 0 Cookie "$COOKIE")$(replacer 1 X-CSRF-Token "$CSRF")-config scanner.threadPerHost=1 -config scanner.delayInMs=250 -config spider.thread=1 -config ajaxSpider.numberOfBrowsers=2 -config scanner.maxScanDurationInMins=$MINUTES"

echo "== ZAP (up to $MINUTES minutes of attacks)"
docker run --rm "${ZAP_LIMITS[@]}" -v "$OUT:/zap/wrk:rw" "$IMAGE" zap-full-scan.py -t "$URL/" -j --ajax-spider -m 3 -T "$MINUTES" \
  -c rules.conf -r report.html -J report.json -w report.md -z "$OPTIONS"
status=$?  # 0: nothing above INFO; 1: FAIL; 2: WARN (an alert without a decision in dast-rules.tsv); 3: ZAP failed
[ -s "$OUT/report.json" ] || { echo "ZAP wrote no report (exit $status)"; exit 3; }
python3 -I - "$OUT/report.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
alerts = [a for site in report.get("site", []) for a in site.get("alerts", [])]
for a in sorted(alerts, key=lambda a: -int(a["riskcode"])):
    print(f"{a['riskdesc']:<22} {a['pluginid']:>6}  {a['alert']}  ({a['count']}×)")
print(f"{len(alerts)} alert types")
PY
[ "$FAILED" = 0 ] || status=1
exit "$status"
