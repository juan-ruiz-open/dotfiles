#!/usr/bin/env node
/* eslint-disable */
/**
 * fix-theme-selection.js
 * -----------------------------------------------------------------------------
 * Corrige el color de resaltado de fila (selección) en los paneles webview de
 * VS Code (por ejemplo "Query Result" de Oracle SQL Developer, ag-grid).
 *
 * PROBLEMA
 *   Muchos temas oscuros definen list.activeSelectionBackground /
 *   list.hoverBackground con el MISMO valor que editor.background, por lo que
 *   la fila seleccionada es invisible. La grilla de resultados mapea:
 *     --ag-selected-row-background-color: var(--vscode-list-activeSelectionBackground)
 *     --ag-row-hover-color:               var(--vscode-list-hoverBackground)
 *     --ag-focus-border:                  var(--vscode-list-focusOutline)
 *
 * SOLUCIÓN
 *   Reescribe esas claves dentro del JSON del tema instalado (lo que la webview
 *   sí lee de forma garantizada). Es idempotente: se puede volver a ejecutar
 *   después de cada actualización de la extensión del tema.
 *
 * ADAPTACIÓN AL TEMA (sin colores hardcodeados)
 *   Los colores NO se imponen: se DERIVAN de la paleta real del tema activo
 *   (editor.background, editor.selectionBackground, button.background, ...)
 *   calculando contraste WCAG. Funciona en temas oscuros, claros y de alto
 *   contraste. Si el tema ya tiene buen contraste, no se modifica (salvo --force).
 *
 * USO
 *   node fix-theme-selection.js                 # deriva del tema y aplica
 *   node fix-theme-selection.js --dry-run       # muestra qué haría
 *   node fix-theme-selection.js --check         # exit 1 si falta aplicar
 *   node fix-theme-selection.js --force         # aplica aunque ya esté bien
 *   node fix-theme-selection.js --keep-palette  # paleta fija One Dark Monokai
 *   node fix-theme-selection.js --list-themes   # lista temas y su contraste
 *   node fix-theme-selection.js --restore       # restaura desde .bak
 *   node fix-theme-selection.js --with-settings # + colorCustomizations
 *
 * OPCIONES
 *   --user-dir <ruta>     Carpeta User de VS Code (autodetectada, incl. perfiles)
 *   --ext-dir <ruta>      Carpeta de extensiones (autodetectada, incl. integrados)
 *   --theme-name <label>  Forzar el label del tema activo
 *   --min-contrast <n>    Contraste objetivo de la selección (defecto 1.35)
 *
 * Requiere Node.js (probado con v14.15.0). Sin dependencias externas.
 * -----------------------------------------------------------------------------
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/* -------------------------------------------------------------------------- */
/* Paleta fija (solo se usa con --keep-palette)                                */
/* -------------------------------------------------------------------------- */
const PALETTE = {
    'list.activeSelectionBackground': '#3e4451',
    'list.activeSelectionForeground': '#f8fafd',
    'list.inactiveSelectionBackground': '#2c313a',
    'list.inactiveSelectionForeground': '#d7dae0',
    'list.hoverBackground': '#21252b',
    'list.focusOutline': '#528bff',
    'list.highlightForeground': '#61afef'
};

/* -------------------------------------------------------------------------- */
/* Utilidades de color (WCAG)                                                  */
/* -------------------------------------------------------------------------- */
const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

function hexToRgb(hex) {
    if (!hex) return null;
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(c) {
    function h(v) {
        const s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
        return s.length === 1 ? '0' + s : s;
    }
    return '#' + h(c.r) + h(c.g) + h(c.b);
}

function luminance(c) {
    function ch(v) {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(a, b, t) {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t
    };
}

/** Determina si el tema es oscuro usando su campo type o la luminancia del fondo. */
function isDarkTheme(colors, themeType) {
    if (typeof themeType === 'string' && themeType) {
        if (/hc-black/i.test(themeType)) return true;
        if (/light/i.test(themeType)) return false;
        if (/dark/i.test(themeType)) return true;
    }
    const bg = hexToRgb(colors && colors['editor.background']);
    if (!bg) return true;
    return luminance(bg) < 0.5;
}

/**
 * Deriva los colores de selección a partir de la paleta REAL del tema.
 * No hay valores fijos: todo sale de las claves del propio tema.
 */
function deriveColors(colors, themeType) {
    colors = colors || {};
    const bg =
        hexToRgb(colors['editor.background']) ||
        hexToRgb(colors['editorWidget.background']) ||
        hexToRgb(colors['sideBar.background']) ||
        { r: 0x12, g: 0x12, b: 0x12 };

    const dark = isDarkTheme(colors, themeType);
    const toward = dark ? WHITE : BLACK;
    const target = OPTS.minContrast;

    // --- fondo de la selección activa ------------------------------------
    let active = hexToRgb(colors['editor.selectionBackground']);
    if (!active || contrast(active, bg) < Math.min(1.3, target)) {
        let step = dark ? 0.14 : 0.12;
        active = mix(bg, toward, step);
        while (contrast(active, bg) < target && step < 0.9) {
            step += 0.04;
            active = mix(bg, toward, step);
        }
    }

    // --- selección inactiva y hover --------------------------------------
    let inactive = mix(bg, toward, dark ? 0.09 : 0.08);
    if (contrast(inactive, bg) < 1.18) inactive = mix(bg, toward, dark ? 0.13 : 0.12);

    let hover = mix(bg, toward, dark ? 0.06 : 0.05);
    if (contrast(hover, bg) < 1.12) hover = mix(bg, toward, dark ? 0.09 : 0.08);
    if (contrast(hover, bg) >= contrast(active, bg)) hover = mix(bg, toward, dark ? 0.05 : 0.04);

    // --- acento (borde de foco / highlight) ------------------------------
    const accentKeys = [
        'button.background',
        'activityBarBadge.background',
        'textLink.foreground',
        'editorCursor.foreground',
        'focusBorder'
    ];
    let accent = null;
    for (let i = 0; i < accentKeys.length; i++) {
        const c = hexToRgb(colors[accentKeys[i]]);
        if (c && contrast(c, bg) >= 2.2) {
            accent = c;
            break;
        }
    }
    if (!accent) accent = dark ? { r: 0x52, g: 0x8b, b: 0xff } : { r: 0x00, g: 0x60, b: 0xb8 };

    // --- textos -----------------------------------------------------------
    const baseFg =
        hexToRgb(colors['editor.foreground']) ||
        hexToRgb(colors['foreground']) ||
        (dark ? WHITE : BLACK);

    const activeFg = contrast(baseFg, active) >= 4.5 ? baseFg : dark ? WHITE : BLACK;
    const inactiveFg = contrast(baseFg, inactive) >= 4.5 ? baseFg : dark ? WHITE : BLACK;

    return {
        'list.activeSelectionBackground': rgbToHex(active),
        'list.activeSelectionForeground': rgbToHex(activeFg),
        'list.inactiveSelectionBackground': rgbToHex(inactive),
        'list.inactiveSelectionForeground': rgbToHex(inactiveFg),
        'list.hoverBackground': rgbToHex(hover),
        'list.focusOutline': rgbToHex(accent),
        'list.highlightForeground': rgbToHex(accent)
    };
}

/** ¿El tema tiene el bug? (selección/hover sin contraste respecto al fondo) */
function needsFix(colors, themeType) {
    colors = colors || {};
    const bg = hexToRgb(colors['editor.background']);
    if (!bg) return true;

    const sel = hexToRgb(colors['list.activeSelectionBackground']);
    if (!sel) return true;
    if (contrast(sel, bg) < 1.25) return true;

    const hov = hexToRgb(colors['list.hoverBackground']);
    if (hov && contrast(hov, bg) < 1.1) return true;

    return false;
}

/* -------------------------------------------------------------------------- */
/* Argumentos                                                                  */
/* -------------------------------------------------------------------------- */
const argv = process.argv.slice(2);

function flag(name) {
    return argv.indexOf(name) !== -1;
}

function option(name) {
    const i = argv.indexOf(name);
    if (i === -1 || i + 1 >= argv.length) return null;
    return argv[i + 1];
}

function numberOption(name, fallback) {
    const v = parseFloat(option(name));
    return isNaN(v) ? fallback : v;
}

const OPTS = {
    dryRun: flag('--dry-run'),
    check: flag('--check'),
    restore: flag('--restore'),
    restoreSettings: flag('--restore-settings'),
    withSettings: flag('--with-settings'),
    force: flag('--force'),
    keepPalette: flag('--keep-palette'),
    listThemes: flag('--list-themes'),
    help: flag('--help') || flag('-h'),
    userDir: option('--user-dir'),
    extDir: option('--ext-dir'),
    themeName: option('--theme-name'),
    minContrast: numberOption('--min-contrast', 1.35)
};

/* -------------------------------------------------------------------------- */
/* Utilidades de consola                                                       */
/* -------------------------------------------------------------------------- */
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(msg) {
    console.log(msg);
}
function ok(msg) {
    console.log(C.green + '  [OK] ' + C.reset + msg);
}
function warn(msg) {
    console.log(C.yellow + '  [!!] ' + C.reset + msg);
}
function fail(msg) {
    console.log(C.red + '  [XX] ' + C.reset + msg);
}
function info(msg) {
    console.log(C.cyan + '  [..] ' + C.reset + msg);
}
function title(msg) {
    console.log('\n' + C.bold + msg + C.reset);
}

/* -------------------------------------------------------------------------- */
/* JSONC (JSON con comentarios y comas finales)                                */
/* -------------------------------------------------------------------------- */

/** Elimina comentarios y comas finales respetando el contenido de strings. */
function stripJsonc(text) {
    let out = '';
    let inStr = false;
    let esc = false;
    let inLine = false;
    let inBlock = false;

    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        const n = text[i + 1];

        if (inLine) {
            if (c === '\n') {
                inLine = false;
                out += c;
            }
            continue;
        }
        if (inBlock) {
            if (c === '*' && n === '/') {
                inBlock = false;
                i++;
            }
            continue;
        }
        if (inStr) {
            out += c;
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') {
            inStr = true;
            out += c;
            continue;
        }
        if (c === '/' && n === '/') {
            inLine = true;
            i++;
            continue;
        }
        if (c === '/' && n === '*') {
            inBlock = true;
            i++;
            continue;
        }
        out += c;
    }

    // comas finales: ,}  ,]
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return out;
}

function parseJsonc(text) {
    return JSON.parse(stripJsonc(text));
}

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* -------------------------------------------------------------------------- */
/* Detección de carpetas                                                       */
/* -------------------------------------------------------------------------- */
function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch (e) {
        return false;
    }
}

function isDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch (e) {
        return false;
    }
}

function defaultUserDirs() {
    const home = os.homedir();
    const list = [];

    if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'].forEach(function (n) {
            list.push(path.join(appData, n, 'User'));
        });
    } else if (process.platform === 'darwin') {
        const base = path.join(home, 'Library', 'Application Support');
        ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'].forEach(function (n) {
            list.push(path.join(base, n, 'User'));
        });
    } else {
        const base = path.join(home, '.config');
        ['Code', 'Code - Insiders', 'VSCodium', 'Cursor'].forEach(function (n) {
            list.push(path.join(base, n, 'User'));
        });
    }
    return list;
}

function defaultExtDirs() {
    const home = os.homedir();
    const dirs = [
        path.join(home, '.vscode', 'extensions'),
        path.join(home, '.vscode-insiders', 'extensions'),
        path.join(home, '.vscode-oss', 'extensions'),
        path.join(home, '.vscode-server', 'extensions'),
        path.join(home, '.vscode-server-insiders', 'extensions'),
        path.join(home, '.cursor', 'extensions'),
        path.join(home, '.cursor-server', 'extensions'),
        path.join(home, '.windsurf', 'extensions')
    ];

    // Temas integrados de VS Code (viven junto a la instalación, no en ~/.vscode)
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
        [
            'Microsoft VS Code',
            'Microsoft VS Code Insiders',
            'VSCodium',
            'Cursor'
        ].forEach(function (n) {
            dirs.push(path.join(localAppData, 'Programs', n, 'resources', 'app', 'extensions'));
        });
        if (process.env.ProgramFiles) {
            dirs.push(path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'resources', 'app', 'extensions'));
        }
    } else if (process.platform === 'darwin') {
        dirs.push('/Applications/Visual Studio Code.app/Contents/Resources/app/extensions');
        dirs.push('/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/extensions');
        dirs.push('/Applications/VSCodium.app/Contents/Resources/app/extensions');
    } else {
        dirs.push('/usr/share/code/resources/app/extensions');
        dirs.push('/usr/share/code-insiders/resources/app/extensions');
        dirs.push('/usr/lib/code/resources/app/extensions');
        dirs.push('/opt/visual-studio-code/resources/app/extensions');
        dirs.push('/snap/code/current/usr/share/code/resources/app/extensions');
    }

    return dirs.filter(isDir);
}

/** Carpetas User candidatas: la raíz y cada perfil de VS Code. */
function listUserDirCandidates() {
    const out = [];

    defaultUserDirs().forEach(function (d) {
        if (!isDir(d)) return;
        out.push(d);

        const profilesDir = path.join(d, 'profiles');
        if (!isDir(profilesDir)) return;

        let entries = [];
        try {
            entries = fs.readdirSync(profilesDir);
        } catch (e) {
            return;
        }
        entries.forEach(function (p) {
            const pd = path.join(profilesDir, p);
            if (isDir(pd)) out.push(pd);
        });
    });

    return out;
}

function resolveUserDir() {
    if (OPTS.userDir) {
        if (!isDir(OPTS.userDir)) {
            fail('--user-dir no existe: ' + OPTS.userDir);
            process.exit(2);
        }
        return OPTS.userDir;
    }

    const candidates = listUserDirCandidates();
    let fallback = null;

    for (let i = 0; i < candidates.length; i++) {
        const file = path.join(candidates[i], 'settings.json');
        if (!exists(file)) continue;
        if (!fallback) fallback = candidates[i];

        let data = null;
        try {
            data = parseJsonc(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            continue;
        }
        if (data && data['workbench.colorTheme']) return candidates[i];
    }

    if (fallback) return fallback;

    fail('No se encontró la carpeta User de VS Code. Usa --user-dir <ruta>.');
    process.exit(2);
}

function resolveExtDirs() {
    if (OPTS.extDir) {
        if (!isDir(OPTS.extDir)) {
            fail('--ext-dir no existe: ' + OPTS.extDir);
            process.exit(2);
        }
        return [OPTS.extDir];
    }
    const found = defaultExtDirs();
    if (found.length === 0) {
        fail('No se encontró la carpeta de extensiones. Usa --ext-dir <ruta>.');
        process.exit(2);
    }
    return found;
}

/* -------------------------------------------------------------------------- */
/* Lectura de settings.json                                                    */
/* -------------------------------------------------------------------------- */
function readSettings(userDir) {
    const file = path.join(userDir, 'settings.json');
    if (!exists(file)) return { file: file, data: {}, raw: '' };
    const raw = fs.readFileSync(file, 'utf8');
    let data = {};
    try {
        data = parseJsonc(raw);
    } catch (e) {
        fail('settings.json no se pudo parsear: ' + e.message);
        process.exit(3);
    }
    return { file: file, data: data, raw: raw };
}

/* -------------------------------------------------------------------------- */
/* Localizar el tema                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Devuelve [{ extDir, themePath, label }] para todas las copias instaladas
 * del tema indicado (puede haber varias versiones de la extensión).
 * Si `label` es null/undefined devuelve TODOS los temas encontrados.
 */
function findThemeFiles(extDirs, label) {
    const results = [];

    extDirs.forEach(function (extRoot) {
        let entries = [];
        try {
            entries = fs.readdirSync(extRoot);
        } catch (e) {
            return;
        }

        entries.forEach(function (entry) {
            const extPath = path.join(extRoot, entry);
            if (!isDir(extPath)) return;

            const pkgFile = path.join(extPath, 'package.json');
            if (!exists(pkgFile)) return;

            let pkg;
            try {
                pkg = parseJsonc(fs.readFileSync(pkgFile, 'utf8'));
            } catch (e) {
                return;
            }

            const themes = (pkg.contributes && pkg.contributes.themes) || [];
            themes.forEach(function (t) {
                const tLabel = t.label || t.id || '';
                if (label && tLabel !== label) return;
                const themePath = path.resolve(extPath, t.path);
                if (exists(themePath)) {
                    results.push({
                        extDir: extPath,
                        themePath: themePath,
                        label: tLabel,
                        extId: pkg.name || entry
                    });
                }
            });
        });
    });

    // dedupe por ruta real (varias carpetas de extensiones pueden solaparse)
    const seen = {};
    return results.filter(function (r) {
        const key = r.themePath.toLowerCase();
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

/** Fallback: busca por el campo "name" dentro de los JSON de temas. */
function findThemeFilesByName(extDirs, label) {
    const results = [];

    extDirs.forEach(function (extRoot) {
        let entries = [];
        try {
            entries = fs.readdirSync(extRoot);
        } catch (e) {
            return;
        }

        entries.forEach(function (entry) {
            const extPath = path.join(extRoot, entry);
            if (!isDir(extPath)) return;
            const themesDir = path.join(extPath, 'themes');
            if (!isDir(themesDir)) return;

            let files = [];
            try {
                files = fs.readdirSync(themesDir);
            } catch (e) {
                return;
            }

            files.forEach(function (f) {
                if (!/\.json$/i.test(f)) return;
                const p = path.join(themesDir, f);
                let data;
                try {
                    data = parseJsonc(fs.readFileSync(p, 'utf8'));
                } catch (e) {
                    return;
                }
                if (data && data.name === label) {
                    results.push({
                        extDir: extPath,
                        themePath: p,
                        label: label,
                        extId: entry
                    });
                }
            });
        });
    });

    return results;
}

/* -------------------------------------------------------------------------- */
/* Parcheo del JSON del tema (preservando formato)                             */
/* -------------------------------------------------------------------------- */

/** Encuentra el bloque `"key": { ... }` y devuelve índices de llaves. */
function findObjectBlock(text, key) {
    const re = new RegExp('"' + escapeRe(key) + '"\\s*:\\s*\\{');
    const m = re.exec(text);
    if (!m) return null;

    const open = m.index + m[0].length - 1; // índice de '{'
    let depth = 0;
    let inStr = false;
    let esc = false;

    for (let i = open; i < text.length; i++) {
        const c = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') {
            inStr = true;
            continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
            depth--;
            if (depth === 0) return { open: open, close: i };
        }
    }
    return null;
}

function detectIndent(blockText) {
    const m = /\r?\n([ \t]+)"/.exec(blockText);
    return m ? m[1] : '\t';
}

/**
 * Carga un tema resolviendo la cadena de "include" (temas integrados como
 * Dark Modern / Light+ heredan de otro JSON). Devuelve { colors, type }.
 */
function loadTheme(themePath) {
    const seen = {};

    function walk(p) {
        if (seen[p]) return { colors: {}, type: null };
        seen[p] = true;

        let data;
        try {
            data = parseJsonc(fs.readFileSync(p, 'utf8'));
        } catch (e) {
            return { colors: {}, type: null };
        }

        let base = { colors: {}, type: null };
        if (data && typeof data.include === 'string') {
            base = walk(path.resolve(path.dirname(p), data.include));
        }

        const colors = Object.assign({}, base.colors, (data && data.colors) || {});
        return { colors: colors, type: (data && data.type) || base.type };
    }

    return walk(themePath);
}

/** Actualiza/inserta claves dentro del cuerpo de un objeto JSON. */
function applyDesiredToBody(body, desired, nl) {
    const changed = [];
    const inserted = [];
    const current = {};

    // valor actual de cada clave
    Object.keys(desired).forEach(function (key) {
        const re = new RegExp('("' + escapeRe(key) + '"\\s*:\\s*)"((?:[^"\\\\]|\\\\.)*)"');
        const m = re.exec(body);
        current[key] = m ? m[2] : null;
    });

    // reemplazar existentes
    Object.keys(desired).forEach(function (key) {
        const value = desired[key];
        const re = new RegExp('("' + escapeRe(key) + '"\\s*:\\s*)"((?:[^"\\\\]|\\\\.)*)"');
        const m = re.exec(body);
        if (!m) return;
        if (m[2].toLowerCase() === value.toLowerCase()) return;
        body = body.replace(re, '$1"' + value + '"');
        changed.push(key);
    });

    // insertar faltantes al inicio del objeto
    const missing = Object.keys(desired).filter(function (key) {
        return current[key] === null;
    });

    if (missing.length > 0) {
        const indent = detectIndent(body);
        let inject = '';
        missing.forEach(function (key) {
            inject += nl + indent + '"' + key + '": "' + desired[key] + '",';
        });
        body = inject + body;
        missing.forEach(function (k) {
            inserted.push(k);
        });
    }

    return { body: body, changed: changed, inserted: inserted, current: current };
}

/**
 * Aplica los colores dentro del bloque "colors" del texto del tema.
 * Si el bloque no existe (temas que solo usan "include") lo crea.
 * Devuelve { text, changed: [keys], inserted: [keys], current: {key:value} }
 */
function patchThemeText(text, desired) {
    const nl = /\r\n/.test(text) ? '\r\n' : '\n';
    const block = findObjectBlock(text, 'colors');

    if (!block) {
        const rootOpen = text.indexOf('{');
        if (rootOpen === -1) throw new Error('JSON inválido (sin objeto raíz).');

        const indent = detectIndent(text) || '\t';
        const keys = Object.keys(desired);
        let inject = nl + indent + '"colors": {';
        keys.forEach(function (k, i) {
            inject +=
                nl +
                indent +
                indent +
                '"' +
                k +
                '": "' +
                desired[k] +
                '"' +
                (i < keys.length - 1 ? ',' : '');
        });
        inject += nl + indent + '},';

        return {
            text: text.slice(0, rootOpen + 1) + inject + text.slice(rootOpen + 1),
            changed: [],
            inserted: keys,
            current: {}
        };
    }

    const head = text.slice(0, block.open + 1);
    const body = text.slice(block.open + 1, block.close);
    const tail = text.slice(block.close);

    const r = applyDesiredToBody(body, desired, nl);
    return {
        text: head + r.body + tail,
        changed: r.changed,
        inserted: r.inserted,
        current: r.current
    };
}

/* -------------------------------------------------------------------------- */
/* Acciones                                                                    */
/* -------------------------------------------------------------------------- */

function backupOnce(file) {
    const bak = file + '.bak';
    if (!exists(bak)) {
        fs.copyFileSync(file, bak);
        return bak;
    }
    return null;
}

function doRestore(themeFiles) {
    let restored = 0;
    themeFiles.forEach(function (t) {
        const bak = t.themePath + '.bak';
        if (!exists(bak)) {
            warn('Sin respaldo para ' + t.themePath);
            return;
        }
        fs.copyFileSync(bak, t.themePath);
        ok('Restaurado: ' + t.themePath);
        restored++;
    });
    if (restored === 0) {
        warn('No se restauró ningún archivo.');
    }
    return restored;
}

function patchOneTheme(t) {
    const original = fs.readFileSync(t.themePath, 'utf8');

    let theme;
    try {
        theme = loadTheme(t.themePath);
    } catch (e) {
        fail(path.basename(t.themePath) + ': ' + e.message);
        return { patched: false, upToDate: false, desired: null };
    }

    const colors = theme.colors || {};
    const desired = OPTS.keepPalette ? PALETTE : deriveColors(colors, theme.type);

    log('  ' + C.dim + t.themePath + C.reset);
    log('    ' + C.dim + 'extension: ' + t.extId + C.reset);

    if (!OPTS.force && !needsFix(colors, theme.type)) {
        ok('El tema ya tiene contraste suficiente en la selección (se omite).');
        log('    ' + C.dim + 'usa --force para re-aplicar de todos modos' + C.reset);
        return { patched: false, upToDate: true, desired: desired };
    }

    let result;
    try {
        result = patchThemeText(original, desired);
    } catch (e) {
        fail(path.basename(t.themePath) + ': ' + e.message);
        return { patched: false, upToDate: false, desired: desired };
    }

    // validar que el resultado sigue siendo JSON válido
    try {
        parseJsonc(result.text);
    } catch (e) {
        fail('El resultado no es JSON válido, se aborta: ' + e.message);
        return { patched: false, upToDate: false, desired: desired };
    }

    const total = result.changed.length + result.inserted.length;

    if (total === 0) {
        ok('Ya está aplicado (sin cambios).');
        return { patched: false, upToDate: true, desired: desired };
    }

    result.changed.forEach(function (k) {
        log(
            '    ' +
                C.yellow +
                '~ ' +
                C.reset +
                k +
                ': ' +
                C.dim +
                result.current[k] +
                C.reset +
                ' -> ' +
                C.green +
                desired[k] +
                C.reset
        );
    });
    result.inserted.forEach(function (k) {
        log('    ' + C.green + '+ ' + C.reset + k + ': ' + C.green + desired[k] + C.reset);
    });

    if (OPTS.dryRun) {
        warn('dry-run: no se escribió nada.');
        return { patched: false, upToDate: false, desired: desired };
    }

    const bak = backupOnce(t.themePath);
    if (bak) log('    ' + C.dim + 'respaldo: ' + bak + C.reset);

    try {
        fs.writeFileSync(t.themePath, result.text, 'utf8');
    } catch (e) {
        if (e.code === 'EACCES' || e.code === 'EPERM') {
            warn('Sin permisos para escribir el tema (¿tema integrado de VS Code?).');
            warn('Se aplicará vía workbench.colorCustomizations en settings.json.');
            return { patched: false, upToDate: false, desired: desired, needSettings: true };
        }
        throw e;
    }

    ok('Escrito.');
    return { patched: true, upToDate: false, desired: desired };
}

/**
 * Inserta/actualiza workbench.colorCustomizations en el TEXTO de settings.json
 * sin destruir comentarios ni el resto del archivo.
 */
function patchSettingsText(raw, themeLabel, desired) {
    const nl = /\r\n/.test(raw) ? '\r\n' : '\n';
    const settingsKey = '[' + themeLabel + ']';
    const cc = findObjectBlock(raw, 'workbench.colorCustomizations');
    const keys = Object.keys(desired);

    // --- no existe el bloque: crearlo antes del cierre del objeto raíz ----
    if (!cc) {
        const closeIdx = raw.lastIndexOf('}');
        if (closeIdx === -1) throw new Error('no se encontró el objeto raíz');

        // quitar espacios y una posible coma final (JSONC la permite)
        const head = raw.slice(0, closeIdx).replace(/\s+$/, '').replace(/,$/, '');
        const tail = raw.slice(closeIdx);
        const indent = detectIndent(raw) || '    ';

        let block = '';
        if (!/\{\s*$/.test(head)) block += ',';
        block += nl + indent + '"workbench.colorCustomizations": {';
        block += nl + indent + indent + '"' + settingsKey + '": {';
        keys.forEach(function (k, i) {
            block +=
                nl +
                indent +
                indent +
                indent +
                '"' +
                k +
                '": "' +
                desired[k] +
                '"' +
                (i < keys.length - 1 ? ',' : '');
        });
        block += nl + indent + indent + '}' + nl + indent + '}';

        return { text: head + block + nl + tail, changed: [], inserted: keys, current: {} };
    }

    const ccBody = raw.slice(cc.open + 1, cc.close);
    const nested = findObjectBlock(ccBody, settingsKey);

    // --- ya existe la entrada del tema: parchear sus claves --------------
    if (nested) {
        const inner = ccBody.slice(nested.open + 1, nested.close);
        const r = applyDesiredToBody(inner, desired, nl);
        const newBody = ccBody.slice(0, nested.open + 1) + r.body + ccBody.slice(nested.close);
        const text = raw.slice(0, cc.open + 1) + newBody + raw.slice(cc.close);
        return { text: text, changed: r.changed, inserted: r.inserted, current: r.current };
    }

    // --- existe colorCustomizations pero no la entrada del tema ----------
    const indent = detectIndent(ccBody) || '    ';
    let inject = nl + indent + '"' + settingsKey + '": {';
    keys.forEach(function (k, i) {
        inject +=
            nl +
            indent +
            indent +
            '"' +
            k +
            '": "' +
            desired[k] +
            '"' +
            (i < keys.length - 1 ? ',' : '');
    });
    inject += nl + indent + '}';
    if (ccBody.replace(/\s+$/, '').length > 0) inject += ',';

    const newBody = inject + ccBody;
    const text = raw.slice(0, cc.open + 1) + newBody + raw.slice(cc.close);
    return { text: text, changed: [], inserted: keys, current: {} };
}

function patchSettings(settings, themeLabel, desired) {
    const raw = settings.raw && settings.raw.trim() ? settings.raw : '{\n}\n';

    let result;
    try {
        result = patchSettingsText(raw, themeLabel, desired);
    } catch (e) {
        fail('No se pudo parchear settings.json: ' + e.message);
        return false;
    }

    try {
        parseJsonc(result.text);
    } catch (e) {
        fail('El settings.json resultante no es válido, se aborta: ' + e.message);
        return false;
    }

    const changed = result.changed || [];
    const inserted = result.inserted || [];

    if (changed.length + inserted.length === 0) {
        ok('settings.json: colorCustomizations ya está aplicado.');
        return false;
    }

    changed.forEach(function (k) {
        log('    ' + C.yellow + '~ ' + C.reset + k + ' -> ' + C.green + desired[k] + C.reset);
    });
    inserted.forEach(function (k) {
        log('    ' + C.green + '+ ' + C.reset + k + ': ' + C.green + desired[k] + C.reset);
    });

    if (OPTS.dryRun) {
        warn('dry-run: settings.json no se escribió.');
        return false;
    }

    backupOnce(settings.file);
    fs.writeFileSync(settings.file, result.text, 'utf8');
    ok('settings.json actualizado (comentarios preservados).');
    return true;
}

/* -------------------------------------------------------------------------- */
/* Main                                                                        */
/* -------------------------------------------------------------------------- */
function printHelp() {
    log('Uso: node fix-theme-selection.js [opciones]');
    log('');
    log('  (sin opciones)        Deriva colores del tema activo y aplica el fix');
    log('  --dry-run             Muestra qué haría sin escribir');
    log('  --check               exit 1 si el fix falta o está incompleto');
    log('  --force               Aplica aunque el tema ya tenga buen contraste');
    log('  --keep-palette        Usa la paleta fija (One Dark Pro Monokai Darker)');
    log('  --min-contrast <n>    Contraste objetivo de la selección (def. 1.35)');
    log('  --with-settings       Además escribe workbench.colorCustomizations');
    log('  --list-themes         Lista los temas detectados y su contraste');
    log('  --restore             Restaura los JSON de tema desde .bak');
    log('  --restore-settings    Restaura settings.json desde .bak');
    log('  --user-dir <ruta>     Carpeta User de VS Code');
    log('  --ext-dir <ruta>      Carpeta de extensiones');
    log('  --theme-name <label>  Forzar el label del tema');
}

/** Lista todos los temas detectados con su diagnóstico de contraste. */
function listThemes(extDirs, activeLabel) {
    const all = findThemeFiles(extDirs, null);
    if (all.length === 0) {
        warn('No se encontraron temas en: ' + extDirs.join(', '));
        return;
    }

    log('  ' + all.length + ' tema(s) encontrado(s)  (' + C.bold + '*' + C.reset + ' = activo)');

    all.forEach(function (t) {
        let theme;
        try {
            theme = loadTheme(t.themePath);
        } catch (e) {
            theme = { colors: {}, type: null };
        }

        const bg = hexToRgb(theme.colors['editor.background']);
        const sel = hexToRgb(theme.colors['list.activeSelectionBackground']);
        let status;

        if (!bg) {
            status = C.yellow + 'sin editor.background' + C.reset;
        } else if (!sel) {
            status = C.yellow + 'sin list.activeSelectionBackground' + C.reset;
        } else {
            const cr = contrast(sel, bg);
            status =
                (cr < 1.25 ? C.red : C.green) +
                'contraste ' +
                cr.toFixed(2) +
                ':1' +
                (cr < 1.25 ? '  <-- BUG' : '') +
                C.reset;
        }

        const mark = t.label === activeLabel ? C.bold + ' *' + C.reset : '  ';
        log(mark + ' ' + t.label + '  ' + C.dim + '(' + t.extId + ')' + C.reset + '  ' + status);
    });
}

function main() {
    if (OPTS.help) {
        printHelp();
        return;
    }

    title('fix-theme-selection');
    log(C.dim + '  Corrige el resaltado de fila en webviews (Query Result / ag-grid).' + C.reset);

    const extDirs = resolveExtDirs();

    if (OPTS.listThemes) {
        const userDir0 = resolveUserDir();
        const s0 = readSettings(userDir0);
        title('Temas detectados');
        listThemes(extDirs, OPTS.themeName || s0.data['workbench.colorTheme']);
        return;
    }

    const userDir = resolveUserDir();
    info('User dir:  ' + userDir);
    info('Ext dirs:  ' + extDirs.join(', '));

    const settings = readSettings(userDir);
    const themeLabel = OPTS.themeName || settings.data['workbench.colorTheme'];

    if (!themeLabel) {
        fail('No hay "workbench.colorTheme" en settings.json. Usa --theme-name <label>.');
        process.exit(4);
    }

    info('Tema activo: ' + C.bold + themeLabel + C.reset);

    let themeFiles = findThemeFiles(extDirs, themeLabel);
    if (themeFiles.length === 0) {
        warn('No se encontró por contributes.themes; buscando por campo "name"...');
        themeFiles = findThemeFilesByName(extDirs, themeLabel);
    }

    if (OPTS.restoreSettings) {
        title('Restaurando settings.json');
        const bak = settings.file + '.bak';
        if (exists(bak)) {
            fs.copyFileSync(bak, settings.file);
            ok('Restaurado: ' + settings.file);
        } else {
            warn('No hay respaldo: ' + bak);
        }
        if (!OPTS.restore) return;
    }

    if (themeFiles.length === 0) {
        fail('No se encontró el archivo del tema "' + themeLabel + '".');
        fail('Puede ser un tema integrado en otra ruta o una instalación portable.');
        fail('Prueba: --with-settings, o indica --ext-dir <ruta>.');
        process.exit(5);
    }

    if (OPTS.restore) {
        title('Restaurando respaldos de tema');
        doRestore(themeFiles);
        return;
    }

    title('Parcheando archivo(s) del tema (' + themeFiles.length + ')');
    let anyPatched = false;
    let allUpToDate = true;
    let settingsDesired = null;
    let needSettings = false;

    themeFiles.forEach(function (t) {
        const r = patchOneTheme(t);
        if (r.patched) anyPatched = true;
        if (!r.upToDate) allUpToDate = false;
        if (r.desired && !settingsDesired) settingsDesired = r.desired;
        if (r.needSettings) needSettings = true;
    });

    if (OPTS.withSettings || needSettings) {
        title('Parcheando settings.json (workbench.colorCustomizations)');
        patchSettings(settings, themeLabel, settingsDesired || PALETTE);
    }

    title('Resultado');
    if (OPTS.check) {
        if (allUpToDate) {
            ok('El fix ya está aplicado.');
            process.exit(0);
        }
        fail('El fix NO está aplicado (o está incompleto).');
        process.exit(1);
    }

    if (anyPatched) {
        ok('Fix aplicado.');
        log('');
        log(C.bold + '  Siguiente paso obligatorio:' + C.reset);
        log('    Ctrl+Shift+P -> "Developer: Reload Window"');
        log(C.dim + '    (las webviews no recargan el CSS del tema en caliente)' + C.reset);
    } else if (allUpToDate) {
        ok('Nada que hacer: el fix ya estaba aplicado.');
    } else {
        warn('No se aplicaron cambios (revisa los mensajes anteriores).');
    }
}

main();
