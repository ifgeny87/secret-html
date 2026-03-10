#!/bin/bash
#----------------------------------------------------------------
# Скрипт шифрует секретный контент
# 1. Выполняет шифрование файла из input/input_example.html
# 2. Генерирует секретный контент в html-static/secret.json
#----------------------------------------------------------------
set -euo pipefail
cd "$(dirname -- "$0")/.." # cwd

node tools/encode.js 11 html-static/secret.json \
  input/input_example_1.html ПРИВЕТ \
  input/input_example_2.html СЕКРЕТ \
  input/input_example_3.html СОЛНЦЕ
