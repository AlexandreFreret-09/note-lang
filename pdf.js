'use strict';
// Fabrique un PDF à partir d'une définition pdfmake. La bibliothèque est un seul fichier déjà assemblé (lib/), les polices sont lues ici
// et données en mémoire : pdfmake n'a le droit de lire AUCUN fichier ni adresse web par lui-même.
const fs = require('fs'), path = require('path');

function loadPdf(dir) {
	const { pdfmake, fontkit } = require(path.join(dir, 'lib', 'pdfmake.bundle.js'));
	const font = (n) => fs.readFileSync(path.join(dir, 'fonts', n));
	const same = (b) => ({ normal: b, bold: b, italics: b, bolditalics: b });
	pdfmake.addFonts({
		Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
		Symbols: same(font('DejaVuSans.ttf')),
		Mono: same(font('DejaVuSansMono.ttf')),
	});
	pdfmake.setLocalAccessPolicy(() => false);
	pdfmake.setUrlAccessPolicy(() => false);
	const roboto = fontkit.create(font('Roboto-Regular.ttf'));
	return { pdfmake, hasGlyph: (cp) => roboto.hasGlyphForCodePoint(cp) };
}

module.exports = { loadPdf };
