# Scripts

Tous parlent a l'API HTTP ou aux services voisins, jamais directement a la
base : ce qu'ils produisent et verifient est ce qu'un client normal obtiendrait.

| Script | Role | Prerequis |
| --- | --- | --- |
| `seed.mjs` | Jeu de demonstration (5 personnes, 5 projets, highfives, equipes, conversations). | API demarree |
| `smoke.mjs` | Parcours de bout en bout : ~200 verifications, et **un rapport de couverture** — toute route servie qui ne serait appelee par aucun scenario fait echouer le script. | API demarree, `ADMIN_EMAILS`, MinIO pour les fichiers |
| `smoke-integration.mjs` | Ce que `smoke.mjs` ne peut pas voir : la chaine complete du Mur (jeton du core -> Hocuspocus -> export -> taches) avec un vrai client Yjs, et les jobs reellement deposes sur les files du service IA. | API, service canvas, Redis |
| `contract-diff.mjs` | Compare les routes des controleurs a celles d'`openapi.yaml`. Ne demande rien de demarre : utilisable en integration continue. | — |

```bash
docker compose up -d db redis minio
pnpm build
ADMIN_EMAILS=admin@highfive.test node dist/main.js &

pnpm check:contract          # sans rien demarrer
node scripts/seed.mjs
node scripts/smoke.mjs
node scripts/smoke-integration.mjs
```

`API_URL` change la cible (par defaut `http://localhost:3000`).

## Ce qui reste hors de portee de ces scripts

- **Reinitialisation de mot de passe, chemin complet** : le jeton n'est envoye
  par aucun canal (pas de service de courriel), il n'est que journalise. Seuls
  le 204 systematique et le refus d'un jeton invalide sont verifies.
- **Lecture seule du role `viewer` sur le document du Mur** : appliquee par le
  service canvas, non verifiee depuis le core.
- **Recommandations du service IA** : seule la degradation est verifiee (IA
  injoignable, le fil repond quand meme). Le classement lui-meme demande une
  instance du service IA avec ses embeddings.
