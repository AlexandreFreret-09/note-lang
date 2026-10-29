# Note Lang — la notation `.note` / `.cours`

Extension VS Code pour une notation de prise de notes inspirée du code. On écrit des cours, des synthèses ou des projets avec quelques symboles (`+`, `-`, `:`, `*`, `;`…) qui donnent un rôle à chaque ligne, et l'extension s'occupe du reste : couleurs, liens entre titres, complétion, plan du fichier.

Fichiers reconnus : `.note` et `.cours`.

## Installation

1. Si une ancienne version « Note Lang » est déjà installée (par *Install from Location* par exemple), **désinstalle-la d'abord**, sinon deux extensions déclarent le même langage.
2. Dans VS Code : *Extensions* → menu `…` → **Installer à partir d'un VSIX…** → choisis `note-lang-1.0.0.vsix`.
   En ligne de commande : `code --install-extension note-lang-1.0.0.vsix`.
   *Autre méthode, si tu as reçu un dossier plutôt qu'un `.vsix`* : dézippe-le, puis `Ctrl+Maj+P` → **Extensions: Install from Location…** → choisis le dossier `note-lang`.
3. Recharge la fenêtre.

Pour les liens d'un fichier à l'autre, ouvre le **dossier** qui contient tes notes (*Fichier → Ouvrir un dossier*).

## La notation en bref

```
// structure
[ n : titre ]( ... )   liste d'éléments
< n : titre >( ... )   liste d'informations

// éléments indépendants
§ ??       sous-titre / contexte
~~ ???     info non fiable ou manquante

// éléments informationnels
+ ???      vocabulaire / entité                        (primaire) (non composé)
- ???      info / données                              (primaire)
: ???      définition / valeur                         (secondaire)
* ???      exemple                                     (secondaire)
& ???      remarque                                    (secondaire)
; ???      détail / précision                          (secondaire)
# ???      source (titre, [ ], < >) ou autre           (secondaire) (non composé)
@ ???      mention d'entité (acteur, texte …) ou autre (secondaire) (non composé)

// modifieurs, collés au texte (ou à un bloc : ^- !- °-)
~???       élément incertain
°???       élément important
^???       élément obligatoire (souligné)
!???       exception (italique)

// spéciaux
|+ ???     élément ignoré          (| collé à un symbole, ou ||)
?? -> ??   développement           (Label -> puis un bloc indenté)
?? +> ??   retour à l'élément précédent (éléments non composés exclus)
/. ### ./  format particulier (tableaux ASCII)

// statuts
:> ??      nouveauté  
> ??       commencé  
>> ??      en continu  
=> ??      terminé  
/> ??      supprimé  

// autres
(??, ??)   liste     _  séparateur     ...  à venir     ..  etc
```

## Retour `+>`

Les éléments secondaires s'imbriquent dans le précédent.  
Les éléments non composés n'imbriquent aucun élément.  
`+>` referme le plus interne pour **reprendre l'élément d'avant** :

```
- info * exemple ; détail +> suite de l'exemple +> suite de l'info
```

Ici « suite de l'exemple » reprend la couleur de l'exemple, puis « suite de l'info » celle de l'info.

## Guillemets

Le contenu d'un élément peut être mis entre guillemets, ce qui échappe tous les symboles d'écriture :

```
- "adresse.mail@gmail.com"
```

Ils permettent également de prolonger le texte sur plusieurs lignes :

```
- "« Les limites de mon langage signifient les limites de mon propre monde. »
   — Ludwig Wittgenstein"
```
Alternative sans échappement du texte :

```
- « Les limites de mon langage signifient les limites de mon propre monde. »"
  "— Ludwig Wittgenstein
```

## Titres de bloc

Un bloc de premier niveau s'écrit `nomDuFichier.suite { … }`, collé à gauche, avec le `{` sur la même ligne ou sur la suivante :

```
nom.cours.1 {
	[ 1 : Présentation ](
		+ terme : définition
	)
}
```

Le premier mot doit être **le nom du fichier sans sa dernière extension** : dans `nom.cours`, `nom.cours.1 {` ou `nom {` sont valides, `Cours.1 {` donne un avertissement. Un fichier peut contenir plusieurs blocs (ex : `nom.cours.1 { … }` puis `nom.cours.2 { … }`).

## Liens : `#`

Un `#` suivi du nom d'une cible devient un lien (Ctrl+clic, ou F12). Les cibles sont les titres de bloc, les `[ ]` et les `< >` de **tous** les fichiers du dossier. Un `#` qui ne correspond à aucune cible reste du texte normal (`# page 3`).

| Tu écris | Pour atteindre |
|---|---|
| `# Présentation` | `[ 1 : Présentation ]` (partie après le `:`) |
| `# Partie 1` ou `# Définition` | `[ Partie 1 : Définition ]` (partie gauche ou droite) |
| `# "Partie 1 : Définition"` | le même, texte complet (guillemets à cause du `:`) |
| `# TITRE/5` | le `[ 5 : … ]` situé dans `[ TITRE ]` (chemin avec `/`, on peut sauter des niveaux) |
| `# Nom.cours.1` | le titre de bloc |
| `# Partie 1, Partie 2` | deux références, séparées par une virgule |

La recherche ignore les majuscules, les accents et le type d'apostrophe. S'il y a plusieurs cibles de même nom, c'est la plus proche de l'endroit où tu écris qui l'emporte ; si le doute reste, un aperçu liste les candidats et la référence est soulignée en avertissement avec la précision à ajouter.

**Complétion** : tape `#` et la liste propose toutes les cibles, déjà écrites sous la forme la plus courte qui retombe sur la bonne.

## Entités : `+` déclare, `@` mentionne

`+ animateurs : les personnes qui animent le jeu` déclare une entité ; `Fournis par @ animateurs` la mentionne.

- **Ctrl+clic** sur une mention : aperçu de la déclaration et de toutes les mentions, dans tous les fichiers.
- **Maj+F12** : la liste des références. **Survol** : la définition et le nombre de mentions.
- Une entité mentionnée sans être déclarée marche aussi (un article de loi, une date…).
- **Complétion** : tape `@` et la liste propose les entités déclarées, puis celles déjà mentionnées.

Rien ne s'affiche pour une entité déclarée que personne ne mentionne.

## Navigation

- **Plan du fichier** (panneau *Outline*, fil d'Ariane, `Ctrl+Maj+O`) : titres, `[ ]` et `< >`, en arbre.
- **`Ctrl+T`** : aller à un titre, un `[ ]` ou un `< >` dans tous les fichiers.

## Snippets

Tape le début du symbole et choisis dans la liste :

| Préfixe | Insère |
|---|---|
| `[titre]()`, `[n : titre]()` | bloc de structure |
| `<titre>()`, `<n : titre>()` | bloc de liste d'informations |
| `+ vocab`, `+ entity` | vocabulaire, entité |
| `- info`, `- clé : valeur`, `- info ; détail`, `- info * exemple`, `- info & remarque` | informations |
| `: définition`, `* exemple`, `& remarque`, `; détail`, `# source`, `§ contexte`, `@ mention` | éléments |
| `-> dev`, `+>` | développement, retour à l'élément précédent |
| `~ incertain`, `° important`, `^ obligatoire`, `! exception`, `\| ignoré`, `~~ non fiable` | modifieurs |
| `=> terminé`, `> commencé`, `:> nouveauté`, `/> supprimé` | statuts |
| `/. table ./` | tableau |

## Réglages appliqués au langage

Pour les fichiers de ce langage seulement, l'extension active les repères verticaux d'indentation et de paires de crochets (`editor.guides`). Le reste suit tes réglages VS Code, que tu peux surcharger sous `"[note]": { … }`.

Deux réglages utiles à connaître :

- `"editor.bracketPairColorization.enabled": false` : la coloration des paires de parenthèses de VS Code se superpose aux couleurs de la notation ; tu peux la couper si elle te gêne.
- `"editor.wordBasedSuggestions": "off"` : par défaut VS Code propose aussi les mots déjà écrits dans le fichier ; coupe-les pour ne voir que les propositions de l'extension (`#` et `@`).

## Limites connues

- Les liens, la complétion et les mentions entre fichiers demandent d'avoir ouvert le dossier.
- Les noms de blocs contenant une virgule ou un `/` ne sont pas proposés à la complétion.
- Le contenu des tableaux `/. ./` et des commentaires `/* */` est ignoré pour les liens et les entités.