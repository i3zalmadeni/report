#!/usr/bin/env bash
# يعيد بناء قاعدة المعاينة المحلية ويشغّل خادمها (بيانات اختبار فقط، لا اتصال بأي قاعدة حقيقية)
set -euo pipefail; cd "$(dirname "$0")/../.."
P="psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null"
$P -d postgres -c "drop database if exists mirat_e2e" -c "create database mirat_e2e" 2>/dev/null
$P -d mirat_e2e -f tests/core_stub.sql
for f in supabase/migrations/*.sql; do $P -d mirat_e2e -f "$f"; done
$P -d mirat_e2e -f tests/seed.sql -f tests/e2e/stress.sql
pkill -f e2e/server.js || true
(PGDATABASE=mirat_e2e node tests/e2e/server.js > /tmp/mr-srv.log 2>&1 &); sleep 1.5
