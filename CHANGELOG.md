# Journal des changements

## 1.1.0 — 2026-10-29

- Nouveau symbole de statut `>>` : tâche à faire en continu, avec son snippet `>> en continu`.
- Erreur quand du texte est placé hors d’un bloc titre

## 1.0.0 — 2026-10-18 — première version

- Coloration complète de la notation (`.note`, `.cours`) : structure `[ ]` et `< >`, éléments `+ - : * & ; # §`, marqueurs `~ ° ^ ! |`, statuts `=> > :> />`, tableaux `/. ./`, commentaires.
- Imbrication des éléments : `+>` referme le plus interne et reprend l'élément précédent.
- Titres de bloc `nomDuFichier.suite { }` avec avertissement si le premier mot n'est pas le nom du fichier.
- Références `#` cliquables vers les titres, les `[ ]` et les `< >` (Ctrl+clic), avec chemins `a/b` et gestion des doublons.
- Entités : `+` déclare, `@` mentionne (Ctrl+clic, Maj+F12, survol).
- Complétion à la frappe de `#` et de `@`.
- Plan du fichier (Outline) et recherche de titres dans tous les fichiers (Ctrl+T).
- 31 snippets de notation.
- Commande annexe : générer une classe + constructeur depuis une liste d'attributs.
