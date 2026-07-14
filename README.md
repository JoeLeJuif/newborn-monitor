# Suivi bébé

Petite application mobile pour suivre l'alimentation et les couches d'un
nouveau-né. Conçue pour être utilisable rapidement, même la nuit : gros boutons,
utilisable d'une seule main, mode sombre, et le moins de saisie possible.

**React + Vite**, 100 % local (aucun compte, aucune donnée envoyée à un serveur),
fonctionne **hors-ligne** (PWA installable).

> ⚠️ Cette application sert uniquement à consigner et résumer les observations
> des parents. Elle ne fournit **aucun avis médical** et n'affirme pas qu'un bébé
> est suffisamment hydraté ou alimenté.

## Lancer le projet

```bash
npm install
npm run dev
```

Ouvre l'URL affichée (par défaut `http://localhost:5173`). Pour tester le rendu
mobile, ouvre les outils de développement du navigateur et active le mode
appareil mobile (ex. iPhone / Pixel), ou ouvre l'URL réseau sur ton téléphone
avec `npm run dev -- --host`.

## Build de production

```bash
npm run build
npm run preview
```

Le service worker (offline) n'est actif qu'en build de production
(`build` / `preview`), pas en `dev`.

## Fonctionnalités

- **Boire** : type d'alimentation (sein gauche/droit/les deux, colostrum,
  lait maternel au biberon, préparation), quantité en ml, minuterie
  d'allaitement (démarrer, pause, changer de sein, terminer), heure de début
  ajustable, boire « en cours », note (avec suggestions).
- **Couche** : gros boutons Pipi / Caca (ou les deux), quantité, couleur et
  texture du caca, note.
- **Tableau de bord** : âge du bébé, temps depuis le dernier boire / pipi / caca,
  compteurs et total en ml des dernières 24 h, dernier sein utilisé.
- **Historique** chronologique regroupé par jour.
- **Résumé par période** : aujourd'hui, 24 h, hier, 7 derniers jours.
- **Consulter / modifier / supprimer** (avec confirmation) chaque événement,
  y compris corriger l'heure d'un enregistrement fait en retard.
- **Profil du bébé** : prénom, naissance, poids, sexe (optionnel), photo
  (optionnelle), âge calculé automatiquement.
- **Export / partage** d'un résumé des dernières 24 h en texte ou CSV
  (partage natif, copie, ou téléchargement).
- **Interface** en français, mobile-first, gros boutons, mode sombre
  (auto / clair / sombre), confirmation visuelle après chaque enregistrement.

## Architecture

```
src/
├── lib/
│   ├── constants.js   # libellés et options (types, couleurs, textures…)
│   ├── time.js        # formatage des dates, durées, âge, temps écoulé
│   ├── storage.js     # persistance localStorage (events, profil, thème)
│   ├── summary.js     # calculs 24 h, périodes, tableau de bord
│   └── export.js      # génération résumé texte / CSV
├── store/
│   └── useStore.jsx   # contexte React + persistance (CRUD des événements)
├── components/
│   ├── Home.jsx           # accueil : 3 gros boutons + raccourci + dashboard
│   ├── FeedForm.jsx       # boire + minuterie d'allaitement
│   ├── DiaperForm.jsx     # couche (pipi / caca)
│   ├── History.jsx        # historique par jour
│   ├── EventEditor.jsx    # détail / modifier / supprimer
│   ├── PeriodSummary.jsx  # résumé par période
│   ├── BabyProfile.jsx    # profil du bébé
│   ├── ExportShare.jsx    # export / partage
│   ├── BottomNav.jsx      # navigation basse
│   ├── Toast.jsx          # confirmation visuelle
│   └── ConfirmDialog.jsx  # confirmation de suppression
└── App.jsx            # navigation, thème, composition
```

### Décisions techniques

- **Persistance locale (`localStorage`)** : hors-ligne, aucun compte, aucune
  donnée superflue collectée.
- **Prêt pour une future synchro à deux parents** : chaque événement porte un
  `id`, `createdAt`, `updatedAt` et un `deviceId` — base suffisante pour une
  fusion/synchronisation ultérieure (ex. Supabase) sans casser le format.
- **Navigation par pile d'état** (sans routeur) : moins de dépendances, retour
  simple, onglets sans empilement.
- **PWA** : `manifest.webmanifest` + `public/sw.js` (réseau d'abord, repli sur
  le cache) → installable et utilisable hors-ligne après la première visite.

## Données & vie privée

Toutes les données restent sur l'appareil (`localStorage`). Aucune inscription,
aucun envoi réseau. L'export ne se fait qu'à la demande explicite de
l'utilisateur (partage / copie / téléchargement de fichier).
