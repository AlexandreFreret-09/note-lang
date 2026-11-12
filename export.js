'use strict';
/* ======================================================================
	EXPORT : Markdown et PDF
	Lecture de la notation -> modèle commun -> deux rendus.
	Fonctions pures : aucune dépendance à VS Code (tout ce qui touche au disque est fourni par l'appelant, dans ctx).
	====================================================================== */

// symboles de l'export (tous présents dans DejaVu Sans, la police de secours du PDF)
const SYMBOLS = { done: '✔', started: '▶', continuous: '↻', new: '★', canceled: '✘', unreliable: '⚠' };
const STATUS = new Set(['done', 'started', 'continuous', 'new', 'canceled']);
const CONNECTOR = ' – ';                  // « _ » entre deux espaces : « …communication _ TIC », « …concurrents _ et son évolution »
const MARKERS = new Set(['~', '°', '^', '!']);
const Q0 = '\uE000', Q1 = '\uE001';       // entourent un passage entre guillemets (texte protégé) pendant la lecture d'une ligne

/* ---------------------------------------------------------------- 1. lignes */

const indentOf = (s) => { let w = 0; for (const ch of s) { if (ch === '\t') w += 4; else if (ch === ' ') w += 1; else break; } return w; };

// retire la marge commune d'un bloc plat (sans toucher à l'indentation interne du code)
function dedent(lines) {
	while (lines.length && !lines[0].trim()) lines.shift();
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	let prefix = null;
	for (const l of lines) {
		if (!l.trim()) continue;
		const lead = l.match(/^[ \t]*/)[0];
		if (prefix === null) prefix = lead;
		else { let k = 0; while (k < prefix.length && k < lead.length && prefix[k] === lead[k]) k++; prefix = prefix.slice(0, k); }
	}
	return lines.map((l) => (prefix ? l.replace(new RegExp('^' + prefix.replace(/[\t ]/g, (c) => (c === '\t' ? '\\t' : ' '))), '') : l));
}

// enlève les commentaires (// et /* */) hors guillemets ; open = un /* reste ouvert à la fin de la ligne
function stripComments(line) {
	let out = '', inQ = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') inQ = !inQ;
		if (!inQ && c === '/' && line[i + 1] === '/') return { text: out, open: false };
		if (!inQ && c === '/' && line[i + 1] === '*') {
			const e = line.indexOf('*/', i + 2);
			if (e < 0) return { text: out, open: true };
			i = e + 1; continue;
		}
		out += c;
	}
	return { text: out, open: false };
}

// lignes qui interrompent un texte entre guillemets resté ouvert : on ne le prolonge pas sur elles
const STRUCTURAL = /^(\)|\}|\[[^\]]*\]\s*[({]|<[^>]*>\s*[({])$/;
const NEW_LINE_SYMBOL = /^([-+*&#@;§]|=>|>>|:>|\/>|->)(\s|$)/;

// -> [{ type: 'line', indent, text } | { type: 'flat', indent, text } | { type: 'blank' }]
// Un guillemet resté ouvert en fin de ligne prolonge la ligne sur les suivantes (au plus 12) : « "texte … » ou « texte,"  »/« "suite … » :
// les deux écritures donnent une seule ligne logique, sans puce ni retrait sur les lignes de suite.
function readLines(text) {
	const out = [], lines = text.replace(/\r\n?/g, '\n').split('\n');
	let inComment = false, openQuote = false, joined = 0;
	for (let n = 0; n < lines.length; n++) {
		let line = lines[n];
		if (inComment) { const e = line.indexOf('*/'); if (e < 0) continue; line = line.slice(e + 2); inComment = false; }
		const t = line.trim();
		if (!openQuote && t.startsWith('/.')) {                             // bloc plat /. … ./ : recopié tel quel
			const indent = indentOf(line), rest = t.slice(2), end = rest.indexOf('./');
			if (end >= 0) { out.push({ type: 'flat', indent, text: rest.slice(0, end).trim() }); continue; }
			const buf = rest.trim() ? [rest] : [];
			let m = n + 1;
			for (; m < lines.length; m++) {
				const e = lines[m].indexOf('./');
				if (e >= 0) { buf.push(lines[m].slice(0, e)); break; }
				buf.push(lines[m]);
			}
			n = m; out.push({ type: 'flat', indent, text: dedent(buf).join('\n') }); continue;
		}
		if (!t) {                                                           // ligne vide : un saut, gardé (sauf à l'intérieur d'un guillemet ouvert)
			if (openQuote) continue;
			if (out.length && out[out.length - 1].type !== 'blank') out.push({ type: 'blank' });
			continue;
		}
		const s = stripComments(line); if (s.open) inComment = true;
		const x = s.text.trim(); if (!x) continue;
		const odd = (x.match(/"/g) || []).length % 2 === 1;
		if (openQuote && joined < 12 && !STRUCTURAL.test(x) && !NEW_LINE_SYMBOL.test(x)) { out[out.length - 1].text += ' ' + x; joined++; openQuote = openQuote !== odd; continue; }
		out.push({ type: 'line', indent: indentOf(s.text), text: x });
		openQuote = odd; joined = 0;
	}
	return out;
}

/* ---------------------------------------------------------------- 2. une ligne : éléments et texte en ligne */

// « | » suivi d'un symbole = l'élément qui suit est ignoré (barré à l'export)
const ignoredPrefix = (s, i) => /^(\|\||->|-|\+(?!>)|:(?!>)|=>|>>|>|:>|\/>|[*&;#@§!~])/.test(s.slice(i + 1));

// -> { elements: [{ kind, ignored, raw }], dev }   raw = texte de l'élément (guillemets remplacés par Q0 … Q1)
function lexLine(s) {
	const elements = []; let dev = false, devEnd = false, inQ = false, pending = false, cur = { kind: 'text', ignored: false, raw: '' };
	const finish = () => { if (cur.raw.trim() || (cur.kind !== 'text' && STATUS.has(cur.kind))) elements.push({ ...cur, raw: cur.raw.trim() }); };
	const start = (kind, skip) => { finish(); cur = { kind, ignored: pending, raw: '' }; pending = false; return skip; };
	let i = 0;
	while (i < s.length) {
		const c = s[i], two = s.substr(i, 2);
		if (c === '"') { inQ = !inQ; cur.raw += inQ ? Q0 : Q1; i++; continue; }
		if (inQ) { cur.raw += c; i++; continue; }
		if (two === '//') break;
		if (two === '->') { devEnd = (elements.length > 0 || cur.raw.trim() !== '') && s.slice(i + 2).trim() === ''; dev = true; finish(); cur = { kind: 'text', ignored: false, raw: '' }; i += 2; continue; }
		if (two === '+>') { finish(); cur = { kind: 'text', ignored: false, raw: '' }; i += 2; continue; }
		if (two === '=>') { i += start('done', 2); continue; }
		if (two === ':>') { i += start('new', 2); continue; }
		if (two === '/>') { i += start('canceled', 2); continue; }
		if (two === '>>') { i += start('continuous', 2); continue; }
		if (two === '~~') { i += start('unreliable', 2); continue; }
		if (c === '>') { i += start('started', 1); continue; }
		if (c === '-' && (i === 0 || /[\s!°^~]/.test(s[i - 1]) || (pending && s[i - 1] === '|'))) { i += start('info', 1); continue; }   // « |- » : la puce ignorée suit directement le |
		if (c === '+') { i += start('term', 1); continue; }
		if (c === ':') { i += start('def', 1); continue; }
		if (c === ';') { i += start('detail', 1); continue; }
		if (c === '*') { i += start('example', 1); continue; }
		if (c === '&') { i += start('notice', 1); continue; }
		if (c === '#') { i += start('source', 1); continue; }
		if (c === '@') { i += start('mention', 1); continue; }
		if (c === '§') { i += start('context', 1); continue; }
		if (c === '|' && ignoredPrefix(s, i)) { pending = true; i++; continue; }
		cur.raw += c; i++;
	}
	finish();
	return { elements, dev, devEnd };
}

// un passage entre guillemets est mis en police de code s'il ressemble à du code : un symbole seul (+ - && !) ou un caractère typique (* & | < > [ ] { } = + / \\ _ # ~ ^ ;)
const isCodeLike = (t) => /\S/.test(t) && (!/[\p{L}\p{N}]/u.test(t) || /[*&|<>[\]{}=+\\_#~^;`]/.test(t));   // un passage d'espaces seules n'est pas du code

// texte d'un élément -> morceaux { t, b, i, u, s, code, q } : ° gras, ^ souligné, ! italique, ~ incertain (jusqu'au symbole suivant)
function inlineRuns(raw, opts = {}) {
	const markers = opts.markers !== false;
	const runs = []; let mode = null, buf = '';
	const emit = (t, extra) => { if (t) runs.push({ t, b: mode === '°', u: mode === '^', i: mode === '!', q: mode === '~', ...extra }); };
	const flush = () => { emit(buf); buf = ''; };
	for (let i = 0; i < raw.length;) {
		const c = raw[i];
		if (c === Q0) { flush(); const j = raw.indexOf(Q1, i + 1), end = j < 0 ? raw.length : j; emit(raw.slice(i + 1, end), { code: isCodeLike(raw.slice(i + 1, end)) || undefined }); i = j < 0 ? raw.length : j + 1; continue; }
		if (markers && MARKERS.has(c)) {
			// « faire^en Java » : un marqueur collé à la fin d'un mot est une frontière (il couvre jusqu'au symbole suivant, il ne peut pas être au milieu d'un mot)
			const before = buf || (runs.length ? runs[runs.length - 1].t : '');
			if (/[\p{L}\p{N}.,;:!?)\]»”’%]$/u.test(before)) buf += ' ';
			flush(); mode = c; i++; continue;
		}
		if (c === ',') { flush(); mode = null; buf = ','; flush(); i++; continue; }
		if (c === '_') {
			flush();
			if (/\s$/.test(raw.slice(0, i)) && /^\s/.test(raw.slice(i + 1))) {
				while (runs.length && /^\s*$/.test(runs[runs.length - 1].t)) runs.pop();
				if (runs.length) runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, '');          // le tiret apporte ses deux espaces
				mode = null; buf = CONNECTOR; flush(); i++; while (raw[i] === ' ') i++; continue;
			}
			mode = null; buf = '_'; flush(); i++; continue;
		}
		if (raw.startsWith('...', i)) { buf += '(à venir)'; i += 3; continue; }
		if (raw.startsWith('..', i)) { buf += '…'; i += 2; continue; }
		buf += c; i++;
	}
	flush();
	// espaces de bordure sortis des passages mis en forme ; « (?) » après un passage incertain
	const out = [];
	for (let k = 0; k < runs.length; k++) {
		const r = { ...runs[k] }; out.push(r);
		const next = runs[k + 1];
		if (r.q && !(next && next.q)) out.push({ t: ' (?)' });
	}
	return out.map((r) => (r.q ? { ...r, q: undefined } : r));
}

/* ---------------------------------------------------------------- 3. structure : blocs, sections, listes, éléments */

const SECTION = /^\[\s*([^\]]*?)\s*\]\s*([({])$/, LIST = /^<\s*([^>]*?)\s*>\s*([({])$/;

function splitTitle(raw) {
	const m = raw.match(/^([^:]{1,12}?)\s*:\s*(\S.*)$/);
	return m ? { label: m[1].trim(), title: m[2].trim() } : { label: '', title: raw.trim() };
}

// pose un nœud dans le conteneur, selon l'indentation ; un saut de ligne en attente est inséré juste avant
function attach(container, node, gap) {
	const st = container.stack;
	while (st.length && st[st.length - 1].indent >= node.indent) st.pop();
	const arr = st.length ? st[st.length - 1].children : container.children;
	if (gap && arr.length && arr[arr.length - 1].type !== 'gap') arr.push({ type: 'gap' });
	arr.push(node);
	if (node.type === 'item') st.push(node);
}

// -> { blocks: [{ title, children }] }   enfants : section, list, item, flat, gap
function parseNotes(text, baseName) {
	const items = readLines(text), blocks = [];
	let block = null, gap = false; const open = [];
	const mkBlock = (title) => ({ type: 'block', title, children: [], stack: [] });
	const top = () => (open.length ? open[open.length - 1] : block);
	for (let k = 0; k < items.length; k++) {
		const it = items[k];
		if (it.type === 'blank') { gap = block !== null; continue; }
		if (!block) {
			if (it.type === 'line' && it.indent === 0 && /\{$/.test(it.text)) { block = mkBlock(it.text.replace(/\s*\{$/, '')); blocks.push(block); gap = false; continue; }
			if (it.type === 'line' && it.indent === 0 && items[k + 1] && items[k + 1].type === 'line' && items[k + 1].text === '{') { block = mkBlock(it.text); blocks.push(block); k++; gap = false; continue; }
			block = mkBlock(baseName || ''); blocks.push(block);                   // texte hors bloc : bloc implicite
		}
		if (it.type === 'flat') { attach(top(), { type: 'flat', indent: it.indent, text: it.text, children: [] }, gap); gap = false; continue; }
		const t = it.text;
		if (t === '}' && it.indent === 0) { block = null; open.length = 0; gap = false; continue; }
		if ((t === ')' || t === '}') && open.length) { const o = open[open.length - 1]; if ((t === ')') === (o.opener === '(')) { open.pop(); gap = false; continue; } }
		let m = t.match(SECTION), kind = 'section';
		if (!m) { m = t.match(LIST); kind = 'list'; }
		if (m) {
			const { label, title } = kind === 'section' ? splitTitle(m[1]) : { label: '', title: m[1].trim() };
			const node = { type: kind, label, title, opener: m[2], indent: it.indent, children: [], stack: [] };
			const parent = open.length ? open[open.length - 1] : block;
			if (gap && parent.children.length && parent.children[parent.children.length - 1].type !== 'gap') parent.children.push({ type: 'gap' });
			parent.children.push(node); open.push(node); gap = false; continue;
		}
		const lex = lexLine(t);
		if (lex.elements.length === 0 && !lex.dev) continue;
		// « 1 - texte » : un nombre avant le tiret est un numéro de liste, pas une puce précédée d'un nombre
		let number = null;
		if (lex.elements.length >= 2 && lex.elements[0].kind === 'text' && /^\d+$/.test(lex.elements[0].raw) && lex.elements[1].kind === 'info') number = parseInt(lex.elements.shift().raw, 10);
		attach(top(), { type: 'item', indent: it.indent, elements: lex.elements, dev: lex.dev, devEnd: lex.devEnd, number, children: [] }, gap); gap = false;
	}
	blocks.forEach((b) => { b.children = fold(b.children, false); });
	return { blocks };
}

// Dans une liste ou un développement, seules les lignes - + et § (et « n - ») ont une puce. Un élément secondaire en début de ligne
// (: ; * & # @) s'imbrique dans l'élément précédent : il se rattache à la puce qui le précède, même après une ligne vide.
const BULLET_KINDS = new Set(['info', 'term', 'context']), SECONDARY_KINDS = new Set(['def', 'detail', 'example', 'notice', 'source', 'mention']);
const kindOf = (item) => (item.elements[0] ? item.elements[0].kind : 'text');
const isBullet = (item) => item.number != null || BULLET_KINDS.has(kindOf(item));
const isSecondary = (item) => item.number == null && SECONDARY_KINDS.has(kindOf(item));

function fold(children, bullets) {
	let list = children;
	if (bullets) {
		list = []; let prev = null, gap = false;
		for (const n of children) {
			if (n.type === 'gap') { list.push(n); gap = true; continue; }
			if (n.type === 'item' && isSecondary(n) && prev && !prev.children.length) {
				if (gap) { list.pop(); n.gapBefore = true; }               // la ligne vide devient un espace avant la ligne rattachée
				(prev.extras = prev.extras || []).push(n); gap = false; continue;
			}
			list.push(n); gap = false;
			prev = n.type === 'item' && isBullet(n) ? n : null;
		}
	}
	for (const n of list) {
		if (n.type === 'item') { n.children = fold(n.children, true); (n.extras || []).forEach((e) => { e.children = fold(e.children, true); }); }
		else if (n.type === 'list') n.children = fold(n.children, true);
		else if (n.type === 'section') n.children = fold(n.children, false);
	}
	return list;
}

/* ---------------------------------------------------------------- 4. une ligne -> morceaux prêts à rendre */

const plain = (runs) => runs.map((r) => r.t).join('');
const sameStyle = (a, b) => !a.link && !b.link && !a.anchor && !b.anchor && !a.sym && !b.sym && !!a.b === !!b.b && !!a.i === !!b.i && !!a.u === !!b.u && !!a.s === !!b.s && !!a.code === !!b.code;
function coalesce(runs) {
	const out = [];
	for (const r of runs) { const last = out[out.length - 1]; if (last && sameStyle(last, r)) last.t += r.t; else out.push({ ...r }); }
	return out;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const bold = (runs) => runs.map((r) => ({ ...r, b: true }));
const listTitleRuns = (n) => { const r = titleRuns(n.title); return coalesce(/:\s*$/.test(plain(r)) ? r : [...r, { t: ' :' }]); };   // le titre d'une liste finit par « : »

// espaces en double (guillemets de raccord d'un texte sur plusieurs lignes, séparateurs) -> un seul, y compris entre deux morceaux
function tidy(runs) {
	const out = [];
	for (const r of runs) {
		let t = r.code ? r.t : r.t.replace(/ {2,}/g, ' ');
		const prev = out[out.length - 1];
		if (!r.code && prev && !prev.code && / $/.test(prev.t) && /^ /.test(t)) t = t.replace(/^ +/, '');
		out.push({ ...r, t });
	}
	return out.filter((r) => r.t !== '');
}

// « (a, b) » -> « a, b » : évite une double parenthèse quand le texte avait déjà les siennes
function unparen(runs) {
	const t = plain(runs).trim();
	if (!(t.startsWith('(') && t.endsWith(')') && !t.slice(1, -1).includes('('))) return runs;
	const out = runs.map((r) => ({ ...r })); out[0].t = out[0].t.replace(/^\s*\(/, ''); out[out.length - 1].t = out[out.length - 1].t.replace(/\)\s*$/, ''); return out;
}
const LABELS = { example: ['exemple', /^exemples?\b/i], notice: ['remarque', /^remarques?\b/i] };

// titres de sections et de listes : le _ entre espaces, « .. » et les guillemets s'y lisent comme dans une ligne ; pas de marqueurs collés
const toQuoted = (s) => s.replace(/"([^"]*)"/g, (m, x) => Q0 + x + Q1);
const titleRuns = (raw) => coalesce(inlineRuns(toQuoted(raw), { markers: false }));
const headingPrefix = (s) => (s.label ? (/^[0-9IVXLCivxlcA-Za-z]{1,6}$/.test(s.label) ? `${s.label}. ` : `${s.label} – `) : '');
const headingRuns = (s) => coalesce([{ t: headingPrefix(s) }, ...titleRuns(s.title)].filter((r) => r.t !== ''));
const headingText = (s) => plain(headingRuns(s));

// ctx.resolveFile(texte) -> { path, isImage } ou null ; renvoie { runs, attachments, paragraph, status, number }
function composeLine(item, ctx) {
	const parts = [], attachments = []; let first = true, paragraph = false, status = null;
	const sep = () => (first ? '' : ' ');
	for (const el of item.elements) {
		let runs = inlineRuns(el.raw);
		if (el.ignored) runs = runs.map((r) => ({ ...r, s: true }));
		const kind = el.kind;
		if (kind === 'context') { runs = bold(runs); if (first) paragraph = true; }
		if (kind === 'term') runs = bold(runs);
		if (kind === 'mention') runs = runs.map((r) => ({ ...r, i: true, u: true }));          // italique ET souligné : à ne pas confondre avec ! (italique seul)
		let piece;
		if (kind === 'def') piece = first ? [{ t: 'Définition : ', i: true, b: true }, ...runs] : [{ t: ' : ' }, ...runs];
		else if (kind === 'detail') piece = [{ t: first ? '(' : ' (' }, ...unparen(runs), { t: ')' }];   // ; = entre parenthèses
		else if (kind === 'example' || kind === 'notice') {
			const [word, re] = LABELS[kind], txt = plain(runs).trim();
			if (first) piece = re.test(txt) && txt.split(/\s+/).length === 1 ? bold(runs) : [{ t: cap(word) + ' : ', i: true, b: true }, ...runs];
			else piece = [{ t: ` (${word} : ` }, ...unparen(runs), { t: ')' }];
		} else if (kind === 'source') {
			// les références se lisent dans le texte brut : « .. » y est une partie de chemin (../fichier), pas le « etc. » de la notation
			const refs = el.raw.replace(/[\uE000\uE001]/g, '').split(',').map((x) => x.trim()).filter(Boolean), rr = []; let resolved = 0;
			refs.forEach((ref, n) => {
				if (n) rr.push({ t: ', ' });
				const f = ctx && ctx.resolveFile ? ctx.resolveFile(ref) : null, a = ctx && ctx.resolveTitle ? ctx.resolveTitle(ref) : null;
				if (a) { rr.push(a.anchor ? { t: ref, anchor: a.anchor } : { t: ref }); resolved++; }          // un titre l'emporte sur un fichier, comme dans l'éditeur
				else if (f) { rr.push({ t: ref, link: f.path }); attachments.push({ ...f, name: ref }); resolved++; }
				else rr.push({ t: ref });
			});
			if (first) piece = resolved === refs.length && refs.length ? rr : [{ t: 'Source : ', i: true }, ...rr];   // liens seuls : pas de « Source : » (sommaire)
			else piece = [{ t: ' (source : ' }, ...rr, { t: ')' }];
		} else if (STATUS.has(kind)) {
			if (first) status = kind;
			piece = [{ t: SYMBOLS[kind] + ' ', sym: true }, ...(kind === 'canceled' ? runs.map((r) => ({ ...r, s: true })) : runs)];
		} else if (kind === 'unreliable') piece = [{ t: SYMBOLS.unreliable + ' ', sym: true }, ...runs.map((r) => ({ ...r, i: true }))];
		else piece = runs;
		const glued = !first && (kind === 'def' || kind === 'detail' || kind === 'source' || kind === 'example' || kind === 'notice');   // ces morceaux portent déjà leur séparateur
		if (piece.length && !glued) piece = [{ t: sep() }, ...piece];
		parts.push(...piece); first = false;
	}
	const all = parts.filter((r) => r.t !== '').map((r) => (paragraph && !r.sym ? { ...r, b: true } : r));
	if (item.devEnd && all.length && !/:\s*$/.test(plain(all))) all.push({ t: ' :' });                 // un -> en fin de ligne devient « : »
	return { runs: tidy(coalesce(all)), attachments, paragraph, status, number: item.number == null ? null : item.number };
}

/* ---------------------------------------------------------------- 4 bis. ancres : un # vers un titre devient un lien interne */

// même règle que GitHub et l'aperçu de VS Code : minuscules, ponctuation retirée, CHAQUE espace devient un tiret
const slugify = (text) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '').trim().replace(/\s/g, '-');
const normKey = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, ' ').replace(/\s+/g, ' ').trim();

function buildAnchors(blocks) {
	const used = new Map(), byKey = new Map();
	const walk = (children) => {
		for (const ch of children) {
			if (ch.type === 'section') {
				const slug = slugify(headingText(ch)) || 'section', n = used.get(slug) || 0; used.set(slug, n + 1);
				ch.anchor = n ? `${slug}-${n}` : slug;
				for (const k of [normKey(ch.label ? `${ch.label} : ${ch.title}` : ch.title), normKey(ch.title)]) if (k && !byKey.has(k)) byKey.set(k, { anchor: ch.anchor });
			} else if (ch.type === 'list') {                       // une liste < > est une cible, mais elle n'a pas d'ancre : le texte reste simple
				const k = normKey(ch.title); if (k && !byKey.has(k)) byKey.set(k, { anchor: null });
			}
			if (ch.children) walk(ch.children);
		}
	};
	blocks.forEach((b) => walk(b.children));
	return (ref) => byKey.get(normKey(ref)) || byKey.get(normKey(ref.split('/').pop())) || null;
}

// les blocs « nom.convention » décrivent la notation elle-même : ils n'ont pas leur place dans un cours exporté
function visible(model, ctx) {
	const keep = ctx.includeLegend ? model.blocks : model.blocks.filter((b) => !/\.convention$/i.test(b.title || ''));
	return keep.length ? keep : model.blocks;
}

/* ---------------------------------------------------------------- 5. rendu Markdown
	Règles : une ligne de la notation = une ligne du rendu ; dans une liste < > ou un développement, seules les lignes - + § (et « n - »)
	ont une puce ; les autres s'attachent à la puce précédente ou restent des lignes simples ; les lignes vides du fichier sont gardées. */

const MD_UNIT = '    ';
const mdEscape = (t) => t.replace(/([\\`*_[\]<>])/g, '\\$1');
const lineStart = (t) => t.replace(/^(#|\+|-|\d+[.)])(\s)/, '\\$1$2');            // une ligne ordinaire ne doit pas devenir un titre, une puce ou une liste

function mdRuns(runs, ctx) {
	let out = '';
	for (const r of runs) {
		if (r.anchor) { out += `[${mdEscape(r.t)}](#${r.anchor})`; continue; }
		if (r.link) { const rel = ctx.relPath ? ctx.relPath(r.link) : r.link; out += `[${mdEscape(r.t)}](${encodeURI(rel.replace(/\\/g, '/'))})`; continue; }
		const lead = r.t.match(/^\s*/)[0], trail = r.t.match(/\s*$/)[0], core = r.t.trim();
		if (!core) { out += r.t; continue; }
		let t = r.code ? '`' + core.replace(/`/g, "'") + '`' : mdEscape(core);
		if (r.i) t = `*${t}*`;
		if (r.b) t = `**${t}**`;
		if (r.u) t = `<u>${t}</u>`;
		if (r.s) t = `~~${t}~~`;
		out += (r.sym ? '' : lead) + t + (r.sym ? ' ' : trail);
	}
	return out.replace(/\s+$/, '');
}

const mdImage = (a, ctx, pad) => `${pad}![${a.name}](${encodeURI((ctx.relPath ? ctx.relPath(a.path) : a.path).replace(/\\/g, '/'))})`;

function mdFlat(node, depth) {
	const pad = MD_UNIT.repeat(depth);
	return [`${pad}\`\`\``, ...node.text.split('\n').map((l) => (l ? pad + l : l)), `${pad}\`\`\``];
}

// une puce (ou un numéro), puis ses images, les lignes qui s'y rattachent et son développement (puces imbriquées)
function mdBullet(item, c, depth, ctx, out, level) {
	const pad = MD_UNIT.repeat(depth), mark = c.number != null ? `${c.number}. ` : '- ', col = ' '.repeat(mark.length);
	out.push(`${pad}${mark}${mdRuns(c.runs, ctx)}`);
	for (const a of c.attachments) if (a.isImage) out.push(mdImage(a, ctx, pad + col));
	for (const ex of item.extras || []) {
		const ec = composeLine(ex, ctx);
		if (ex.gapBefore) out.push(''); else out[out.length - 1] += '  ';           // saut de ligne forcé, ou paragraphe si le fichier avait une ligne vide
		out.push(`${pad}${col}${mdRuns(ec.runs, ctx)}`);
		for (const a of ec.attachments) if (a.isImage) out.push(mdImage(a, ctx, pad + col));
		if (ex.children.length) mdItems(ex.children, depth + 1, ctx, out, level);
	}
	if (item.children.length) mdItems(item.children, depth + 1, ctx, out, level);
}

// contenu d'une liste < > ou d'un développement ->
function mdItems(nodes, depth, ctx, out, level = 3, plainStart = false) {   // level : niveau de la section qui contient la liste (ses sections internes sont des sous-titres)
	let plainLast = plainStart;                                                // plainStart : on continue directement la ligne qui précède
	const sep = () => { if (out.length && out[out.length - 1] !== '') out.push(''); plainLast = false; };
	for (const n of nodes) {
		if (n.type === 'gap') { sep(); continue; }
		if (n.type === 'flat') { if (plainLast) sep(); out.push(...mdFlat(n, depth)); plainLast = false; continue; }   // collé à sa puce, comme dans le fichier
		if (n.type === 'section') {                                                // une section dans une liste : un sous-titre, comme ailleurs
			sep(); out.push(`${'#'.repeat(Math.min(6, level + 1))} ${mdRuns(headingRuns(n), ctx)}`, ''); mdBlock(n.children, level + 1, ctx, out); sep(); plainLast = false; continue;
		}
		if (n.type === 'list') {                                                   // une liste dans une liste : une puce (titre en gras et « : »), ses puces dessous
			if (plainLast) sep();
			out.push(`${MD_UNIT.repeat(depth)}- ${mdRuns(bold(listTitleRuns(n)), ctx)}`); plainLast = false;
			mdItems(n.children, depth + 1, ctx, out, level); continue;
		}
		if (n.type !== 'item') continue;
		const c = composeLine(n, ctx);
		if (isBullet(n)) { if (plainLast) sep(); mdBullet(n, c, depth, ctx, out, level); plainLast = false; continue; }
		if (plainLast) out[out.length - 1] += '  '; else sep();                  // ligne sans puce : seule, ou à la suite d'une autre (retour à la ligne forcé)
		out.push(lineStart(mdRuns(c.runs, ctx))); plainLast = true;
		for (const a of c.attachments) if (a.isImage) { sep(); out.push(mdImage(a, ctx, '')); }
		if (n.children.length) { sep(); mdItems(n.children, 0, ctx, out, level); }
	}
}

// contenu d'un bloc ou d'une section : les lignes ordinaires restent des lignes (saut de ligne forcé), sans puce
function mdBlock(children, level, ctx, out) {
	let last = null;
	const sep = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
	for (const ch of children) {
		if (ch.type === 'gap') { sep(); last = 'gap'; continue; }
		if (ch.type === 'section') {
			sep(); out.push(`${'#'.repeat(Math.min(6, level + 1))} ${mdRuns(headingRuns(ch), ctx)}`, '');
			mdBlock(ch.children, level + 1, ctx, out); last = 'block'; continue;
		}
		if (ch.type === 'list') { sep(); out.push(mdRuns(bold(listTitleRuns(ch)), ctx), ''); mdItems(ch.children, 0, ctx, out, level); last = 'list'; continue; }
		if (ch.type === 'flat') { sep(); out.push(...mdFlat(ch, 0)); last = 'block'; continue; }
		if (ch.type !== 'item') continue;
		const c = composeLine(ch, ctx);
		if (c.number != null) { if (last !== 'list') sep(); mdBullet(ch, c, 0, ctx, out, level); last = 'list'; continue; }
		if (last === 'plain') out[out.length - 1] += '  '; else sep();            // deux espaces en fin de ligne = retour à la ligne en Markdown
		out.push(lineStart(mdRuns(c.runs, ctx))); last = 'plain';
		for (const a of c.attachments) if (a.isImage) { sep(); out.push(mdImage(a, ctx, '')); last = 'block'; }
		if (ch.children.length) {
			const kid = ch.children[0], follows = kid.type === 'item' && !isBullet(kid);       // une remarque en retrait sous sa ligne : collée à elle, comme dans le fichier
			if (!follows) sep();
			mdItems(ch.children, 0, ctx, out, level, follows); last = 'list';
		}
	}
}

function toMarkdown(model, ctx0 = {}) {
	const blocks = visible(model, ctx0), ctx = { ...ctx0, resolveTitle: buildAnchors(blocks) };
	const out = [];
	blocks.forEach((b, n) => {
		if (n) out.push('', '---', '');
		out.push(`# ${mdRuns(titleRuns(b.title || 'Notes'), ctx)}`, '');
		mdBlock(b.children, 1, ctx, out);
	});
	return out.join('\n').replace(/\s+$/, '') + '\n';
}

/* ---------------------------------------------------------------- 6. rendu PDF (définition pdfmake, sans dépendre de pdfmake) */

const FONT = 'Roboto', FALLBACK = 'Symbols', MONO = 'Mono';

// sépare un texte en morceaux : les caractères que Roboto n'a pas (✔ ▶ → ∈ …) passent dans la police de secours
function splitGlyphs(text, ctx) {
	if (!ctx.hasGlyph) return [{ text, fb: false }];
	const out = [];
	for (const ch of text) {
		const fb = ch.codePointAt(0) > 0x7e && !ctx.hasGlyph(ch.codePointAt(0));
		if (out.length && out[out.length - 1].fb === fb) out[out.length - 1].text += ch; else out.push({ text: ch, fb });
	}
	return out;
}

function pdfRuns(runs, ctx) {
	const out = [];
	for (const r of runs) {
		const style = {};
		if (r.b) style.bold = true;
		if (r.i) style.italics = true;
		const deco = []; if (r.u || r.link || r.anchor) deco.push('underline'); if (r.s) deco.push('lineThrough');
		if (deco.length) style.decoration = deco.length === 1 ? deco[0] : deco;
		if (r.s) style.color = '#777777';
		if (r.anchor) { style.linkToDestination = r.anchor; style.color = '#1a5fb4'; }
		if (r.link) { style.link = ctx.fileUrl ? ctx.fileUrl(r.link) : undefined; style.color = '#1a5fb4'; }
		if (r.code) { out.push({ text: r.t, font: MONO, fontSize: 9.5, background: '#eeeef3', ...style }); continue; }
		for (const g of splitGlyphs(r.t, ctx)) out.push(g.fb ? { text: g.text, font: FALLBACK, ...style } : { text: g.text, ...style });
	}
	return out.length ? out : [{ text: '' }];
}

function pdfFlat(node, ctx, left = 0) {
	const body = node.text.split('\n').map((l) => l || ' ').join('\n');
	return { table: { widths: ['*'], body: [[{ text: splitGlyphs(body, ctx).map((g) => ({ text: g.text, font: MONO })), fontSize: 8.5, preserveLeadingSpaces: true, fillColor: '#f1f1f5', margin: [6, 4, 6, 4] }]] }, layout: 'noBorders', margin: [left, 3, 0, 5], unbreakable: node.text.split('\n').length <= 18 };
}

function pdfImage(a, ctx) {
	const data = ctx.readImage ? ctx.readImage(a.path) : null;
	if (!data) return { text: [{ text: 'Image non incluse : ' + a.name, italics: true, color: '#888888', fontSize: 9 }], margin: [0, 2, 0, 2] };
	return { stack: [{ image: data, fit: [380, 280], margin: [0, 3, 0, 2] }, { text: a.name, italics: true, fontSize: 8, color: '#777777' }], margin: [0, 2, 0, 4] };
}

// ajoute de la marge au-dessus d'un nœud (saut de ligne du fichier)
const GAP = 7, TEXT_COL = 12;                                                 // TEXT_COL : décalage du texte d'une puce
const withGap = (node, on) => { if (!on) return node; const m = node.margin || [0, 0, 0, 0]; return { ...node, margin: [m[0], m[1] + GAP, m[2], m[3]] }; };
const oneOf = (stack) => (stack.length === 1 ? stack[0] : { stack });

// texte de la ligne, ses images, les lignes qui s'y rattachent, puis son développement (puces)
function pdfBody(item, ctx, c, level) {
	const stack = [{ text: pdfRuns(c.runs, ctx), margin: [0, 0, 0, 1] }];
	for (const a of c.attachments) if (a.isImage) stack.push(pdfImage(a, ctx));
	for (const ex of item.extras || []) {
		const ec = composeLine(ex, ctx);
		stack.push({ text: pdfRuns(ec.runs, ctx), margin: [0, ex.gapBefore ? 4 : 0, 0, 1] });
		for (const a of ec.attachments) if (a.isImage) stack.push(pdfImage(a, ctx));
		stack.push(...pdfItems(ex.children, ctx, 0, level));
	}
	stack.push(...pdfItems(item.children, ctx, 0, level));
	return stack;
}
const pdfNumbered = (c, stack, ind) => ({ columns: [{ width: 20, text: `${c.number}.` }, oneOf(stack)], columnGap: 2, margin: [ind, 0, 0, 2] });

// contenu d'une liste ou d'un développement : puces consécutives -> un seul `ul` ; lignes sans puce, numéros et blocs plats s'intercalent
// ind : retrait en points de la liste
function pdfItems(nodes, ctx, ind, level = 3) {
	const out = []; let ul = null, gap = false;
	const bullet = (node) => { if (!ul) { ul = { ul: [], margin: [ind, 1, 0, 3] }; out.push(ul); } ul.ul.push(withGap(node, gap)); gap = false; };
	for (const n of nodes) {
		if (n.type === 'gap') { gap = true; continue; }
		if (n.type === 'flat') { ul = null; out.push(withGap(pdfFlat(n, ctx, ind), gap)); gap = false; continue; }
		if (n.type === 'section') {                                                // une section dans une liste : un sous-titre, comme ailleurs
			ul = null; gap = false; out.push({ text: pdfRuns(headingRuns(n), ctx), id: n.anchor, ...H[Math.min(level + 1, 4)] }); pdfBlock(n.children, level + 1, ctx, out); continue;
		}
		if (n.type === 'list') {                                                   // une liste dans une liste : une puce (titre en gras et « : »), ses puces dessous
			bullet({ stack: [{ text: pdfRuns(bold(listTitleRuns(n)), ctx), margin: [0, 0, 0, 1] }, ...pdfItems(n.children, ctx, 0, level)] }); continue;
		}
		if (n.type !== 'item') continue;
		const c = composeLine(n, ctx), stack = pdfBody(n, ctx, c, level);
		if (c.number != null) { ul = null; out.push(withGap(pdfNumbered(c, stack, ind), gap)); gap = false; }
		else if (isBullet(n)) bullet(oneOf(stack));
		else { ul = null; out.push(withGap({ ...oneOf(stack), margin: [ind + TEXT_COL, 0, 0, 2] }, gap)); gap = false; }   // ligne sans puce, alignée sur le texte des puces
	}
	return out;
}

const H = [null, { fontSize: 21, bold: true, margin: [0, 0, 0, 6] }, { fontSize: 15, bold: true, margin: [0, 12, 0, 4] }, { fontSize: 12.5, bold: true, margin: [0, 9, 0, 3] }, { fontSize: 11, bold: true, margin: [0, 7, 0, 2] }];

function pdfBlock(children, level, ctx, out) {
	let gap = false;
	const push = (node) => { out.push(withGap(node, gap)); gap = false; };
	for (const ch of children) {
		if (ch.type === 'gap') { gap = true; continue; }
		if (ch.type === 'section') {
			gap = false; out.push({ text: pdfRuns(headingRuns(ch), ctx), id: ch.anchor, ...H[Math.min(level + 1, 4)] });
			pdfBlock(ch.children, level + 1, ctx, out); continue;
		}
		if (ch.type === 'list') { push({ text: pdfRuns(bold(listTitleRuns(ch)), ctx), margin: [0, 4, 0, 2] }); out.push(...pdfItems(ch.children, ctx, 0, level)); continue; }
		if (ch.type === 'flat') { push(pdfFlat(ch, ctx)); continue; }
		if (ch.type !== 'item') continue;
		const c = composeLine(ch, ctx), body = pdfBody(ch, ctx, c, level);
		if (c.number != null) { push(pdfNumbered(c, body, 0)); continue; }
		// ligne ordinaire : un paragraphe sans puce ; son développement vient dessous, légèrement décalé
		const text = body.shift();
		push(text);
		if (body.length) out.push({ stack: body, margin: [8, 0, 0, 0] });
	}
}

function toPdfDoc(model, ctx0 = {}) {
	const blocks = visible(model, ctx0), ctx = { ...ctx0, resolveTitle: buildAnchors(blocks) };
	const content = [];
	blocks.forEach((b, n) => {
		content.push({ text: pdfRuns(titleRuns(b.title || 'Notes'), ctx), ...H[1], ...(n ? { pageBreak: 'before' } : {}) });
		pdfBlock(b.children, 1, ctx, content);
	});
	return {
		info: { title: (blocks[0] && blocks[0].title) || 'Notes', creator: 'Note Lang' },
		pageSize: 'A4', pageMargins: [48, 52, 48, 52],
		defaultStyle: { font: FONT, fontSize: 10.5, lineHeight: 1.22 },
		footer: (page, pages) => ({ text: `${page} / ${pages}`, alignment: 'center', fontSize: 8, color: '#888888', margin: [0, 18, 0, 0] }),
		content,
	};
}

module.exports = { parseNotes, toMarkdown, toPdfDoc, lexLine, inlineRuns, readLines, composeLine, SYMBOLS, FONT, FALLBACK, MONO };
