#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status

# Wait for PostgreSQL to be ready
until pg_isready -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for PostgreSQL to start..."
  sleep 1
done

echo "Restoring database from backup_mle_mar262025..."
pg_restore --verbose --clean --no-acl --no-owner -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" "/docker-entrypoint-initdb.d/db_backup"
echo "Database restoration complete."