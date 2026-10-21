#!/usr/bin/env bash
#
# dotfiles.sh — Sincroniza los dotfiles del repo hacia la carpeta del usuario
#
# Uso:
#   ./dotfiles.sh --apply    Copia los archivos al home (sobreescribe y deja solo lectura)
#   ./dotfiles.sh --status   Compara el repo con las copias en el home
#

set -u

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${HOME:-/c/Users/$USERNAME}"

# Archivos a copiar en $HOME
FILES=(
    ".bashrc"
    "custom-git-prompt.sh"
)

apply() {
    echo "Copiando dotfiles desde: $DOTFILES_DIR"
    echo "Destino: $TARGET_DIR"
    echo ""
    local status=0
    for f in "${FILES[@]}"; do
        local src="$DOTFILES_DIR/$f"
        local dest="$TARGET_DIR/$f"

        if [ ! -f "$src" ]; then
            echo "  [FAIL] no existe en el repo: $src"
            status=1
            continue
        fi

        # Quitar el atributo de solo lectura de una copia anterior para poder sobreescribir
        chmod u+w "$dest" 2>/dev/null

        if cp -f "$src" "$dest" && chmod 444 "$dest"; then
            echo "  [OK]   $dest (solo lectura)"
        else
            echo "  [FAIL] no se pudo copiar: $dest"
            status=1
        fi
    done
    echo ""
    [ "$status" -eq 0 ] && echo "Listo. Reinicia la terminal para que los cambios surtan efecto."
    return "$status"
}

show_status() {
    echo "Comparando el repo con $TARGET_DIR:"
    for f in "${FILES[@]}"; do
        local src="$DOTFILES_DIR/$f"
        local dest="$TARGET_DIR/$f"

        if [ ! -f "$src" ]; then
            echo "  [FAIL] no existe en el repo: $f"
        elif [ ! -e "$dest" ]; then
            echo "  [MISS] $f no existe en el home (ejecuta --apply)"
        elif ! cmp -s "$src" "$dest"; then
            echo "  [DIFF] $f difiere del repo (ejecuta --apply para actualizar)"
        elif [ -w "$dest" ]; then
            echo "  [WARN] $f actualizado pero NO es solo lectura (ejecuta --apply)"
        else
            echo "  [OK]   $f actualizado y solo lectura"
        fi
    done
}

usage() {
    echo "Uso: $(basename "$0") {--apply|--status}"
    echo ""
    echo "  --apply    Copia los archivos del repo al home (sobreescribe y deja solo lectura)"
    echo "  --status   Compara el repo con las copias en el home"
}

case "${1:-}" in
    --apply)
        apply
        ;;
    --status)
        show_status
        ;;
    *)
        usage
        exit 1
        ;;
esac
