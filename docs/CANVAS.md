# Le Mur — inventaire des fonctions du canvas

Le Mur (doc 04 §10, V2-10) remplace les deux anciens espaces de travail
(« Canvas » collaboratif et « Moodboard » de post-its). Il repose sur deux
morceaux :

- **`core_backend/src/modules/wall/`** — droits, metadonnees, conversion en
  taches, emission du jeton d'acces ;
- **`highfive-backend-canvas/`** — le document collaboratif lui-meme (Yjs via
  Hocuspocus), sa persistance S3/MinIO, et son export semantique.

Le partage des roles ne bouge pas : **le canvas ne connait rien des projets**.
Il ne sait que verifier un jeton et servir un document. Tous les droits sont
decides dans le core, qui signe ce jeton.

---

## 1. Fonctions appelees par le front

| Fonction | Route | Ou |
| --- | --- | --- |
| Lire les metadonnees du Mur (apercu, date de modification) | `GET /api/projects/{slug}/wall` | core |
| Convertir une selection d'elements en taches (R-W2) | `POST /api/projects/{slug}/wall/to-tasks` | core |
| Droits de lecture/ecriture (R-W1 : jamais public, meme sur un projet public) | — | core |
| Edition du dessin (tldraw) | — | front, en local (`persistenceKey`) |

**Precision sur la conversion.** Le front envoie des identifiants de shapes
tldraw. Le core demande au service canvas l'export du document et reprend le
**texte reel** de chaque element comme titre de tache. Le Mur du front tournant
aujourd'hui en local (aucun provider Hocuspocus branche), ces elements sont le
plus souvent inconnus du serveur : on retombe alors sur un libelle generique
(« Idee du Mur 1 »), sans jamais echouer. Le lien vers l'origine
(`wallOriginId`) est conserve dans les deux cas.

---

## 2. Fonctions deja implementees, **non appelees par le front**

Elles sont conservees telles quelles. Aucune n'est branchee a un ecran
aujourd'hui ; toutes restent joignables et testables.

| Fonction | Ou | Route / mecanisme | Pourquoi elle est gardee |
| --- | --- | --- | --- |
| **Session collaborative** : emission du JWT Hocuspocus (role projet projete en `admin`/`editor`/`viewer`, expiration 1 h) | core | `GET /api/projects/{slug}/wall/session` | Sans elle le service canvas est litteralement injoignable : c'est le seul emetteur de jetons. |
| **Synchronisation CRDT temps reel** (Yjs, multi-curseurs, resolution de conflits) | canvas | WebSocket Hocuspocus | Le front v2 fait tourner tldraw en local ; brancher le provider ne demande aucun travail serveur supplementaire. |
| **Persistance S3/MinIO du document** (extension `@hocuspocus/extension-s3`, debounce 5 s / 30 s max) | canvas | — | Le document survit au redemarrage et a la deconnexion de tout le monde. |
| **Creation automatique du bucket au demarrage** | canvas | `src/storage/bucket.ts` | Rend le service utilisable sans preparation manuelle en developpement. |
| **Lecture seule pour le role `viewer`** (`connectionConfig.readOnly`) | canvas | hook `onAuthenticate` | Applique cote document le role decide par le core. |
| **Expiration de connexion a 1 h** | canvas | hook `onAuthenticate` | Une session WebSocket ouverte indefiniment survivrait a la revocation du droit. |
| **Export semantique du document** : traduction des records tldraw en elements (`note`, `text`, `shape`, `arrow`, `drawing`), resolution du texte des fleches liees, aplatissement du texte riche ProseMirror | canvas | `GET /canvas/{canvasId}/export`, protege par `X-Internal-Secret` | C'est ce qui rend le Mur exploitable par le core (titres de taches, IA). |
| **Sonde de sante** | canvas | `GET /health` | — |
| **Proposition de taches par un modele de langage** a partir du Mur (post-its, formes, fleches, discussion) — rien n'est persiste | core | `POST /api/projects/{slug}/wall/suggest-tasks` | Fonction complete et testee ; il ne manque que l'ecran. |
| **Acceptation des taches proposees** (la personne tranche avant toute ecriture, R-IA-1) | core | `POST /api/projects/{slug}/wall/suggested-tasks` | Idem. |
| **Chat du Mur** : message publie en `stateless`, persiste dans le document Yjs (`Y.Array` « chat »), rediffuse aux connectes, et publie sur la file BullMQ `canvas_events` | canvas | hook `onStateless` | Explicitement **reporte**, code non touche. La messagerie a depuis un canal par projet (R-MSG3, `MESSAGERIE.md` etape 7) : les deux font double emploi, a trancher cote produit. |
| **Plusieurs documents par projet** (le modele distingue `canvasId` de `projectId`) | core + canvas | — | Le front n'expose qu'un seul Mur par projet ; le modele, lui, n'interdit pas d'en ouvrir un second plus tard. |

---

## 3. Ce que le contrat front ne porte pas encore

- **Apercu du Mur (`snapshotUrl`)** : le champ existe dans le contrat et dans
  la table, mais rien ne genere l'image (doc 04 §10 : regeneration toutes les
  10 minutes au plus). La colonne reste nulle tant que ce travail n'existe pas —
  le champ est alors simplement absent de la reponse, ce que le contrat autorise.
- **Reglage « Mur et Taches ouverts aux observateurs »** (doc 05 §3.3 note 1) :
  absent de `Project`. Le defaut du document produit est applique tel quel —
  les observateurs lisent Le Mur, seuls les membres l'ecrivent (ecart connu n°8
  de `SPEC.md`).
- **Mode hors ligne** (R-W3) : non prevu, ni cote front ni cote serveur.

---

## 4. Secrets partages

Deux valeurs doivent etre identiques de part et d'autre, sans quoi rien ne
fonctionne :

| Core | Canvas | Role |
| --- | --- | --- |
| `CANVAS_JWT_SECRET` | `JWT_SECRET` | Signature du jeton d'acces au document. |
| `CANVAS_INTERNAL_SECRET` | `INTERNAL_SECRET` | Authentifie l'appel `/export`, reserve au core. |
