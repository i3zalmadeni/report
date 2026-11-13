#!/usr/bin/env bash
# يشغّل اختبارات قاعدة البيانات على Postgres محلي (لا يتصل بأي قاعدة حقيقية).
# الاستخدام: PGHOST=/tmp/pg PGPORT=5544 tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
P="psql -U ${PGUSER:-postgres} -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists mirat_test" -c "create database mirat_test" >/dev/null
$P -d mirat_test -f tests/core_stub.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -d mirat_test -f "$f" >/dev/null; $P -d mirat_test -f "$f" >/dev/null; done  # مرتين: قابلية إعادة التنفيذ
$P -d mirat_test -f tests/seed.sql >/dev/null
for t in tests/04*_test.sql; do $P -d mirat_test -t -f "$t"; done
