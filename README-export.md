## Exporter en Markdown ou en PDF

Clic droit sur un fichier `.note` ou `.cours` (dans l'éditeur ou dans l'explorateur), ou la palette de commandes (`Ctrl+Maj+P`) :

- **Note Lang: Exporter en Markdown** crée `nom.md` à côté du fichier ;
- **Note Lang: Exporter en PDF** crée `nom.pdf`.

Si le fichier existe déjà, l'extension demande avant de le remplacer. Le PDF est fabriqué par l'extension elle-même (bibliothèque pdfmake, polices Roboto et DejaVu incluses) : aucun navigateur ni programme à installer.

### Mise en page

- Une ligne de la notation reste une ligne, et les lignes vides du fichier sont conservées.
- Les symboles de tête (`-`, `+`, `§`, `:`…) ne sont pas des puces : ils sont du texte normal.
- Des puces n'apparaissent que dans une liste `< >` ou dans un développement, et seulement devant les lignes `-`, `+` et `§`.
- Une liste dans une liste a une puce (son titre en gras, terminé par « : », puis ses propres puces) ; une liste placée directement dans une section n'en a pas.
- Dans une liste, les lignes `:`, `&`, `*`, `;`, `#`, `@` qui suivent une puce s'y rattachent, sans nouvelle puce (même après une ligne vide). Sinon, ce sont des lignes simples.
- Un texte entre guillemets qui s'étend sur plusieurs lignes reste un seul texte, sans puce sur les lignes de suite, que les guillemets soient ouverts sur la première ligne et fermés sur la dernière, ou refermés et rouverts à chaque ligne.

| Dans la notation | À l'export |
|---|---|
| titre de fichier `nom.suite { }` | titre principal |
| `[ n : titre ]` | titre numéroté (niveau selon l'imbrication) |
| `< titre >` | titre en gras terminé par « : », puis les puces (avec une puce devant le titre si la liste est dans une liste) |
| `->` en fin de ligne | « : » ; les lignes en retrait dessous deviennent des puces |
| `n - texte` | liste numérotée : `1.` `2.` `3.` |
| `§` | ligne en gras |
| `+ terme : définition` | terme en gras |
| `:` en début de ligne | « Définition : » |
| `&` en début de ligne | « Remarque : » |
| `*` en début de ligne | « Exemple : » |
| `;` | entre parenthèses |
| `*`, `&`, `#` après un texte | (exemple : …), (remarque : …), (source : …) |
| `@` | italique et souligné |
| `/. … ./` | bloc de code |
| `\|` + symbole | ligne barrée |
| `=>` `>` `>>` `:>` `/>` | ✔ ▶ ↻ ★ ✘ devant la ligne |
| `~~` | ⚠ devant la ligne, en italique |
| `~` `°` `^` `!` | `(?)`, gras, souligné, italique |
| `_` entre deux espaces | un tiret – (aussi dans les titres) |
| `..` et `...` | … et (à venir) |
| `#` vers un titre | lien interne |
| `#` vers un fichier | lien ; une image PNG ou JPEG est intégrée |

Ne sont pas exportés : les commentaires (`//`, `/* */`) et les blocs dont le nom finit par `.convention`.

Le souligné n'existe pas en Markdown : il est écrit avec la balise HTML `<u>`, que l'aperçu de VS Code affiche soulignée. Un lecteur qui n'interprète pas le HTML montre la balise telle quelle. Dans le PDF, il n'y a pas ce souci.

---
Pour le CHANGELOG :

## 1.3.0 — AAAA-MM-JJ
- Export en Markdown et en PDF (clic droit ou palette de commandes), sans programme externe.
