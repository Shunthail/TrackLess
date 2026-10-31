<h1 align="center">TrackLess</h1>

TrackLess est une extension navigateur qui bloque les requêtes vers des domaines connus pour le tracking publicitaire, la mesure d’audience et le fingerprinting.

Son interface permet de consulter les blocages récents de l’onglet actif, de choisir les catégories à filtrer et d’ajouter des exceptions pour certains sites.

Le projet utilise JavaScript pour le moteur de blocage, React pour l’interface et SASS pour les styles. Deux versions sont générées pour les navigateurs Chromium et Firefox.

## Installation

### Prérequis

- Git
- Node.js 24 avec npm
- Un navigateur Chromium comme Chrome, Edge ou Brave, ou Firefox 140 minimum

### Récupérer le projet

Depuis le dossier dans lequel tu souhaites installer le projet :

    git clone https://github.com/Shunthail/TrackLess.git
    cd TrackLess

### Installer les dépendances

    npm ci

### Compiler l’extension

    npm run build

Cette commande génère les deux versions de l’extension :

- `dist/chrome` pour les navigateurs Chromium
- `dist/firefox` pour Firefox

### Charger l’extension dans Chrome

1. Ouvre `chrome://extensions`.
2. Active le mode développeur.
3. Clique sur « Charger l’extension non empaquetée ».
4. Sélectionne le dossier `dist/chrome`.

Sur Edge ou Brave, utilise la page de gestion des extensions du navigateur et sélectionne le même dossier.

### Charger l’extension dans Firefox

1. Ouvre `about:debugging#/runtime/this-firefox`.
2. Clique sur « Charger un module complémentaire temporaire ».
3. Sélectionne le fichier `dist/firefox/manifest.json`.

Cette installation est temporaire. Il faudra charger à nouveau l’extension après le redémarrage de Firefox.

### Utiliser TrackLess

Ouvre un site puis clique sur l’icône de l’extension pour consulter les blocages récents de l’onglet actif.

Les réglages permettent d’activer ou de désactiver les catégories de filtrage et d’autoriser certains sites.

Aucune activité n’est préenregistrée. Les compteurs sont alimentés par les blocages réellement relevés.

### Aperçu de l’interface

Pour consulter l’interface dans une page web :

    npm run dev

L’aperçu est accessible sur http://127.0.0.1:3040.

Le blocage et les relevés nécessitent de charger l’extension dans le navigateur. L’aperçu web seul ne dispose pas de ces fonctionnalités.

### Vérifications

Pour exécuter les tests et compiler les deux versions :

    npm run check

### Générer les archives

    npm run package

Les archives sont créées dans le dossier `artifacts` :

- `trackless-chrome.zip`
- `trackless-firefox.zip`

## Protection de la vie privée

TrackLess fonctionne sans compte ni serveur. Les préférences sont conservées dans le navigateur et aucune activité de navigation n’est transmise à un service externe.

Le relevé présente les blocages des cinq dernières minutes. Il ne conserve pas les URL complètes, les paramètres des pages ni leur contenu.

Le filtrage repose sur une liste embarquée de domaines connus. Il ne couvre pas tous les trackers et ne garantit pas une protection complète contre le fingerprinting.

## À propos du projet

TrackLess est un projet réalisé avec un groupe d’amis de l’école. Mon travail s’est concentré sur l’analyse des domaines de tracking et la logique de filtrage des requêtes, avec une attention particulière aux exceptions par site et à la limitation des faux positifs.

J’ai également travaillé sur la gestion des relevés pour présenter les blocages utiles sans constituer un historique détaillé de navigation.

Pour préserver mon anonymat et celui des autres participants, j’ai adapté cette version publique en retirant les informations personnelles présentes dans le projet, notamment les noms, les prénoms et les coordonnées.

Ce dépôt accompagne la présentation de mes compétences sur [shunthail.fr](https://shunthail.fr). Il s’adresse notamment aux recruteurs qui souhaitent consulter mon travail et explorer le code sans avoir à me contacter au préalable.

## Réutilisation et contact

Vous pouvez utiliser le code ou vous inspirer du projet sans me demander d’autorisation. Un message reste toujours apprécié si ce travail vous aide à lancer un projet ou à développer une idée.

Si vous avez une question ou besoin d’aide, vous pouvez me contacter sur Discord : **shunthail**.
