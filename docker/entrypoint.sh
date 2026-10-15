#!/bin/sh
set -e

# Migrações e seed são idempotentes: o seed só garante o usuário master
# (sem trocar a senha de quem já existe) e insere fichas que ainda não existem.
node --import tsx src/db/migrate.ts
node --import tsx src/db/seed.ts

exec "$@"
