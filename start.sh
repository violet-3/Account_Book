#!/usr/bin/env bash
# 一键启动(电脑+手机同一局域网可访问)
cd "$(dirname "$0")"
node server.js "${1:-5173}"
