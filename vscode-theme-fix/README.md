# vscode-theme-fix

Script para corregir el **resaltado de fila invisible** en la pestaña `Query Result` de VS Code (extensión `oracle.sql-developer`, grilla ag-grid).

## El problema

El tema define `list.activeSelectionBackground` con el **mismo color** que `editor.background`. La grilla de resultados mapea:

```
--ag-selected-row-background-color: var(--vscode-list-activeSelectionBackground)
--ag-row-hover-color:               var(--vscode-list-hoverBackground)
--ag-focus-border:                  var(--vscode-list-focusOutline)
```

→ la fila seleccionada queda del mismo color que el fondo.

## Uso

```bash
# Aplicar el fix: deriva los colores del tema activo
node fix-theme-selection.js

# Ver qué haría, sin escribir
node fix-theme-selection.js --dry-run

# Verificar si está aplicado (exit 1 si no)
node fix-theme-selection.js --check

# Ver todos los temas instalados y su contraste de selección
node fix-theme-selection.js --list-themes

# Re-aplicar aunque el tema ya tenga buen contraste
node fix-theme-selection.js --force

# Usar la paleta fija One Dark Pro Monokai Darker (comportamiento antiguo)
node fix-theme-selection.js --keep-palette

# Ajustar el contraste objetivo de la selección (defecto 1.35)
node fix-theme-selection.js --min-contrast 1.5

# Restaurar el original desde el .bak
node fix-theme-selection.js --restore
node fix-theme-selection.js --restore-settings

# Además escribir workbench.colorCustomizations en settings.json
node fix-theme-selection.js --with-settings

# Rutas o tema manuales
node fix-theme-selection.js --user-dir "C:\...\Code\User" --ext-dir "C:\...\.vscode\extensions"
node fix-theme-selection.js --theme-name "Mi Tema Oscuro"
```

**Después de ejecutarlo hay que recargar la ventana:** `Ctrl+Shift+P` → `Developer: Reload Window`.
Las webviews no recargan el CSS del tema en caliente.

## Independiente de la máquina

El script **no impone colores**. Detecta el tema activo y deriva la paleta de selección a partir de sus propias claves:

| Clave destino | Origen en el tema |
|---|---|
| `list.activeSelectionBackground` | `editor.selectionBackground` (validado con contraste WCAG) |
| `list.activeSelectionForeground` | `editor.foreground` si contrasta ≥ 4.5:1 |
| `list.inactiveSelectionBackground` | mezcla de `editor.background` hacia blanco/negro |
| `list.hoverBackground` | mezcla sutil de `editor.background` |
| `list.focusOutline` / `list.highlightForeground` | `button.background` → `activityBarBadge.background` → `textLink.foreground` → `editorCursor.foreground` → `focusBorder` |

Se adapta automáticamente a:

- **Temas oscuros, claros y de alto contraste** (detecta `type` o la luminancia del fondo).
- **Temas con `include`** (Dark Modern, Light+, etc.): resuelve la cadena de herencia.
- **Temas integrados de VS Code**: los busca en la carpeta de instalación.
- **Perfiles de VS Code**: revisa `User/settings.json` y `User/profiles/*/settings.json`.
- **Remote-SSH / WSL / Cursor / Windsurf**: incluye `~/.vscode-server/extensions`, `~/.cursor/extensions`, etc.

Además, **no toca temas que ya funcionan**: si `list.activeSelectionBackground` ya tiene contraste ≥ 1.25:1 respecto al fondo, se omite (usa `--force` para forzar).

## ⚠️ Se pierde al actualizar el tema

Cuando la extensión del tema se actualiza, VS Code instala una carpeta nueva (otra versión) y el parche desaparece. **Vuelve a ejecutar el script** después de cada actualización.

## Colores (ejemplo con One Dark Pro Monokai Darker)

Los valores concretos dependen del tema; con ese tema la derivación produce:

| Clave | Valor |
|---|---|
| `list.activeSelectionBackground` | `#3e4451` |
| `list.activeSelectionForeground` | `#f8fafd` |
| `list.inactiveSelectionBackground` | `#2c313a` |
| `list.inactiveSelectionForeground` | `#d7dae0` |
| `list.hoverBackground` | `#21252b` |
| `list.focusOutline` | `#528bff` |
| `list.highlightForeground` | `#61afef` |

Para forzar exactamente esa paleta en cualquier tema, usa `--keep-palette`
(objeto `PALETTE` al inicio de `fix-theme-selection.js`).

## Requisitos

Node.js (probado con v14.15.0). Sin dependencias externas.

## Archivos

- `fix-theme-selection.js` — el script (idempotente, con respaldo `.bak` y validación de JSON)
- `AGENT-PROMPT.md` — prompt detallado para que un agente replique el fix en otra máquina
