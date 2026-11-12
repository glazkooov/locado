#!/bin/bash
set -euo pipefail
# Debian 13 x86_64 cloud image; no repository files or system packages are changed.
[ "$(uname -m)" = x86_64 ] || { echo 'This helper requires x86_64' >&2; exit 1; }
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

mkdir -p /workspace/.locado-env/apt/lists/partial /workspace/.locado-env/apt/cache/archives/partial /workspace/.locado-env/bin /workspace/.locado-env/php /workspace/node_modules
cat > /workspace/.locado-env/apt/sources.list <<'LOCADO_EOF'
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://deb.debian.org/debian trixie main
deb [signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] https://security.debian.org/debian-security trixie-security main
LOCADO_EOF
cat > /workspace/.locado-env/apt/config <<'LOCADO_EOF'
Dir::Etc::parts "-";
Dir::Etc::main "-";
Dir::Etc::sourcelist "/workspace/.locado-env/apt/sources.list";
Dir::Etc::sourceparts "-";
Dir::State::lists "/workspace/.locado-env/apt/lists";
Dir::Cache "/workspace/.locado-env/apt/cache";
APT::Get::List-Cleanup "0";
LOCADO_EOF
cat > /workspace/.locado-env/bin/php <<'LOCADO_EOF'
#!/bin/sh
exec /lib64/ld-linux-x86-64.so.2 --library-path /workspace/.locado-env/php/usr/lib/x86_64-linux-gnu /workspace/.locado-env/php/usr/bin/php8.4 -n -d extension_dir=/workspace/.locado-env/php/usr/lib/php/20240924 -d extension=mbstring -d extension=gd "$@"
LOCADO_EOF
cat > /workspace/.locado-env/playwright-system.cjs <<'LOCADO_EOF'
// Use the Chromium supplied by the cloud image, without modifying the project.
const { chromium } = require('/workspace/node_modules/playwright');
const launch = chromium.launch.bind(chromium);
chromium.launch = (options = {}) => launch({ ...options, executablePath: '/usr/bin/chromium' });
LOCADO_EOF
cat > /workspace/.locado-env/activate.sh <<'LOCADO_EOF'
export PATH="/workspace/.locado-env/bin:$PATH"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--require=/workspace/.locado-env/playwright-system.cjs"
LOCADO_EOF
chmod +x /workspace/.locado-env/bin/php
APT_CONFIG=/workspace/.locado-env/apt/config /usr/bin/apt-get update
APT_CONFIG=/workspace/.locado-env/apt/config /usr/bin/apt-get -o Debug::NoLocking=true --download-only --no-install-recommends -y install php-cli php-gd php-mbstring
for deb in /workspace/.locado-env/apt/cache/archives/*.deb; do dpkg-deb -x "$deb" /workspace/.locado-env/php; done
test -x /usr/bin/chromium
node -e 'console.log(require.resolve("playwright"))' > /workspace/.locado-env/playwright-path
playwright_dir=$(dirname "$(cat /workspace/.locado-env/playwright-path)")
if [ ! -e /workspace/node_modules/playwright ]; then ln -s "$playwright_dir" /workspace/node_modules/playwright; fi
. /workspace/.locado-env/activate.sh
php --version
node -e 'require("playwright").chromium.launch().then(async b => { console.log("Chromium", b.version()); await b.close(); }).catch(e => { console.error(e.message); process.exit(1); })'
cd "$project_root"
printf 'Setup complete. Start: bash tools/cloud/start.sh\nValidation (separate): . /workspace/.locado-env/activate.sh && npm run check\n'

