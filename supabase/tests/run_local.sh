#!/usr/bin/env bash
# Uso: PGHOST=... PGPORT=... ./supabase/tests/run_local.sh
# Crea una base limpia, aplica migraciones (sin storage/cron) y corre las pruebas.
set -euo pipefail
cd "$(dirname "$0")/../.."
psql -U postgres -v ON_ERROR_STOP=1 -qc "drop database if exists fuego_test" -c "create database fuego_test"
P="psql -U postgres -d fuego_test -v ON_ERROR_STOP=1 -q"
$P -f supabase/tests/00_mock_supabase.sql
for f in supabase/migrations/0001_schema.sql supabase/migrations/0002_functions.sql supabase/migrations/0003_rls.sql supabase/migrations/0006_levels.sql supabase/migrations/0007_body_weight.sql supabase/migrations/0008_character.sql supabase/migrations/0009_body_records.sql supabase/migrations/0010_weekly.sql; do
  $P -f "$f"
done
# re-ejecutar para comprobar que las migraciones son idempotentes
for f in supabase/migrations/0*.sql; do case "$f" in *0004_storage*|*0005_cron*) continue;; esac; $P -f "$f"; done
$P -f supabase/tests/streak_test.sql
echo "✅ Todas las pruebas de base de datos pasaron"
