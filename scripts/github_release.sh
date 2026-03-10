#!/usr/bin/env bash
set -e

# Подготовка и публикация релиза в GitHub.
# Версия: последний git-тег (v*), patch увеличивается на 1. Если тегов нет — v1.0.0.
# Использование: ./github-release.sh [TAG — опционально, иначе следующий patch после последнего тега]
# Окружение: GH_TOKEN, OWNER, REPO (обязательны).

DIST_DIR="dist"

if [[ -z "${GH_TOKEN}" || -z "${OWNER}" || -z "${REPO}" ]]; then
	echo "Ошибка: задайте переменные GH_TOKEN, OWNER и REPO." >&2
	exit 1
fi

if [[ -n "${1}" ]]; then
	TAG="${1}"
else
	LATEST_TAG="$(git tag -l 'v*' 2>/dev/null | sort -V | tail -1)"
	if [[ -z "${LATEST_TAG}" ]]; then
		TAG="v1.0.0"
	else
		# Увеличиваем patch: v1.0.5 -> v1.0.6
		VER="${LATEST_TAG#v}"
		MAJOR="${VER%%.*}"
		REST="${VER#*.}"
		MINOR="${REST%%.*}"
		PATCH="${REST#*.}"
		[[ "${PATCH}" == "${REST}" ]] && PATCH=0
		PATCH=$((PATCH + 1))
		TAG="v${MAJOR}.${MINOR}.${PATCH}"
	fi
	echo "Версия будущего релиза: ${TAG}"
fi

export GH_TOKEN

RELEASE_ARGS=(
	"${TAG}"
	--repo "${OWNER}/${REPO}"
	--title "Release ${TAG}"
	--notes "Release ${TAG}"
)

if [[ -d "${DIST_DIR}" ]]; then
	shopt -s nullglob
	DIST_FILES=("${DIST_DIR}"/*)
	shopt -u nullglob
	if [[ ${#DIST_FILES[@]} -gt 0 ]]; then
		echo "Добавление файлов из ${DIST_DIR}/ в релиз..."
		RELEASE_ARGS+=("${DIST_FILES[@]}")
	fi
fi

echo "Создание и публикация релиза ${TAG}..."
gh release create "${RELEASE_ARGS[@]}"

echo ""
echo "Релиз опубликован: https://github.com/${OWNER}/${REPO}/releases/tag/${TAG}"
