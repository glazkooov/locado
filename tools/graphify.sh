#!/usr/bin/env bash
set -euo pipefail

readonly GRAPHIFY_VERSION="0.9.112"
readonly GRAPHIFY_CACHE_DIR="${TMPDIR:-/tmp}/locado-graphify-uv-cache"
readonly GRAPHIFY_TOOL_DIR="${TMPDIR:-/tmp}/locado-graphify-tools"
readonly GRAPHIFY_BIN_DIR="${TMPDIR:-/tmp}/locado-graphify-bin"

exec env \
  UV_CACHE_DIR="$GRAPHIFY_CACHE_DIR" \
  UV_TOOL_DIR="$GRAPHIFY_TOOL_DIR" \
  UV_TOOL_BIN_DIR="$GRAPHIFY_BIN_DIR" \
  uvx --from "graphifyy==${GRAPHIFY_VERSION}" graphify "$@"
