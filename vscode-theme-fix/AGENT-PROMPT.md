# Prompt para agente — Arreglar el resaltado de fila en la grilla de resultados de VS Code

> Copia y pega todo el contenido de la sección **PROMPT** como instrucción para el agente en la otra máquina.

---

## PROMPT

### CONTEXTO

Estoy usando VS Code en Windows con un tema oscuro (por ejemplo `One Dark Pro Monokai Darker`, pero puede ser otro). Cuando ejecuto una consulta con la extensión **Oracle SQL Developer for VS Code** (`oracle.sql-developer`) y abro la pestaña **Query Result**, la tabla de resultados aparece, pero **al seleccionar una fila no se distingue cuál está seleccionada**: el color de resaltado es prácticamente idéntico al color de fondo de las filas. A veces solo se alcanza a ver un borde muy tenue.

### DIAGNÓSTICO YA CONFIRMADO (verifícalo, no lo re-investigues desde cero)

La grilla de resultados es **ag-grid** con el tema `ag-theme-balham-dark`, y su CSS mapea los colores a variables de tema de VS Code:

```css
--ag-background-color:              var(--vscode-editor-background);
--ag-odd-row-background-color:      var(--vscode-keybindingTable-headerBackground, var(--vscode-editor-background));
--ag-selected-row-background-color: var(--vscode-list-activeSelectionBackground);
--ag-row-hover-color:               var(--vscode-list-hoverBackground);
--ag-focus-border:                  var(--vscode-list-focusOutline);
```

Y la celda seleccionada se pinta explícitamente así:

```css
.grid-cell.is-selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  border: 0.5px solid var(--ag-focus-border);
}
```

**Causa raíz:** el tema tiene `list.activeSelectionBackground` (y normalmente `list.hoverBackground`) con el **mismo valor** que `editor.background`, y además `list.focusOutline` **no está definido** (cae al fallback `focusBorder`, que también es casi idéntico al fondo). Resultado: selección invisible.

### OBJETIVO

Que la fila seleccionada en Query Result se vea claramente distinta, sin romper la estética del tema y **sin tocar el código de la extensión**.

### PROCEDIMIENTO

#### Paso 1 — Identificar el tema activo y su archivo

1. Lee `%APPDATA%\Code\User\settings.json` y obtén el valor de `workbench.colorTheme`.
2. Localiza la extensión que provee ese tema: recorre `%USERPROFILE%\.vscode\extensions\*` y busca en cada `package.json` la sección `contributes.themes` cuyo `label` coincida exactamente con el tema activo. El archivo del tema es `path.resolve(carpetaExtension, theme.path)`.
3. Si hay **varias versiones** de la extensión instaladas (p. ej. `...-1.0.0`, `...-1.1.0`), parchea **todas** las copias.

Comandos útiles (Git Bash):

```bash
node -e "const s=require('fs').readFileSync(process.env.APPDATA+'/Code/User/settings.json','utf8');console.log(s.match(/\"workbench.colorTheme\"\s*:\s*\"([^\"]+)\"/)[1])"
ls -d ~/.vscode/extensions/*monokai* ~/.vscode/extensions/*theme* 2>/dev/null
```

#### Paso 2 — Confirmar los valores actuales del tema

```bash
node -e "const d=require('<RUTA_AL_THEME_JSON>');console.log(Object.entries(d.colors).filter(([k])=>k.startsWith('list.')||k==='editor.background'||k==='focusBorder'))"
```

Debes ver que `list.activeSelectionBackground` == `editor.background` (o muy parecido). Eso confirma el bug.

#### Paso 3 — Aplicar el fix

**No impongas una paleta fija.** Deriva los colores de las claves del propio tema, así funciona igual en temas oscuros, claros o de alto contraste y en cualquier máquina.

Reglas de derivación:

1. `list.activeSelectionBackground`: usa `editor.selectionBackground` si tiene contraste ≥ 1.3:1 contra `editor.background`. Si no, mezcla `editor.background` hacia blanco (tema oscuro) o negro (tema claro) en pasos de 4 % hasta alcanzar ~1.35:1.
2. `list.inactiveSelectionBackground`: mezcla al ~9 % hacia blanco/negro (mínimo 1.18:1).
3. `list.hoverBackground`: mezcla al ~6 % (mínimo 1.12:1) y **siempre menos intensa** que la selección.
4. `list.focusOutline` y `list.highlightForeground`: primer color de acento del tema con contraste ≥ 2.2:1, en este orden: `button.background`, `activityBarBadge.background`, `textLink.foreground`, `editorCursor.foreground`, `focusBorder`.
5. `list.activeSelectionForeground` / `list.inactiveSelectionForeground`: `editor.foreground` si contrasta ≥ 4.5:1 sobre el fondo correspondiente; si no, blanco (oscuro) o negro (claro).

Detección de oscuro/claro: campo `type` del tema (`dark`, `light`, `hc-black`, `hc-light`) o, si falta, luminancia relativa de `editor.background` (< 0.5 ⇒ oscuro).

**Antes de escribir, comprueba si hace falta el fix**: si `list.activeSelectionBackground` ya tiene contraste ≥ 1.25:1 contra `editor.background`, el tema **no está roto**: no lo modifiques (salvo que el usuario lo pida).

Ejemplo con One Dark Pro Monokai Darker (resultado de la derivación):

```json
"list.activeSelectionBackground": "#3e4451",
"list.activeSelectionForeground": "#f8fafd",
"list.inactiveSelectionBackground": "#2c313a",
"list.inactiveSelectionForeground": "#d7dae0",
"list.hoverBackground": "#21252b",
"list.focusOutline": "#528bff",
"list.highlightForeground": "#61afef"
```

Reglas de edición:

- Si la clave ya existe, **reemplaza solo el valor**.
- Si no existe, **insértala** al inicio del objeto `colors`.
- **No reordenes ni reformatees** el archivo completo (tiene `tokenColors` y `semanticTokenColors`; reformatear genera un diff gigante).
- Crea un respaldo `*.json.bak` **solo la primera vez** (no lo sobrescribas en corridas posteriores, para conservar el original limpio).
- Valida que el archivo resultante siga siendo JSON válido antes de escribir.

**Alternativa recomendada:** si el script `fix-theme-selection.js` está disponible (misma carpeta que este prompt), ejecuta:

```bash
node fix-theme-selection.js
```

Ya implementa toda la derivación anterior. Es idempotente, hace respaldo, valida el JSON y soporta `--dry-run`, `--check`, `--force`, `--keep-palette`, `--min-contrast`, `--list-themes`, `--with-settings`, `--restore`, `--restore-settings`, `--user-dir`, `--ext-dir` y `--theme-name`.

#### Paso 4 — Verificar

1. Ejecuta `node fix-theme-selection.js --check` → debe salir con código 0 y "El fix ya está aplicado".
2. Confirma leyendo el archivo: las 7 claves deben tener los valores derivados.
3. Indica al usuario que **debe recargar la ventana**: `Ctrl+Shift+P` → `Developer: Reload Window`. Las webviews **no** recargan el CSS del tema en caliente; sin reload el cambio no se ve.
4. Después del reload, ejecutar una consulta y seleccionar una fila: debe verse claramente distinta del fondo.
5. Si quieres ver el diagnóstico de todos los temas instalados: `node fix-theme-selection.js --list-themes`.

### QUÉ NO HACER

- **No** modifiques archivos dentro de `dist/` de la extensión (se sobreescriben en cada actualización y no es el punto de override correcto).
- **No** uses solo `workbench.colorCustomizations` en `settings.json` como única solución: en varias versiones de VS Code las webviews no reflejan ese override de forma fiable. Úsalo **solo como complemento** (`--with-settings`).
- **No** cambies el tema a otro. El usuario quiere conservar su tema.
- **No** toques `editor.background` ni `editor.selectionBackground`.
- **No** agregues dependencias ni ejecutes `npm install`.

### IMPORTANTE — El fix se pierde al actualizar la extensión

Cuando la extensión del tema se actualice, VS Code instala una carpeta nueva con otra versión y **el parche desaparece**. Debes indicarle al usuario que vuelva a ejecutar el script después de cada actualización del tema.

### ENTREGABLE ESPERADO

Reporta al usuario:

1. Ruta exacta del/los archivo(s) de tema parcheados y la versión de la extensión.
2. Tabla antes/después de las 7 claves.
3. Ruta del respaldo `.bak`.
4. Recordatorio explícito de recargar la ventana.
5. Advertencia de que debe re-ejecutar el script tras actualizar el tema.

---

## Anexo — Cómo se descubrió (por si el tema o la extensión cambian)

Si en la otra máquina la extensión no es `oracle.sql-developer`, o el tema usa otras variables, verifica el mapeo real así:

```bash
cd ~/.vscode/extensions/<extension>/dist
grep -o "\-\-ag-[a-z-]*: var(--vscode-[A-Za-z0-9-]*)" *.js | sort -u
grep -o "var(--vscode-list-[A-Za-z0-9]*)" *.js | sort -u
grep -o "\.grid-cell\.is-selected[^}]*}" *.js
```

Eso te dará las variables exactas que la grilla consume; ajusta las claves del Paso 3 a esas variables.
