# Cap

Un tableau de bord personnel pour tenir un rythme sur quelques semaines.
Un seul fichier, `index.html`, sans dépendance ni étape de construction : on l'ouvre en double-cliquant dessus, ou on le publie tel quel sur GitHub Pages.

L'outil est construit autour du **démarrage**, pas du suivi : chaque jour s'ouvre sur une seule carte, une phrase d'amorce et un chrono de 5 minutes. Après, on a le droit d'arrêter.

## Ce qu'il y a dedans

| Onglet | Contenu |
| --- | --- |
| ☀️ **Jour** | La carte d'amorce et son chrono, puis les essentiels du jour (deux au plus), les bonus, la récompense du soir et le déroulé. |
| 📄 **Rapport** | La méthode de rédaction en 9 étapes, et l'interview : on saisit le titre d'une section, on reçoit 7 questions, on y répond en vrac, on copie le tout. |
| 🎯 **Boulot** | Des compteurs avec un bouton +1, et une liste d'outils à préparer. |
| 🧭 **Cap** | Le choix du jour affiché, les deux ancres (lever, fermeture), les réglages, « Clore la semaine », l'import du contenu et les règles. |

Deux phases : **A** jusqu'à une date de bascule (une petite tâche de préparation par soir au plus, rien d'autre), puis **B** (la semaine type). La bascule est automatique selon la date, et peut être forcée dans l'onglet Cap.

## Les principes de conception

- **L'amorce de 5 minutes.** Chaque jour a une micro-action de démarrage et un chrono de 5 min. Le contrat affiché : « après, tu as le droit d'arrêter ».
- **La récompense est quotidienne, pas hebdomadaire.** Deux essentiels au plus par jour ; les cocher déverrouille la récompense du soir. Le reste est bonus.
- **La barre est volontairement basse.** Mieux vaut une barre basse franchie qu'une barre haute frôlée.
- **On ancre le lever, pas le coucher.** On décide de se lever et de sortir. Le lever recule par paliers de 30 min par semaine, jamais d'un bloc.
- **Heure de fermeture fixe le soir.** Écrans de travail éteints même si ce n'est pas fini. S'arrêter au minuteur, jamais à l'épuisement.
- **Les ancres ne bloquent jamais la récompense.** Elles sont visibles mais ne punissent pas.
- **Le week-end est intouchable,** sauf l'heure de lever.
- **Trois chantiers actifs au plus,** le reste explicitement en pause avec une date de reprise.
- **La récompense est au même endroit que l'effort.**
- **Une couleur par jour :** la nouveauté est un carburant plus fiable que la discipline.

## Contenu d'exemple et contenu personnel

Le fichier publié ne contient qu'un **contenu d'exemple neutre**. Le vrai contenu (jours, lieux, tâches, récompenses, règles, dates) vit dans un fichier `perso.json` qui **n'est jamais publié** : il est listé dans `.gitignore`.

Pour l'utiliser sur un téléphone :

1. Envoyer `perso.json` sur le téléphone (AirDrop vers Fichiers, par exemple).
2. Ouvrir Cap, onglet 🧭 **Cap** → **Importer perso.json**.
3. Le contenu est gardé dans le navigateur du téléphone, avec les cases cochées. Il n'est envoyé nulle part.

À savoir : si les données du navigateur sont effacées, il faut réimporter. Une icône ajoutée à l'écran d'accueil d'un iPhone a son propre stockage : faire l'import depuis cette icône. « Revenir à l'exemple » retire le contenu importé du navigateur, sans toucher au fichier.

`perso.json` a la même forme que l'objet `SAMPLE` en haut de `index.html` :

```json
{
  "version": 1,
  "settings": { "lever": "08:00", "leverMax": "10:30", "fermeture": "22:30", "finStage": "2026-12-18", "rendu": "2027-01-15" },
  "countdown": { "a": "avant la bascule", "b": "avant l’échéance" },
  "days": {
    "lun": {
      "name": "Lundi", "emoji": "☕", "c1": "#0891b2", "c2": "#22d3ee",
      "lieu": "…", "amorce": "…",
      "essentiels": [{ "id": "lun-a", "label": "…" }],
      "bonus": [],
      "reward": { "emoji": "🎬", "text": "…" },
      "deroule": [["=w", "Réveil"], ["+60", "…"], ["14:30", "…"], ["=c", "Fermeture"]]
    },
    "…": "mar, mer, jeu, ven, puis we avec { \"weekend\": { \"id\": \"we-lever\", \"label\": \"Lever vers [heure], samedi et dimanche\" } }"
  },
  "prep": [{ "id": "prep-1", "label": "…" }],
  "prepNote": "…", "prepDone": "…",
  "jobs": [{ "id": "j1", "label": "…" }], "jobsIntro": "…",
  "counters": [{ "id": "c1", "label": "…", "c1": "#1d4ed8", "c2": "#60a5fa" }],
  "rules": [{ "id": "rythme", "title": "😴 Rythme", "text": ["…"] }]
}
```

Un champ absent reprend la valeur d'exemple ; un champ invalide est ignoré et signalé à l'import. Heures du déroulé : `"=w"` = lever, `"+90"` = lever + 90 min, `"=c"` = fermeture, ou une heure fixe `"14:30"`. Deux essentiels au plus par jour, identifiants uniques (lettres, chiffres, `-` et `_`).

## Modifier l'outil

| Pour changer… | Modifier… |
| --- | --- |
| Son propre contenu (jours, couleurs, tâches, récompenses, règles, dates) | `perso.json`, puis le réimporter |
| Le contenu d'exemple publié | `SAMPLE`, en haut du premier `<script>` de `index.html` |
| La méthode du rapport | `RAPPORT` |
| Les questions de l'interview et leurs mots-clés | `INTERVIEW` (par catégorie) et `INTERVIEW_GENERIC` |
| L'apparence | les variables CSS en haut de `index.html` (`--day` et `--day2` suivent les couleurs du jour) |

Règles à garder si on modifie le code :

- les données sont enregistrées dans le navigateur (`localStorage`, clés `cap_v1` pour l'état et `cap_v1_contenu` pour le contenu importé). Si la forme de l'état change, mettre à jour `normalize()` pour qu'elle accepte l'ancien format ;
- un seul gestionnaire d'événements, posé sur `document` : un nouvel élément cliquable reçoit un attribut `data-act` et un `case` dans `handle()` ;
- tout élément décoratif reçoit `pointer-events: none` ;
- tout appel asynchrone a un délai maximum et un repli.

## Tests

Sans navigateur et sans rien installer, depuis ce dossier :

```bash
osascript -l JavaScript tests/run.js
```

(sur macOS ; avec Node : `node tests/run.js`). Les tests tournent sur le contenu d'exemple, puis sur `perso.json` s'il est présent. Ils vérifient la normalisation de l'état et du contenu (vide, `null`, tronqué, ancien format, champs invalides), les règles de calcul, l'interview, que chaque vue produit du HTML aux balises équilibrées avec des éléments cliquables, quelques pièges connus dans le code source, et qu'aucun texte ni aucune date de `perso.json` n'apparaît dans un fichier publié.

## Déployer sur GitHub Pages

1. Pousser le dépôt sur GitHub (branche `main`).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, choisir `main` et `/ (root)`, puis **Save**.
3. Après une minute, l'adresse `https://<pseudo>.github.io/<dépôt>/` s'affiche en haut de la page Pages. L'ouvrir sur le téléphone, importer `perso.json`, puis « Ajouter à l'écran d'accueil » (et réimporter depuis l'icône).
