const vscode = require('vscode');
const path = require('path');

/* ======================================================================
	STRUCTURE : titres de bloc { }, sections [ ] et groupes < >
	(fonctions pures, sans dépendance à VS Code)
	====================================================================== */

const W = '[\\p{L}\\p{N}_]';                                   // lettre, chiffre ou _
const SEGMENT = `${W}+(?:-${W}+)*`;                              // segment non vide, tirets internes permis
const TITLE_SHAPE = new RegExp(`^[\\p{L}_]${W}*(?:-${W}+)*(?:\\.${SEGMENT})*$`, 'u');
const SYMBOL_START = /^[-+:*;&§@#|<\[\/=>~!°^"(){},]/;         // une ligne qui commence ainsi n'est jamais un titre
const OPENER = /^(\s*)(?:\[([^\]\n]*)\]|<([^>\n]*)>)\s*[({]\s*$/;  // [ titre ]( ... ou < titre >( ...

// Efface (par des espaces, colonnes et lignes conservées) ce que la grammaire ne lit pas comme du texte de note :
// le contenu des tableaux /. ... ./ et des commentaires /* ... */. Un // ou une chaîne "..." qui vient avant protège.
function maskBlocks(lines) {
	let mode = null;                                   // null | './' | '*/' : fermeture attendue
	return lines.map((line) => {
	let out = '', i = 0;
	while (i < line.length) {
		if (mode) {
		const j = line.indexOf(mode, i);
		if (j < 0) { out += ' '.repeat(line.length - i); i = line.length; }
		else { out += ' '.repeat(j + 2 - i); i = j + 2; mode = null; }
		continue;
		}
		const c = line[i], n = line[i + 1];
		if (c === '"') { const j = line.indexOf('"', i + 1); const e = j < 0 ? line.length : j + 1; out += line.slice(i, e); i = e; continue; }
		if (c === '/' && n === '/') { out += line.slice(i); i = line.length; continue; }
		if (c === '/' && n === '.') { mode = './'; out += '  '; i += 2; continue; }
		if (c === '/' && n === '*') { mode = '*/'; out += '  '; i += 2; continue; }
		out += c; i++;
	}
	return out;
	});
}

const indentOf = (s) => s.length - s.trimStart().length;
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’‘`´]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();

// titres collés à gauche, suivis d'un { (même ligne) ou d'un { seul sur la ligne suivante
function findTitles(lines) {
	const out = [];
	const nextNonEmpty = (i) => { for (let j = i + 1; j < lines.length; j++) if (lines[j].trim() !== '') return j; return -1; };
	for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	if (line === '' || /^\s/.test(line) || SYMBOL_START.test(line)) continue;
	let title = null;
	const brace = line.indexOf('{');
	if (brace > 0) title = line.slice(0, brace).trim();
	else if (brace < 0) { const j = nextNonEmpty(i); if (j >= 0 && lines[j].trim() === '{') title = line.trim(); }
	if (title) out.push({ line: i, title });
	}
	return out;
}

// garde-fou : le titre doit être nomDuFichier ou nomDuFichier.suite
function checkTitles(lines, baseName) {
	const out = [];
	for (const { line, title } of findTitles(lines)) {
	if (!TITLE_SHAPE.test(title)) {
		out.push({ line, start: 0, end: title.length,
		message: `Titre invalide : attendu « ${baseName} » ou « ${baseName}.suite » (segments séparés par des points, sans point final).` });
	} else if (title !== baseName && !title.startsWith(baseName + '.')) {
		const first = title.split('.')[0];
		out.push({ line, start: 0, end: first.length,
		message: `Le titre doit commencer par le nom du fichier « ${baseName} » (trouvé : « ${first} »).` });
	}
	}
	return out;
}

// garde-fou : tout le texte doit être dans un bloc titre « nomDuFichier.suite { … } », fermé par un } collé à gauche.
// Renvoie une erreur par « étendue » de texte hors bloc (au 1er texte de l'étendue), pas une par ligne.
function checkOutsideBlocks(rawLines, lines, baseName) {
	const titleLines = new Set(findTitles(lines).map((t) => t.line));
	const stripComment = (s) => {                                    // texte sans le commentaire // (hors guillemets)
		let q = false;
		for (let i = 0; i < s.length; i++) {
			if (s[i] === '"') q = !q;
			else if (!q && s[i] === '/' && s[i + 1] === '/') return s.slice(0, i);
		}
		return s;
	};
	const out = [];
	let inBlock = false, run = null;
	const flush = () => { if (run) { out.push(run); run = null; } };
	for (let i = 0; i < lines.length; i++) {
		if (titleLines.has(i)) { inBlock = true; flush(); continue; }   // un titre ouvre un bloc (son { peut être sur la ligne suivante)
		if (inBlock) { if (/^\}\s*$/.test(lines[i])) inBlock = false; continue; }
		const trimmed = stripComment(lines[i]).trim();
		const isTable = /^\s*\/\./.test(rawLines[i]);                    // un tableau /. ./ hors bloc est du contenu, même s'il est masqué
		if (trimmed === '' && !isTable) continue;                        // lignes vides et commentaires : permis hors bloc
		const src = isTable ? rawLines[i] : lines[i];
		const start = src.length - src.trimStart().length;
		if (!run) run = { line: i, start, end: isTable ? src.trimEnd().length : start + trimmed.length, count: 0, closing: trimmed === '}' };
		run.count++;
	}
	flush();
	return out.map((r) => ({
		line: r.line, start: r.start, end: r.end,
		message: r.count === 1 && r.closing
			? 'Accolade fermante sans bloc titre ouvert.'
			: `Texte hors d'un bloc titre (${r.count} ligne${r.count > 1 ? 's' : ''}) : il doit être placé dans « ${baseName}.suite { … } ».`,
	}));
}

function blockEnd(lines, i, indent) {
	let end = i;
	for (let j = i + 1; j < lines.length; j++) {
	if (lines[j].trim() === '') continue;
	const ind = indentOf(lines[j]);
	if (ind > indent) { end = j; continue; }
	if (ind === indent && /^\s*[)}]/.test(lines[j])) end = j;
	break;
	}
	return end;
}

function keysFor(inner) {
	const keys = new Set([norm(inner)]);
	const c = inner.indexOf(':');
	if (c >= 0) { keys.add(norm(inner.slice(0, c))); keys.add(norm(inner.slice(c + 1))); }   // "periode 1 : 2026" -> "periode 1", "2026" et le tout
	keys.delete('');
	return [...keys];
}

// tous les points d'ancrage possibles : { kind: title|section|group, name, keys, line, start, end, indent, endLine }
function parseStructure(lines) {
	const items = [];
	for (const { line, title } of findTitles(lines))
	if (TITLE_SHAPE.test(title))
		items.push({ kind: 'title', name: title, keys: [norm(title)], line, start: 0, end: title.length, indent: 0, endLine: blockEnd(lines, line, 0) });
	lines.forEach((text, i) => {
	const m = OPENER.exec(text);
	if (!m) return;
	const inner = (m[2] !== undefined ? m[2] : m[3]).trim();
	if (/^[\s?:]*$/.test(inner)) return;                    // ignore les gabarits de légende : [??:??]()
	const start = text.indexOf(inner, text.indexOf(m[2] !== undefined ? '[' : '<'));
	const indent = m[1].length;
	items.push({ kind: m[2] !== undefined ? 'section' : 'group', name: inner, keys: keysFor(inner),
				line: i, start, end: start + inner.length, indent, endLine: blockEnd(lines, i, indent) });
	});
	items.sort((a, b) => a.line - b.line);
	const stack = [];
	for (const it of items) {
	while (stack.length && stack[stack.length - 1].indent >= it.indent) stack.pop();
	it.parent = stack.length ? stack[stack.length - 1] : null;
	stack.push(it);
	}
	return items;
}

// fin d'un contenu de # : premier symbole d'arrêt hors guillemets (mêmes règles que la grammaire)
function findEnd(s, from) {
	let inQuote = false;
	for (let i = from; i < s.length; i++) {
	const c = s[i], p = s[i - 1], n = s[i + 1];
	if (c === '"') { inQuote = !inQuote; continue; }
	if (inQuote) continue;
	if (':*;§@|#<[&'.includes(c)) return i;
	if (c === '+') return i;                     // + (vocabulaire) ou +> (suite) : la référence s'arrête
	if (c === '>' && p !== '+') return i;
	if (c === '-' && (i === 0 || /[\s!°^~]/.test(p))) return i;
	if ((c === '/' && n === '/') || (c === '~' && n === '~')) return i;
	}
	return s.length;
}

// références : le texte qui suit un # (hors guillemets et commentaires), découpé sur les virgules
function extractRefs(lines) {
	const refs = [];
	lines.forEach((line, ln) => {
	if (line.trimStart().startsWith('//')) return;
	let inQuote = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') { inQuote = !inQuote; continue; }
		if (inQuote) continue;
		if (c === '/' && line[i + 1] === '/') break;
		if (c !== '#') continue;
		const start = i + 1, end = findEnd(line, start);
		let pos = start;
		for (const part of line.slice(start, end).split(',')) {
		const raw = part.replace(/^\s+|\s+$/g, ''), off = pos + part.indexOf(raw);
		const text = raw.replace(/^"(.*)"$/, '$1').trim();
		if (text) refs.push({ line: ln, start: off, end: off + raw.length, text });
		pos += part.length + 1;
		}
		i = end - 1;
	}
	});
	return refs;
}

// entités : déclarées par « + terme : définition » (début de ligne), mentionnées par « @ entité » (n'importe où)
// -> { decls: [...], mentions: [...] } ; chaque élément : { key, text, line, start, end, lineEnd, def? }
function parseEntities(lines) {
	const decls = [], mentions = [];
	const collect = (out, line, ln, start, end, markAt, def) => {
	let pos = start, first = true;
	for (const part of line.slice(start, end).split(',')) {
		let text = part.trim(), off = pos + (part.length - part.trimStart().length);
		const m = /^[~°^!]+/.exec(text); if (m) { text = text.slice(m[0].length); off += m[0].length; }      // marqueurs en ligne
		const q = /^"(.*)"$/.exec(text); if (q) { text = q[1]; off += 1; }                                       // guillemets
		text = text.replace(/\s*\(.*$/, '').trim();                                                              // "x (explication)" -> "x"
		pos += part.length + 1;
		const hit = first ? markAt : off; first = false;
		if (!text || /^[?\s]*$/.test(text)) continue;                                                            // gabarits de légende : ???
		out.push({ key: norm(text), text, line: ln, start: off, hit: Math.min(hit, off), end: off + text.length, lineEnd: line.length, def });
	}
	};
	lines.forEach((line, ln) => {
	const d = /^(\s*)\+(?!>)/.exec(line);                                                                      // déclaration : + terme : définition
	if (d) {
		const end = findEnd(line, d[0].length);
		const def = line[end] === ':' ? line.slice(end + 1).replace(/\s*\/\/.*$/, '').trim().slice(0, 160) : '';
		collect(decls, line, ln, d[0].length, end, d[0].length - 1, def);
	}
	let inQuote = false;
	for (let i = 0; i < line.length; i++) {                                                                    // mentions : @ entité
		const c = line[i];
		if (c === '"') { inQuote = !inQuote; continue; }
		if (inQuote) continue;
		if (c === '/' && line[i + 1] === '/') break;
		if (c !== '@' || !(i === 0 || /[\s!°^~(]/.test(line[i - 1]))) continue;                                // pas dans une adresse e-mail
		const end = findEnd(line, i + 1);
		collect(mentions, line, ln, i + 1, end, i);
		i = end - 1;
	}
	});
	return { decls, mentions };
}

// Le curseur est-il dans une mention « @ entité » ? -> { start, typed } (start = colonne où commence le texte de l'entité) ou null
function mentionContext(before) {
	const at = before.lastIndexOf('@');
	if (at < 0 || !(at === 0 || /[\s!°^~(]/.test(before[at - 1]))) return null;           // pas dans une adresse e-mail
	const head = before.slice(0, at);
	if (head.includes('//') || (head.split('"').length - 1) % 2 === 1) return null;        // ni dans un commentaire, ni dans une chaîne
	const rest = before.slice(at + 1);
	if (findEnd(rest, 0) !== rest.length) return null;                                      // un : ; * # … a déjà fermé la mention
	const comma = rest.lastIndexOf(',');                                                    // « @ a, b » : on propose pour le 2e
	const segStart = at + 1 + (comma >= 0 ? comma + 1 : 0);
	const lead = before.slice(segStart).match(/^\s*/)[0].length;
	return { start: segStart + lead, typed: before.slice(segStart + lead), afterAt: before.endsWith('@') };
}

// Le curseur est-il dans une référence « # cible » ? -> { start, typed, quoted, afterHash } ou null
function refContext(before) {
	const at = before.lastIndexOf('#');
	if (at < 0 || !(at === 0 || /[\s!°^~(]/.test(before[at - 1]))) return null;
	const head = before.slice(0, at);
	if (head.includes('//') || (head.split('"').length - 1) % 2 === 1) return null;        // ni commentaire, ni chaîne
	const rest = before.slice(at + 1);
	if (findEnd(rest, 0) !== rest.length) return null;                                      // un : ; * @ … a déjà fermé la référence
	let inQ = false, segStart = 0;
	for (let i = 0; i < rest.length; i++) { if (rest[i] === '"') inQ = !inQ; else if (rest[i] === ',' && !inQ) segStart = i + 1; }
	const seg = rest.slice(segStart);
	const lead = seg.match(/^\s*/)[0].length;
	let start = at + 1 + segStart + lead, quoted = false;
	if (seg[lead] === '"') {
	if ((seg.slice(lead).split('"').length - 1) % 2 === 0) return null;                   // guillemet déjà refermé : on est après la référence
	quoted = true; start += 1;
	}
	return { start, typed: before.slice(start), quoted, afterHash: before.endsWith('#') };
}

const KIND_RANK = { title: 0, section: 1, group: 2 };
const chainAt = (items, line) => items.filter((it) => it.line <= line && line <= it.endLine);   // blocs qui contiennent cette ligne
const short = (it) => { const c = it.name.indexOf(':'); return c >= 0 && it.name.slice(c + 1).trim() ? it.name.slice(c + 1).trim() : it.name; };
function pathOf(it) { const p = []; for (let x = it; x; x = x.parent) p.unshift(short(x)); return p.join('/'); }

// segs = ["jeu d'entreprise", "5"] : le dernier vise la cible, les autres des ancêtres, dans l'ordre (on peut sauter des niveaux)
function matchPath(item, segs) {
	if (!item.keys.includes(segs[segs.length - 1])) return false;
	const anc = []; for (let p = item.parent; p; p = p.parent) anc.unshift(p);
	let k = 0;
	for (const a of anc) if (k < segs.length - 1 && a.keys.includes(segs[k])) k++;
	return k === segs.length - 1;
}

// -> { hits: [{uri, item}], ambiguous: bool }
function resolveRef(index, text, fromUri, chain) {
	const all = [];
	for (const e of index.values()) for (const it of e.items) all.push({ uri: e.uri, item: it });
	const key = norm(text);
	let hits = all.filter((h) => h.item.keys.includes(key));                                 // 1) le texte tel quel
	if (!hits.length && text.includes('/')) {                                                 // 2) sinon un chemin
	const segs = text.split('/').map(norm);
	if (segs.length > 1 && segs.every(Boolean)) hits = all.filter((h) => matchPath(h.item, segs));
	}
	if (!hits.length) return { hits: [], ambiguous: false };
	const score = (h) => { let n = 0; for (let p = h.item.parent; p; p = p.parent) if (chain.includes(p)) n++; return n; };   // blocs partagés avec la référence
	const rank = (h) => [-score(h), h.uri.toString() === fromUri ? 0 : 1, KIND_RANK[h.item.kind]];
	const cmp = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
	hits.sort(cmp);
	const best = hits.filter((h) => cmp(h, hits[0]) === 0);                                  // ex æquo : on ne choisit pas en silence
	return { hits: best, ambiguous: best.length > 1 };
}

function buildTree(items) {
	const roots = [], stack = [];
	for (const it of items) {
	const node = { it, children: [] };
	while (stack.length && stack[stack.length - 1].it.indent >= it.indent) stack.pop();
	(stack.length ? stack[stack.length - 1].children : roots).push(node);
	stack.push(node);
	}
	return roots;
}

/* ======================================================================
	VS CODE : avertissements, aller à la définition (#), plan du fichier, recherche
	====================================================================== */

const baseNameOf = (document) => path.parse(document.fileName).name;
const linesOf = (text) => maskBlocks(text.replace(/\r/g, '').split('\n'));
const SEL = { language: 'note' };
const KINDS = () => ({ title: vscode.SymbolKind.Namespace, section: vscode.SymbolKind.Module, group: vscode.SymbolKind.Object });

let collection;
let isReady = false;
let ready = Promise.resolve();
const index = new Map();                         // uri.toString() -> { uri, items }

function reindex(uri, text) { const lines = linesOf(text); index.set(uri.toString(), { uri, items: parseStructure(lines), ents: parseEntities(lines) }); }

async function buildIndex() {
	const files = await vscode.workspace.findFiles('**/*.{note,cours}', '**/node_modules/**');
	for (const uri of files) {
	const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
	const text = open ? open.getText() : Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
	reindex(uri, text);
	}
	vscode.workspace.textDocuments.filter((d) => d.languageId === 'note').forEach((d) => reindex(d.uri, d.getText()));
}

// références # du document, chacune avec sa résolution (le document est réindexé avec son texte actuel)
function analyse(document) {
	const lines = linesOf(document.getText());
	const items = parseStructure(lines);
	index.set(document.uri.toString(), { uri: document.uri, items, ents: parseEntities(lines) });
	const from = document.uri.toString();
	return extractRefs(lines).map((r) => ({ r, res: resolveRef(index, r.text, from, chainAt(items, r.line)) }));
}

const where = (h) => `${path.basename(h.uri.fsPath)} l.${h.item.line + 1}`;

function refreshDiagnostics(document) {
	if (!collection || document.languageId !== 'note' || document.isUntitled) return;
	const lines = [];
	for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);
	const masked = maskBlocks(lines);
	const mk = (line, start, end, message, severity = vscode.DiagnosticSeverity.Warning) => {
	const d = new vscode.Diagnostic(new vscode.Range(line, start, line, end), message, severity);
	d.source = 'note-lang';
	return d;
	};
	const diags = checkTitles(masked, baseNameOf(document)).map((p) => mk(p.line, p.start, p.end, p.message));
	checkOutsideBlocks(lines, masked, baseNameOf(document)).forEach((p) => diags.push(mk(p.line, p.start, p.end, p.message, vscode.DiagnosticSeverity.Error)));
	if (isReady) {
	for (const { r, res } of analyse(document)) {
		if (!res.ambiguous) continue;
		const paths = res.hits.map((h) => pathOf(h.item));
		const message = new Set(paths).size === paths.length
		? `Référence ambiguë : ${res.hits.length} cibles. Précise avec un chemin, par exemple « ${paths[0]} » ou « ${paths[1]} ».`
		: `Référence ambiguë : ${res.hits.length} cibles ont exactement le même chemin (${res.hits.map(where).join(', ')}). Renomme l'une d'elles.`;
		diags.push(mk(r.line, r.start, r.end, message));
	}
	}
	collection.set(document.uri, diags);
}
const refreshAll = () => vscode.workspace.textDocuments.forEach(refreshDiagnostics);

const whereE = (t) => `${path.basename(t.uri.fsPath)}:${t.line + 1}`;
function entityAt(document, position) {
	const { decls, mentions } = parseEntities(linesOf(document.getText()));
	return [...decls, ...mentions].find((e) => e.line === position.line && position.character >= e.hit && position.character <= e.end) || null;
}
function entityTargets(key) {
	const decls = [], mentions = [];
	for (const e of index.values()) {
	if (!e.ents) continue;
	e.ents.decls.forEach((d) => d.key === key && decls.push({ ...d, uri: e.uri }));
	e.ents.mentions.forEach((m) => m.key === key && mentions.push({ ...m, uri: e.uri }));
	}
	const byPlace = (a, b) => (a.uri.fsPath === b.uri.fsPath ? a.line - b.line : a.uri.fsPath < b.uri.fsPath ? -1 : 1);
	return { decls: decls.sort(byPlace), mentions: mentions.sort(byPlace) };
}
const entityRange = (t) => new vscode.Range(t.line, t.start, t.line, t.end);
const originRange = (t) => new vscode.Range(t.line, t.hit, t.line, t.end);

// toutes les façons de choisir k indices parmi 0..n-1, dans l'ordre (la racine d'abord)
function subsets(n, k, from = 0) {
	if (k === 0) return [[]];
	const out = [];
	for (let i = from; i <= n - k; i++) for (const rest of subsets(n, k - 1, i + 1)) out.push([i, ...rest]);
	return out;
}

// propositions pour « # » : chaque cible est insérée sous la forme la plus courte qui retombe bien sur elle
function refCompletions(document, position, ctx) {
	if (!ctx) return undefined;
	reindex(document.uri, document.getText());
	const fromUri = document.uri.toString();
	const chain = chainAt(index.get(fromUri).items, position.line);
	const range = new vscode.Range(position.line, ctx.start, position.line, position.character);
	const kinds = { title: vscode.CompletionItemKind.Module, section: vscode.CompletionItemKind.Folder, group: vscode.CompletionItemKind.Struct };
	const label = { title: 'titre', section: '[ ]', group: '< >' };
	const items = [];
	for (const e of index.values()) {
	for (const it of e.items) {
		const names = []; for (let x = it; x; x = x.parent) names.unshift(x.name);
		if (names.some((n) => n.includes(',') || n.includes('/'))) continue;                  // une virgule ou un / casserait la référence
		let ref = names.join('/');                                                            // à défaut : le chemin complet
		const leaf = names[names.length - 1], anc = names.slice(0, -1);
		search: for (let k = 0; k <= anc.length; k++) {                                       // le plus court d'abord ; on peut sauter des niveaux
		for (const pick of subsets(anc.length, k)) {                                        // à longueur égale : en partant du titre (racine)
			const cand = [...pick.map((i) => anc[i]), leaf].join('/');
			const res = resolveRef(index, cand, fromUri, chain);
			if (!res.ambiguous && res.hits.length === 1 && res.hits[0].item === it) { ref = cand; break search; }
		}
		}
		const needQuotes = !ctx.quoted && findEnd(ref, 0) !== ref.length;                      // le : ; * … fermeraient le bloc #
		const ci = new vscode.CompletionItem(it.name, kinds[it.kind]);
		ci.detail = `${label[it.kind]} · ${path.basename(e.uri.fsPath)}:${it.line + 1}` + (it.parent ? ` · ${pathOf(it.parent)}` : '');
		let shared = 0; for (let p = it.parent; p; p = p.parent) if (chain.includes(p)) shared++;
		ci.sortText = String(9 - Math.min(shared, 9)) + (e.uri.toString() === fromUri ? '0' : '1') + path.basename(e.uri.fsPath) + String(it.line).padStart(6, '0');
		ci.filterText = names.join('/');
		ci.range = range;
		ci.insertText = (ctx.afterHash && !ctx.quoted ? ' ' : '') + (needQuotes ? `"${ref}"` : ref);
		items.push(ci);
	}
	}
	return items;
}

function toSymbols(roots) {
	const kinds = KINDS();
	return roots.map(({ it, children }) => {
	const s = new vscode.DocumentSymbol(it.name, it.kind === 'title' ? 'titre' : it.kind === 'section' ? '[ ]' : '< >', kinds[it.kind],
		new vscode.Range(it.line, 0, it.endLine, 0), new vscode.Range(it.line, it.start, it.line, it.end));
	s.children = toSymbols(children);
	return s;
	});
}

/* ======================================================================
	Commande existante : générer une classe + constructeur (inchangée)
	====================================================================== */

function parseAttributeLine(line) {
	const tokens = line.trim().split(/\s+/).filter(Boolean);
	if (tokens.length < 2) return null;
	const varName = tokens[tokens.length - 1];
	const type = tokens[tokens.length - 2];
	const modifiers = tokens.slice(0, tokens.length - 2).join(' ') || 'private';
	return { modifiers, type, varName };
}
function generateClass(className, attributes) {
	const fieldLines = attributes.map((a) => `\t${a.modifiers} ${a.type} ${a.varName};`);
	const params = attributes.map((a) => `${a.type} ${a.varName}`).join(', ');
	const assignments = attributes.map((a) => `\t\tthis.${a.varName} = ${a.varName};`);
	return [`public class ${className}`, '{', ...fieldLines, '', `\tpublic ${className}(${params})`, '\t{', ...assignments, '\t}', '}'].join('\n');
}

function activate(context) {
	const sub = (d) => context.subscriptions.push(d);

	collection = vscode.languages.createDiagnosticCollection('note-lang');
	sub(collection);
	vscode.workspace.textDocuments.forEach(refreshDiagnostics);

	// index des titres, sections et groupes de tout l'espace de travail
	ready = buildIndex().then(() => { isReady = true; refreshAll(); });
	sub(vscode.workspace.onDidOpenTextDocument((d) => { if (d.languageId === 'note') reindex(d.uri, d.getText()); refreshAll(); }));
	sub(vscode.workspace.onDidChangeTextDocument((e) => { if (e.document.languageId === 'note') reindex(e.document.uri, e.document.getText()); refreshAll(); }));
	sub(vscode.workspace.onDidCloseTextDocument((d) => collection.delete(d.uri)));
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.{note,cours}');
	const fromDisk = async (uri) => { reindex(uri, Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')); refreshAll(); };
	sub(watcher); sub(watcher.onDidCreate(fromDisk)); sub(watcher.onDidChange(fromDisk)); sub(watcher.onDidDelete((uri) => { index.delete(uri.toString()); refreshAll(); }));

	// Ctrl+clic / F12 sur une référence # : saute à la cible, ou ouvre un aperçu si plusieurs restent possibles
	sub(vscode.languages.registerDefinitionProvider(SEL, {
	async provideDefinition(document, position) {
		await ready;
		const found = analyse(document).find(({ r }) => r.line === position.line && position.character >= r.start && position.character <= r.end);
		if (!found) {                                                           // pas une référence # : une entité (+ ou @) ?
		const ent = entityAt(document, position);
		if (!ent) return undefined;
		const { decls, mentions } = entityTargets(ent.key);
		if (!mentions.length) return undefined;                 // une déclaration que personne ne mentionne : on ne réagit pas
		const origin = originRange(ent);
		const isDecl = decls.some((d) => d.line === ent.line && d.start === ent.start && d.uri.toString() === document.uri.toString());
		return (isDecl ? decls : [...decls, ...mentions]).map((t) => ({
			originSelectionRange: origin, targetUri: t.uri,
			targetRange: new vscode.Range(t.line, 0, t.line, t.lineEnd), targetSelectionRange: entityRange(t) }));
		}
		if (!found.res.hits.length) return undefined;
		const { r, res } = found;
		return res.hits.map(({ uri, item }) => ({
		originSelectionRange: new vscode.Range(r.line, r.start, r.line, r.end),
		targetUri: uri,
		targetRange: new vscode.Range(item.line, 0, item.endLine, 0),
		targetSelectionRange: new vscode.Range(item.line, item.start, item.line, item.end),
		}));
	},
	}));

	// à la frappe d'un # : toutes les cibles (titres, [ ], < >) ; d'un @ : les entités déjà déclarées (+), puis déjà mentionnées
	sub(vscode.languages.registerCompletionItemProvider(SEL, {
	async provideCompletionItems(document, position) {
		await ready;
		const before = document.lineAt(position.line).text.slice(0, position.character);
		const ctx = mentionContext(before);
		if (!ctx) return refCompletions(document, position, refContext(before));
		reindex(document.uri, document.getText());
		const declared = new Map(), mentioned = new Map();
		for (const e of index.values()) {
		if (!e.ents) continue;
		const here = e.uri.toString() === document.uri.toString();
		for (const d of e.ents.decls) if (!declared.has(d.key)) declared.set(d.key, { ...d, uri: e.uri });
		for (const m of e.ents.mentions) {
			if (here && m.line === position.line && position.character >= m.hit && position.character <= m.end) continue;   // la mention qu'on est en train de taper
			const cur = mentioned.get(m.key) || { ...m, uri: e.uri, count: 0 };
			cur.count++; mentioned.set(m.key, cur);
		}
		}
		const range = new vscode.Range(position.line, ctx.start, position.line, position.character);
		const make = (t, kind, detail, sort, doc) => {
		const it = new vscode.CompletionItem(t.text, kind);
		it.detail = detail; it.sortText = sort + t.text.toLowerCase(); it.filterText = t.text; it.range = range;
		it.insertText = (ctx.afterAt ? ' ' : '') + t.text;                       // « @ » seul -> on ajoute l'espace de ton style
		if (doc) it.documentation = doc;
		return it;
		};
		const items = [];
		for (const t of declared.values()) items.push(make(t, vscode.CompletionItemKind.Class, `déclaré · ${whereE(t)}`, '0', t.def));
		for (const t of mentioned.values())
		if (!declared.has(t.key)) items.push(make(t, vscode.CompletionItemKind.Reference, `mentionné ${t.count} fois`, '1'));
		return items;
	},
	}, '@', '#'));

	// Shift+F12 sur une entité : toutes les mentions (et la déclaration)
	sub(vscode.languages.registerReferenceProvider(SEL, {
	async provideReferences(document, position, context) {
		await ready;
		reindex(document.uri, document.getText());
		const ent = entityAt(document, position);
		if (!ent) return undefined;
		const { decls, mentions } = entityTargets(ent.key);
		if (!mentions.length) return undefined;
		return [...(context.includeDeclaration ? decls : []), ...mentions].map((t) => new vscode.Location(t.uri, entityRange(t)));
	},
	}));

	// survol d'une entité : définition + où elle est mentionnée
	sub(vscode.languages.registerHoverProvider(SEL, {
	async provideHover(document, position) {
		await ready;
		reindex(document.uri, document.getText());
		const ent = entityAt(document, position);
		if (!ent) return undefined;
		const { decls, mentions } = entityTargets(ent.key);
		if (!mentions.length) return undefined;
		const md = new vscode.MarkdownString();
		md.appendMarkdown(`**${ent.text}** — ${decls.length ? 'déclaré' : 'non déclaré'}, ${mentions.length} mention${mentions.length > 1 ? 's' : ''}\n\n`);
		decls.slice(0, 2).forEach((d) => md.appendMarkdown(`${whereE(d)}${d.def ? ' : ' + d.def : ''}\n\n`));
		if (mentions.length) md.appendMarkdown('Mentions : ' + mentions.slice(0, 8).map(whereE).join(', ') + (mentions.length > 8 ? ` … (+${mentions.length - 8})` : ''));
		return new vscode.Hover(md, originRange(ent));
	},
	}));

	// plan du fichier (Outline, fil d'Ariane, Ctrl+Shift+O)
	sub(vscode.languages.registerDocumentSymbolProvider(SEL, {
	provideDocumentSymbols(document) { return toSymbols(buildTree(parseStructure(linesOf(document.getText())))); },
	}));

	// aller à un titre dans tous les fichiers (Ctrl+T)
	sub(vscode.languages.registerWorkspaceSymbolProvider({
	async provideWorkspaceSymbols(query) {
		await ready;
		const q = norm(query || ''), out = [], kinds = KINDS();
		for (const e of index.values()) for (const it of e.items)
		if (!q || it.keys.some((k) => k.includes(q)))
			out.push(new vscode.SymbolInformation(it.name, kinds[it.kind], path.parse(e.uri.fsPath).name,
			new vscode.Location(e.uri, new vscode.Range(it.line, it.start, it.line, it.end))));
		return out;
	},
	}));

	// commande de génération de classe (inchangée)
	sub(vscode.commands.registerCommand('noteLang.generateClassConstructor', async () => {
	const editor = vscode.window.activeTextEditor;
	if (!editor) { vscode.window.showErrorMessage('Aucun éditeur actif.'); return; }
	const selection = editor.selection;
	const text = editor.document.getText(selection);
	if (!text.trim()) { vscode.window.showErrorMessage('Sélectionne d\'abord les lignes "modifier type variable" (une par ligne).'); return; }
	const attributes = [], invalid = [];
	for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
		const p = parseAttributeLine(line);
		if (p) attributes.push(p); else invalid.push(line);
	}
	if (invalid.length) vscode.window.showWarningMessage(`Ligne(s) ignorée(s), format attendu "[modifier] type variable" : ${invalid.join(' | ')}`);
	if (!attributes.length) { vscode.window.showErrorMessage('Aucune ligne valide trouvée.'); return; }
	const className = await vscode.window.showInputBox({ prompt: 'Nom de la classe', value: 'MaClasse' });
	if (!className) return;
	await editor.edit((b) => b.replace(selection, generateClass(className, attributes)));
	}));
}

function deactivate() {}

module.exports = { activate, deactivate, _checkTitles: checkTitles, _checkOutsideBlocks: checkOutsideBlocks, _parseStructure: parseStructure, _extractRefs: extractRefs, _norm: norm,
					_resolveRef: resolveRef, _chainAt: chainAt, _pathOf: pathOf, _buildTree: buildTree, _maskBlocks: maskBlocks, _parseEntities: parseEntities, _mentionContext: mentionContext, _refContext: refContext };