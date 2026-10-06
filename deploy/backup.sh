#!/usr/bin/env bash
# Dump semanal criptografado do banco para o Object Storage da Oracle.
#
# Complementa o backup automático diário do MySQL HeatWave: fica
# fora do banco e só pode ser lido com a senha de criptografia.
#
# Uso (cron semanal, ver deploy/DEPLOY.md):
#   /opt/easy-maintenance/deploy/backup.sh
#
# Lê /etc/easy-maintenance/backup.env (permissão 600, fora do git):
#   DB_HOST=10.0.1.x           IP privado do HeatWave
#   DB_PORT=3306
#   DB_NAME=coca_cola_maintenance
#   BACKUP_DB_USER=easy_backup  usuário só de leitura
#   BACKUP_DB_PASSWORD=...
#   BACKUP_PASSPHRASE=...       senha da criptografia (guarde fora da VM)
#   BACKUP_PAR_URL=https://objectstorage.sa-saopaulo-1.oraclecloud.com/p/.../o/
#     (Pre-Authenticated Request do bucket, só escrita)
#   DB_CA=/opt/easy-maintenance/deploy/secrets/db-ca.pem

set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/easy-maintenance/backup.env}"

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DB_HOST:?}" "${DB_NAME:?}" "${BACKUP_DB_USER:?}" "${BACKUP_DB_PASSWORD:?}"
: "${BACKUP_PASSPHRASE:?}" "${BACKUP_PAR_URL:?}" "${DB_CA:?}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
object_name="${DB_NAME}-${timestamp}.sql.gz.gpg"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
chmod 700 "$work_dir"

# A senha vai num arquivo de opções, não na linha de comando
# (que aparece no `ps`).
cat > "$work_dir/my.cnf" <<EOF
[client]
user=${BACKUP_DB_USER}
password=${BACKUP_DB_PASSWORD}
EOF
chmod 600 "$work_dir/my.cnf"

# Cliente oficial do MySQL em contêiner: a VM não precisa dele
# instalado. --single-transaction gera um dump consistente sem
# travar as tabelas.
docker run --rm --network host \
  -v "$work_dir/my.cnf:/backup/my.cnf:ro,z" \
  -v "$DB_CA:/backup/ca.pem:ro,z" \
  mysql:8.4 \
  mysqldump \
    --defaults-extra-file=/backup/my.cnf \
    --host="$DB_HOST" \
    --port="${DB_PORT:-3306}" \
    --ssl-mode=VERIFY_CA \
    --ssl-ca=/backup/ca.pem \
    --single-transaction \
    --no-tablespaces \
    --set-gtid-purged=OFF \
    "$DB_NAME" \
  | gzip -9 \
  | gpg --batch --yes --pinentry-mode loopback \
      --symmetric --cipher-algo AES256 \
      --passphrase-fd 3 3<<<"$BACKUP_PASSPHRASE" \
      -o "$work_dir/$object_name"

curl --fail --silent --show-error \
  -X PUT \
  --upload-file "$work_dir/$object_name" \
  "${BACKUP_PAR_URL%/}/$object_name"

echo "Backup enviado: $object_name ($(du -h "$work_dir/$object_name" | cut -f1))"
