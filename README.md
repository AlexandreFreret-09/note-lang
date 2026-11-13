# Note Lang — la notation `.note` / `.cours`

Extension VS Code pour une notation de prise de notes inspirée du code. On écrit des cours, des synthèses ou des projets avec quelques symboles (`+`, `-`, `:`, `*`, `;`…) qui donnent un rôle à chaque ligne, et l'extension s'occupe du reste : couleurs, liens entre titres, complétion, plan du fichier.

Fichiers reconnus : `.note` et `.cours`.

Pour les liens d'un fichier à l'autre, ouvre le **dossier** qui contient tes notes (*Fichier → Ouvrir un dossier*).

## La notation en bref

```
// blocs structure
[ n : titre ]( ... )   section d'éléments
< n : ??? >( ... )     liste de ???

// éléments indépendants
§ ???      sous-titre / contexte
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

// modifieurs
~???       élément incertain
°???       élément important   (gras)
^???       élément obligatoire (souligné)
!???       exception           (italique)

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
/> ??      annulé  

// autres
(??, ??)   liste     _  séparateur     ...  à venir     ..  etc
```

## Proriétés des symboles

Les éléments primaires ne imbriquent pas (nouveau bloc).  
Les éléments secondaires s'imbriquent dans le précédent.  
Les éléments non composés n'imbriquent aucun élément.  

```
- info : définition * exemple ; détail
+------------------------------------+
                  |
             bloc info (-)
```

## Modifieurs

Ils donnent une signification suplémentaire au text dans un bloc.  
Ils s'ajoutent de deux façon :

### Devant du texte
Le texte modifié directement est délimité par les "," et "_".  
Ils peuvent également être placés devant une liste "~(1,2,3)".

### Devant un symbole
Le bloc est modifié selon les règles de l'imbrication.  
Tout élément imbiqué dans un bloc sera modifié aussi.

Modifier un élément non composé ne modifira que lui-même.

## Retour : `+>`

`+>` referme l'élément le plus interne pour **reprendre celui d'avant** :

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

## Structure d'un fichier note

### Blocs Titre

Un bloc de premier niveau s'écrit `nomDuFichier.suite { … }`, collé à gauche :
```
nom.cours.1 {
	[ 1 : Présentation ](
		+ terme : définition
	)
}
```
Le titre peut avoir autant d'extention souhaité mais le premier mot doit obligatoirement être **le nom du fichier** :  
Un fichier `nom.cours` peut contenir un titre `nom.1 {` ou `nom.cours {`.  
`cours.1 {` n'est pas accepté et donne un avertissement.  
Un fichier peut contenir plusieurs blocs (ex : `nom.cours.1 { … }` puis `nom.cours.2 { … }`).

Tout le texte doit se trouver dans un bloc {} : un texte placé en dehors d'un bloc titre est signalé par une **erreur**.  
Les lignes vides et les commentaires sont permis hors bloc.

### Sections, listes et sous-titres

Les sections `[]` correspondent à des titre généraux et peuvent s'impriquer sur plusieurs niveaux.  
Les listes `<>` servent a énumérer les informations sur le sujet de la liste.

Une section peut contenir des listes et une liste peut contenir des sections.

Le `§` sert de sous-titre ou a donner du contexte sans ajouter une nouvelle section.

## Références : `#`

Un `#` suivi du nom d'une cible devient un lien (Ctrl+clic, ou F12). Les cibles sont les blocs titres `{}`, les `[]` et les `<>` de **tous** les fichiers du dossier.  
Un `#` qui ne correspond à aucune cible reste du texte normal.

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
Les liens, la complétion et les mentions entre fichiers demandent d'avoir ouvert le dossier.

Les noms de blocs contenant une virgule ou un `/` ne sont pas proposés à la complétion.

### Référencer un fichier

Un `#` peut également faire référence à un fichier existant :

```
- schéma # images/schema.png
- cours  # docs/Cours1.pdf
- suite  # ../autre.cours
```

Le fichier est cherché à côté du fichier courant, à la racine de l'espace de travail, puis par son seul nom s'il est unique dans le dossier.  
N'oubliez pas d'échapper le texte si le nom contient des symboles (`-`, `+`, `:`).

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

## Exporter en Markdown ou en PDF
 
Clic droit sur un fichier `.note` ou `.cours` (dans l'éditeur ou dans l'explorateur), ou `Ctrl+Maj+P` :
 
- **Note Lang: Exporter en Markdown** crée `nom.md` à côté du fichier ;
- **Note Lang: Exporter en PDF** crée `nom.pdf`.
 
Si le fichier existe déjà, l'extension demande avant de le remplacer. Le PDF est fabriqué par l'extension elle-même.

## Snippets

Tape le début du symbole et choisis dans la liste :

| Préfixe                                                                                      | Insère                                      |
|----------------------------------------------------------------------------------------------|---------------------------------------------|
| `[titre]()`, `[n : titre]()`                                                                 | bloc de structure                           |
| `<titre>()`, `<n : titre>()`                                                                 | bloc de liste d'informations                |
| `+ vocab`, `+ entity`                                                                        | vocabulaire, entité                         |
| `- info`, `- clé : valeur`, `- info ; détail`, `- info * exemple`, `- info & remarque`       | informations                                |
| `: définition`, `* exemple`, `& remarque`, `; détail`, `# source`, `§ contexte`, `@ mention` | éléments                                    |
| `-> dev`, `+>`                                                                               | développement, retour à l'élément précédent |
| `~ incertain`, `° important`, `^ obligatoire`, `! exception`, `\| ignoré`, `~~ non fiable`   | modifieurs                                  |
| `=> terminé`, `> commencé`, `:> nouveauté`, `/> supprimé`                                    | statuts                                     |
| `/. table ./`                                                                                | tableau                                     |

## Réglages appliqués au langage

Pour les fichiers de ce langage seulement, l'extension active les repères verticaux d'indentation et de paires de crochets (`editor.guides`). Le reste suit tes réglages VS Code, que tu peux surcharger sous `"[note]": { … }`.

Deux réglages utiles à connaître :

- `"editor.bracketPairColorization.enabled": false` : la coloration des paires de parenthèses de VS Code se superpose aux couleurs de la notation ; tu peux la couper si elle te gêne.
- `"editor.wordBasedSuggestions": "off"` : par défaut VS Code propose aussi les mots déjà écrits dans le fichier ; coupe-les pour ne voir que les propositions de l'extension (`#` et `@`).

## Limites connues



- Le contenu des tableaux `/. ./` et des commentaires `/* */` est ignoré pour les liens et les entités.