#!/bin/bash
#----------------------------------------------------------------
# Скрипт расшифровывает секретный контент
# 1. Выполняет расшифровку файла из html-static/secret.json
# 2. Генерирует файл из html-static/secret.json в output.html
#----------------------------------------------------------------
set -euo pipefail
cd "$(dirname -- "$0")/.." # cwd

node tools/decode.js html-static/secret.json \
  ПРИВЕТ output1.html \
  СЕКРЕТ output2.html \
  СОЛНЦЕ output3.html
