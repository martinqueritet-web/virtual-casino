# VIRTUAL CASINO

Casino de simulation entre amis : poker Texas Hold'em multijoueur, blackjack (avec mode entraînement) et 5 machines à sous.
**Crédits virtuels (VC) uniquement : fictifs, gratuits, non achetables, sans aucune valeur.**

## Architecture

| Partie | Technologie |
|---|---|
| Site | React + TypeScript + Tailwind + Framer Motion, compilé en **un seul fichier `index.html`** (Vite + vite-plugin-singlefile) |
| Serveur de jeu | Une fonction Netlify (`netlify/functions/api.mts` → `server/`) |
| Base de données | Netlify DB (PostgreSQL), migrations dans `netlify/database/migrations/` |
| Multijoueur | Synchronisation par interrogation courte (~1 s) avec numéro de version ; chaque action est une transaction SQL sous verrou de ligne |

Le serveur fait autorité sur tout : paquet de cartes, cartes privées, tours de jeu, résultats, crédits.
Les cartes adverses ne sont jamais envoyées au navigateur avant l'abattage.

```
server/
  games/cards.ts       cartes, mélange cryptographique
  games/evaluator.ts   évaluation des mains + libellés français (« Paire de Rois »)
  games/poker.ts       moteur Texas Hold'em (blinds, side pots, égalités, départs)
  games/blackjack.ts   blackjack S17 + stratégie de base (mode entraînement)
  games/slots.ts       machines à sous (taux de retour théorique 96,2 %)
  core.ts              comptes, sessions, portefeuille, profils, stats
  rooms.ts             salons privés, chat, hôte, exclusion, poker multijoueur
  solo.ts              blackjack et machines à sous côté serveur
  api.ts               routeur HTTP /api/*
client/src/            interface
tests/                 27 tests (moteurs + API sur vrai PostgreSQL)
```

## Lancer en local

```bash
npm install
# PostgreSQL local, puis :
export DATABASE_URL="postgresql://postgres@localhost:5432/casino_dev"
psql "$DATABASE_URL" -f netlify/database/migrations/20261124120000_init.sql
npm run build
npx tsx scripts/local-server.ts      # http://localhost:8888
```

Tests : `DATABASE_URL=postgresql://…/casino_test npm test` (la base de test est vidée).

## Mise en ligne

Projet Netlify `virtual-casino-69`. À chaque déploiement, Netlify compile le site, déploie la fonction,
crée la base PostgreSQL et applique les migrations automatiquement.

Le fichier `dist/index.html` peut aussi être ouvert directement ou hébergé ailleurs :
il contacte alors le serveur `https://virtual-casino-69.netlify.app/api`.
