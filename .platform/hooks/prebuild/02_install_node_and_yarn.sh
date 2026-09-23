#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/app/staging"
NODE_VERSION="$(tr -d '[:space:]' < "${APP_DIR}/.node-version")"
YARN_VERSION="1.22.22"

case "$(uname -m)" in
  x86_64) NODE_ARCH="linux-x64" ;;
  aarch64|arm64) NODE_ARCH="linux-arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)" >&2; exit 1 ;;
esac

NODE_PREFIX="/opt/node-v${NODE_VERSION}-${NODE_ARCH}"

if [ ! -x "${NODE_PREFIX}/bin/node" ]; then
  TMP_DIR="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${NODE_ARCH}.tar.xz" -o "${TMP_DIR}/node.tar.xz"
  mkdir -p "${NODE_PREFIX}"
  tar -xJf "${TMP_DIR}/node.tar.xz" -C "${NODE_PREFIX}" --strip-components=1
  rm -rf "${TMP_DIR}"
fi

ln -sf "${NODE_PREFIX}/bin/node" /usr/local/bin/node
ln -sf "${NODE_PREFIX}/bin/npm" /usr/local/bin/npm
ln -sf "${NODE_PREFIX}/bin/npx" /usr/local/bin/npx

"${NODE_PREFIX}/bin/npm" install -g --force "yarn@${YARN_VERSION}"
ln -sf "${NODE_PREFIX}/bin/yarn" /usr/local/bin/yarn
hash -r

node --version
yarn --version
