#!/bin/bash
set -euo pipefail
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
if [ ! -f /workspace/.locado-env/activate.sh ]; then
  echo 'Run bash tools/cloud/install.sh first' >&2
  exit 1
fi
. /workspace/.locado-env/activate.sh
cd "$project_root"
exec php -S "127.0.0.1:${LOCADO_PORT:-8766}" tools/dev-router.php
