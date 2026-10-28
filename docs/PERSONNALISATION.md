# Personnalisation de la fiche projet — plan d'implementation

Le porteur d'un projet personnalise sa fiche : banniere avec point focal,
palette de quatre couleurs, ordre et visibilite des sections de l'Apercu,
galerie de 8 images. Le front l'a entierement realise (contrat, ecrans,
mock MSW, moderation) ; le backend core n'en a rien. Ce document decoupe le
travail backend en etapes livrables une a une, chacune terminee par une
verification, de sorte qu'a la fin le front n'ait qu'a pointer sur le vrai
serveur.

## Suivi

| # | Etape | Statut |
| --- | --- | --- |
| 1 | Contrat : recopie depuis le front | Fait |
| 2 | Socle : modele, configuration, detection WebP/AVIF, URL signees stables, `sharp` | Fait |
| 3 | Depot d'image et miniature (`POST .../customization/images`) | Fait |
| 4 | Enregistrement (`PATCH .../customization`) et lecture dans `Project` | A faire |
| 5 | Cartes : `ProjectSummary.accent` et `banner` (miniature) | A faire |
| 6 | Retrait d'image et moderation (`DELETE`, `GET /admin/.../media`, notification) | A faire |
| 7 | Cycle de vie : orphelins, transfert, purge R-X3 de tous les fichiers | A faire |
| 8 | Finitions, documentation, branchement du front | A faire |

Decisions du 28/10/2026 (voir « Decisions prises ») : URL signees pour
toutes les images, miniature des cartes dans ce lot, image retiree du
brouillon supprimee a l'enregistrement, notification `admin_decision` au
porteur, et la purge R-X3 supprime du stockage tous les fichiers du projet.

## Point de depart

**Cote front (fait autorite, regle du depot).**

- Scope et decisions : `highfive-frontend/docs/v2/customization-scope.md`.
- Regles serveur : `docs/v2/backend/SPEC.md`, section « Projets », point
  « Personnalisation de la fiche ».
- Routes : `docs/v2/API-ROUTES.md` (trois routes « Projets », une route
  « Administration »), `docs/v2/backend/openapi.yaml`, `schemas/`.
- Schemas zod : `src/domain/customization.ts` (nouveau),
  `src/domain/project.ts` (`Project.customization`, `ProjectSummary.accent`,
  `ProjectSummary.banner`), `src/domain/admin.ts` (`remove_project_media`,
  `AdminProjectMedia`).
- Client : `src/api/customization.ts`, `src/api/admin.ts`
  (`getAdminProjectMedia`). Le client traduit deja une route absente (404
  sans corps du contrat, 405, 501) en « La personnalisation n'est pas encore
  disponible sur ce serveur » : c'est ce que voit l'interface aujourd'hui en
  mode `http`.
- Mock de reference : `src/mocks/handlers/customization.ts` et la route
  media de `src/mocks/handlers/admin.ts`.

**Cote backend.** Rien : ni schema, ni table, ni route. L'ecart mesure
(`src/domain/` du front contre `src/contracts/`) se limite a :

- `customization.ts` absent ;
- `project.ts` : `customization`, `accent`, `banner` absents ;
- `admin.ts` : `remove_project_media` et `adminProjectMediaSchema` absents ;
- `openapi.yaml` : 92 operations contre 97 cote front — les trois routes
  de personnalisation, `GET /admin/projects/{slug}/media`, et
  `POST /reports`, desormais au contrat front (le backend la sert deja,
  `contract-diff.mjs` la liste encore comme ajout assume) ;
- `notification.ts` : un commentaire (`/lab/etapes` au lieu de
  `/lab/taches`), sans effet.

**Briques existantes a reutiliser.**

- `StorageService` (`common/storage`) : `put`, `remove`, `signedUrlFor`.
  Lecture anonyme ouverte sur `avatars/*` et `projects/*` seulement.
- `detectMimeType` / `assertSize` / `requireFile` (`common/http/upload.ts`).
- Depot en deux temps de la messagerie (R-MSG8) : `message_uploads`,
  purge des orphelins par l'entretien — meme schema de pensee ici.
- `ProjectAccessService` : `findBySlugOrFail`, `assertCanView`, `summarize`
  (cartes en lot, sans N+1).
- `AdminService.journal` (R-S4) et la notification `admin_decision` (R-S3),
  comme dans `deleteProject`.
- `MaintenanceService.run` (entretien periodique) et
  `@Throttle` (`@nestjs/throttler`, compte par personne).

## Decisions de conception

Les choix qui touchent le produit ont ete valides (voir « Decisions
prises »).

### D1. Stockage : une colonne `jsonb` qui reference, une table d'images

- `projects.customization jsonb NULL` : la personnalisation telle que le
  `PATCH` la remplace (objet complet), **mais les images y sont referencees
  par leur id, sans URL** :
  `{ banner?: { imageId, alt, focal }, theme?, sections, gallery: [{ imageId, alt, caption? }] }`.
  `NULL` = fiche par defaut (`Project.customization` absent).
- `project_images` : une ligne par image deposee (`id`, `project_id`
  FK `ON DELETE CASCADE`, `uploaded_by`, `storage_key`, `mime_type`, `size`,
  `uploaded_at`, `attached_at` nullable).
- **Pourquoi pas des tables normalisees** pour sections et galerie : le
  contrat remplace l'objet en entier, ne lit jamais une section seule et
  borne la galerie a 8 ; une colonne `jsonb` ecrite d'un bloc colle au
  contrat et evite cinq tables. L'integrite referentielle image ↔ projet est
  tenue par le service (D4), pas par la base.
- **Pourquoi pas les URLs dans le `jsonb`** : elles sont signees et
  expirent (D2) ; on les calcule a la lecture. Le serveur **ignore toujours
  l'`url` du corps** (SPEC : « ne jamais accepter une URL arbitraire »).

### D2. Confidentialite des images (R-V3)

- Prefixe **prive** `customization/<projectId>/`, hors de la politique de
  lecture publique ; lecture par URL signee, comme les pieces jointes de
  messages. Une meme regle pour tous les projets : un projet public qui
  passe prive ne laisse pas d'image lisible a une adresse publique (ce qui
  arriverait avec `projects/*`).
- **URL stable pour le cache** : la signature depend de l'heure de
  signature. On signe avec une date arrondie a une fenetre (ex. 6 h,
  `signingDate`) et une validite de deux fenetres (12 h, sous le plafond de
  7 jours de SigV4) : la meme image garde la meme URL pendant 6 h, le
  navigateur la met en cache, et une URL copiee cesse de fonctionner au plus
  tard 12 h apres. Signer ne coute aucun appel reseau.
- `StorageService` : ajouter `signedUrlFor(key, { ttl, window })` (ou un
  parametre de date) sans `ResponseContentDisposition` de telechargement
  (`inline` suffit).
- Qui obtient l'URL : quiconque peut lire le projet (`assertCanView`) ou sa
  carte. Rien a ajouter : on ne sert le `Project`/`ProjectSummary` qu'a ceux
  qui ont le droit de le voir.

### D3. Types et tailles (equivalent R-F1/R-F2)

- Liste blanche : `image/jpeg`, `image/png`, `image/webp`, `image/avif`.
  GIF refuse (perte d'animation a la compression client), SVG refuse
  (script).
- **`detectMimeType` a completer** : WebP n'a pas de signature dans la table
  (on retombe sur le type annonce, donc non verifie) et **AVIF serait
  detecte comme `video/mp4`** (`ftyp` avec une marque inconnue). Ajouter
  WebP (`RIFF` + `WEBP` au decalage 8) et les marques `avif`/`avis` dans
  `FTYP_BRANDS`. Effet de bord a verifier : les fichiers de projet et les
  pieces jointes AVIF/WebP deviennent detectes correctement (ils l'etaient
  mal) — ce n'est pas une regression, mais a tester.
- 2 Mo au plus par image (le client compresse en WebP, bannière ≤ 1600 px,
  galerie ≤ 1200 px). Multer coupe au-dela (`limits.fileSize`), le 413 a
  deja un message francais.
- Quotas : 9 images referencees au plus (1 banniere + 8 galerie, garanti
  par le schema). Contre l'accumulation de depots non enregistres : 20
  images non rattachees au plus par projet (400 au-dela, « Enregistre ou
  retire tes images avant d'en ajouter »), et `@Throttle` 20 depots/minute
  par personne.

### D4. Cycle de vie d'une image

| Evenement | Effet |
| --- | --- |
| Depot | ligne `attached_at = NULL`, objet ecrit |
| `PATCH` qui la reference | `attached_at = now()` (si NULL) |
| `PATCH` qui ne la reference plus | ligne et objet supprimes (apres commit) |
| `DELETE .../images/:id` | reference retiree du `jsonb`, ligne et objet supprimes |
| Jamais rattachee apres 24 h | purgee par l'entretien |
| Projet supprime (R-X3, differe 30 j) | images conservees ; purge definitive : objets supprimes |
| Transfert | rien : la personnalisation suit le projet |

- Supprimer a l'enregistrement une image retiree du brouillon : le front
  ne le fait pas (il ne nettoie que les images deposees **dans la session**
  et jamais enregistrees), donc sans cela une image retiree de la galerie
  vivrait indefiniment.
- Objets supprimes **apres** le commit, et echec de suppression journalise
  sans faire echouer la requete (comportement actuel de
  `StorageService.remove`).

### D5. `Project.customization` sur toutes les reponses `Project`

Le front ecrit le `Project` renvoye dans son cache de la fiche apres
`PATCH /projects/:slug`, `transition`, `transfer` et
`PATCH .../customization`. Si une seule de ces reponses omettait
`customization`, la fiche perdrait banniere et couleurs jusqu'au
rechargement — et l'editeur enregistre justement les infos **avant** la
personnalisation. Donc : `toProject` reste un mapper pur, et un
`CustomizationService.resolve(project)` (ou un parametre `customization`
deja resolu) produit le champ pour les **cinq** sorties `Project` de
`projects.service.ts` (lignes `toProject(...)`) et pour la nouvelle route.

### D6. Le `PATCH /projects/:slug` generique ignore `customization`

Deja garanti : `projectUpdateInputSchema` ne le porte pas, et zod retire les
cles inconnues. A couvrir par un test.

---

## Etape 1 — Contrat

- Recopier depuis `highfive-frontend` (regle : jamais modifier ici d'abord) :
  - `src/domain/customization.ts` → `src/contracts/customization.ts`
    (imports en `.js`), exporte par `contracts/index.ts` ;
  - `project.ts`, `admin.ts` (et le commentaire de `notification.ts`) ;
  - `docs/v2/backend/openapi.yaml` → `openapi.yaml` ;
  - `docs/v2/backend/schemas/*.json` → `schemas/` (nouveaux :
    `ProjectCustomization`, `CustomizationSection`, `CustomizationSectionId`,
    `CustomizationImageUpload` ; modifies : `Project`, et ce que
    `export:schemas` regenere).
- `contract-diff.mjs` : les 4 nouvelles operations apparaissent comme
  « absentes » ; les lister temporairement dans `EXPECTED_MISSING` (avec
  renvoi a ce document), a retirer etape par etape. Retirer
  `POST /reports` de `EXPECTED_EXTRA`, desormais au contrat.
- Verification : `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm check:contract` ; diff normalise `src/domain` ↔ `src/contracts`
  vide (aux extensions d'import pres).
- **Fait**, depuis `highfive-frontend` `dev` (`b216bd8`) :
  - `src/contracts/customization.ts` ajoute, `project.ts`, `admin.ts` et
    `notification.ts` (commentaire) recopies ; `index.ts` exporte le
    nouveau fichier.
  - `openapi.yaml` et `schemas/` : copies conformes (11 schemas nouveaux,
    8 modifies par l'ajout de `accent`/`banner`/`customization`). Le bundle
    du front est a jour : `export:schemas` regenere ne differe que par
    l'ordre de deux cles (`minLength`/`maxLength`).
  - `contract-diff.mjs` : les 4 routes du lot dans `EXPECTED_MISSING`,
    `POST /reports` retire de `EXPECTED_EXTRA` (desormais au contrat).
  - Verifie : `typecheck`, `lint`, `test` (123) ; `check:contract` :
    97 operations au contrat, 95 servies, 4 absences assumees, aucune
    derive ; les 17 fichiers de contrat identiques au front (normalises),
    `schemas/` et `openapi.yaml` identiques octet pour octet.

## Etape 2 — Socle

- `ProjectImageEntity` (`project_images`) comme en D1, plus `thumb_key`
  (miniature, etape 3), index `(project_id)` et
  `(attached_at, uploaded_at)` pour la purge.
- `ProjectEntity.customization` : `jsonb`, nullable, type
  `StoredCustomization` (D1 : references par id) defini dans le module, pas
  dans `contracts/`.
- `Database.md` : section « Projets ».
- Configuration (`configuration.ts`) : `customization.maxImageBytes`
  (2 Mo), `allowedMimeTypes`, `maxPendingImages` (20),
  `orphanTtlMs` (24 h), `signedUrlWindowSeconds` (6 h).
- `detectMimeType` : WebP et AVIF (D3), avec tests.
- `StorageService` : URL signee a fenetre fixe (D2), avec test (deux
  signatures dans la meme fenetre sont identiques).
- Dependance `sharp` ; verifier qu'elle s'installe et se charge dans
  l'image `node:22-alpine` (build Docker).
- Verification : demarrage contre Postgres, la synchronisation cree la
  table et la colonne ; `typecheck`, `lint`, `test`, build Docker.
- **Fait.** Choix retenus :
  - `StoredCustomization` (type de stockage, pas de domaine) dans
    `project.entity.ts` : le `jsonb` ne reference les images que par id.
  - `ProjectImageEntity` : FK `ON DELETE CASCADE` vers `projects`, index
    partiel nomme `ix_project_images_pending` (`WHERE attached_at IS NULL`).
  - Module `customization` cree vide (il enregistre l'entite), branche dans
    `app.module.ts`.
  - `detectMimeType` : WebP par son conteneur RIFF ; AVIF par la marque
    principale **ou les marques compatibles** de la boite `ftyp` (un AVIF
    annonce souvent `mif1` en principale) ; lecture bornee a la boite.
    Effet sur les fichiers de projet et les pieces jointes : un AVIF n'est
    plus pris pour une video MP4, un WebP n'est plus cru sur parole.
  - `StorageService` : `putAt` (cle choisie, pour la miniature) et
    `stableSignedUrlFor` (signature au debut de la fenetre de 6 h, valable
    12 h).
  - `sharp` 0.34.5 ajoute **avec pnpm 10** : le lockfile ne gagne que des
    lignes (pnpm 9 retirait des annotations `libc`, pnpm 12 reecrivait les
    suffixes de dependances). `allowBuilds: sharp: false` : binaires
    precompiles, aucun script a lancer.
- Verifie : `typecheck`, `lint`, `test` (129, dont 4 de detection et 3 de
  signature stable) ; `check:contract` sans derive ; build Docker
  (`node:22-alpine`, pnpm 9.15.9 `--frozen-lockfile`) ; dans l'image,
  `sharp` decode un AVIF et produit une miniature WebP 640 px ; l'image
  demarree contre la base de demo cree `project_images`, ses deux index et
  la FK, et ajoute `projects.customization`.
- **Constate en passant, sans lien avec ce lot** : l'entretien periodique
  echoue sur `dev` (« Cannot read properties of null (reading 'id') »,
  `ChannelsService.syncConversation`). Dans une base creee avant le chat du
  Mur, l'index `uq_conversations_channel_project` garde son ancienne
  condition (`type = 'channel'`) : TypeORM ne compare les index que par leur
  nom. La conversation `wall` du projet entre en conflit avec le canal,
  l'insertion est ignoree, la relecture rend `null`. Les etapes de
  l'entretien qui precedent `reconcileAll` (purges) s'executent ; le
  rattrapage des canaux et du Mur, non.
  **Corrige ensuite** (commit a part) : l'index est renomme
  `uq_conversations_team_channel_project` ; la synchronisation supprime
  l'ancien et cree le bon. Verifie contre la base de demo : plus d'erreur,
  et le rattrapage cree les 8 conversations `wall` qui manquaient.

## Etape 3 — Depot d'image

- Module `modules/customization/` (controleur, service), enregistre dans
  `app.module.ts` ; il depend de `projects` (acces), pas l'inverse.
- `POST /projects/:slug/customization/images`, multipart `file`,
  `FileInterceptor('file', { limits: { fileSize } })`, 201,
  `CustomizationImageUpload` `{ id, url }`.
- Droits : **porteur seul** (`project.ownerId === user.id`), compte actif
  (suspendu : 403, comme R-C2). Co-porteur : 403 avec un message qui le dit
  (« Seul le porteur personnalise la fiche »). Projet invisible : 404 (on
  ne revele pas son existence), puis droit.
- Type reel (D3), taille, quota de depots en attente, `@Throttle`.
- Objet sous `customization/<projectId>/<uuid>.<ext>` ; `url` signee (D2).
- **Miniature** (SPEC : variante d'environ 640 px pour les cartes) : a
  chaque depot — on ne sait pas encore si l'image sera banniere ou
  galerie —, `sharp` produit une variante WebP de 640 px de large au plus
  (sans agrandir), stockee sous la meme cle suffixee `-640.webp`
  (`thumb_key`). Une image que `sharp` ne sait pas decoder est refusee
  (400) : c'est aussi une verification du contenu, au-dela de la
  signature.
- Tests unitaires : `detectMimeType` (WebP, AVIF, PNG renomme `.webp`,
  executable deguise), regle de droit.
- Verification (`smoke.mjs`) : depot par le porteur (201, URL lisible),
  co-porteur 403, membre 403, anonyme 401, GIF 400, SVG 400, 2 Mo + 1 octet
  400/413, quota de 20 en attente.

- **Fait.** Choix retenus :
  - `CustomizationService.upload` : projet introuvable ou invisible
    d'abord (404 brouillon, 403 prive, comme partout), puis
    `assertCanCustomize` (porteur seul, compte actif ; message dedie au
    co-porteur et au compte suspendu).
  - Ordre : taille, type reel, plafond des depots en attente, **miniature
    avant tout ecrit** (une image qui ne se decode pas ne laisse rien), puis
    original, miniature et ligne ; si la miniature ou la ligne echoue, les
    objets deja ecrits sont supprimes.
  - Extension de l'objet tiree du type reel, jamais du nom envoye.
  - Miniature : `sharp` avec orientation EXIF appliquee, 640 px sans
    agrandir, WebP qualite 80, **plafond de 40 millions de pixels** a la
    lecture (une image de 2 Mo peut se decompresser en gigaoctets).
  - Multer lit jusqu'a 4 Mo (le double du plafond) : un fichier un peu trop
    lourd recoit le 400 « Ce fichier depasse 2 Mo » ; Multer coupe
    exactement a sa limite, une marge d'un octet renvoyait le 413 generique.
- Verifie : 9 tests unitaires de plus (miniature : PNG, AVIF, pas
  d'agrandissement, contenu illisible, image demesuree ; droits ; nom de la
  miniature) ; contre la stack de demo (image Docker de la branche, port a
  part), 42 controles : les quatre formats (y compris WebP annonce PNG et
  AVIF annonce `application/octet-stream`) avec type reel enregistre, cle
  sous `customization/<projet>/`, miniature presente dans le stockage, URL
  signee lisible et URL non signee refusee (403) ; anonyme 401, membre,
  co-porteur, porteur d'un autre projet et porteur suspendu 403, projet
  prive d'autrui 403, brouillon d'autrui et projet inexistant 404 ; GIF,
  SVG, executable deguise, PNG illisible, 2 Mo + 1 octet et 3 Mo 400, 5 Mo
  413, sans fichier 400, 21e depot en attente 400. Les modifications
  temporaires de la base (role, visibilite, etat, compte) sont annulees.
- Non verifie : le plafond de debit (20 depots par minute), qui reprend le
  mecanisme deja en place sur les depots de messages. Les scenarios
  rejoindront `scripts/smoke.mjs` a l'etape 8, avec ceux des routes
  suivantes.

## Etape 4 — Enregistrement et lecture

- `PATCH /projects/:slug/customization`, `@ZodBody(projectCustomizationSchema)`
  (le `superRefine` du contrat couvre sections et galerie), reponse
  `Project`.
- Dans une transaction, verrou de la ligne projet
  (`SELECT ... FOR UPDATE`, deux `PATCH` simultanes ne s'entremelent pas) :
  1. ids references = banniere + galerie ; chacun doit etre une image **de
     ce projet** — sinon 400 (`details.images`), meme message que le mock ;
  2. ecrire le `jsonb` (D1, sans URL) ;
  3. `attached_at = now()` pour les references nouvellement rattachees ;
  4. supprimer les lignes rattachees qui ne sont plus referencees, et
     noter leurs cles ;
  5. `touch` du projet (`lastActivityAt`, comme toute ecriture sur la
     fiche).
  Apres commit : supprimer les objets notes.
- Lecture (D5) : `CustomizationService.resolve(project)` rend
  `Project.customization` avec les URLs signees ; absent si la colonne est
  `NULL`. Branche dans les cinq sorties `Project` de `projects.service.ts`.
- Coherence a la lecture : une reference vers une image disparue (ne
  devrait pas arriver, D4) est omise plutot que de rendre un objet invalide
  — et journalisee.
- Tests : resolution (references → URLs, `NULL` → absent, image manquante
  omise), `PATCH /projects/:slug` avec un champ `customization` ignore.
- Verification (`smoke.mjs`) : enregistrement complet (banniere, theme,
  5 sections, 8 images) puis `GET /projects/:slug` identique au corps aux
  URLs pres ; image d'un autre projet 400 ; id inconnu 400 ; 9 images 400 ;
  sections en double 400 ; couleur `#ABCDEF` 400 ; theme partiel 400 ;
  co-porteur 403 ; image retiree du brouillon → objet supprime ;
  `PATCH /projects/:slug` puis `transition` renvoient toujours
  `customization` ; reponses validees par `projectSchema` du front.

## Etape 5 — Cartes

- `ProjectAccessService.summarize` : `accent = customization.theme.accent`,
  `banner` = banniere resolue **sur sa miniature** (la fiche garde
  l'originale). Resolution **en lot** : la colonne est deja
  chargee avec le projet, les signatures sont locales — aucune requete de
  plus par carte (doc 11 C1). Tranche a l'etape 2 : le `jsonb` ne porte
  que l'id des images ; une requete `IN` sur `project_images` donne les cles
  pour tout le lot (une requete par lot, pas par carte).
- Toutes les listes en profitent (fil, Decouvrir, recherche, profil, « Mes
  projets », administration).
- Verification : `GET /feed/discover`, `/search`, `/me/projects`,
  `/users/:username/projects` portent `accent`/`banner` pour le projet
  personnalise, rien pour les autres ; nombre de requetes SQL inchange pour
  un fil de 12 projets.

## Etape 6 — Retrait et moderation

- `DELETE /projects/:slug/customization/images/:imageId`, corps facultatif
  `{ reason? }` (`reasonBodySchema` de l'administration, 1000 caracteres),
  204.
  - Porteur actif, ou `platformRole = admin` (meme sur un projet prive ou en
    brouillon : `findBySlugOrFail` sans `assertCanView` pour l'admin).
  - Image d'un autre projet ou inconnue : 404.
  - Retire la reference (banniere et/ou galerie) dans la meme transaction,
    puis ligne et objet.
  - Admin sur le projet d'un autre : `journal(admin, 'remove_project_media',
    'project', project.id, reason)` (R-S4) **et** notification
    `admin_decision` au porteur (R-S3, comme `deleteProject` — le mock ne
    notifie pas, ecart deja signale par SPEC). Porteur sur son propre
    projet, ou admin porteur : pas de journal.
- `GET /admin/projects/:slug/media` : `AdminProjectMedia`
  `{ banner?, gallery }`, URLs resolues, y compris projet prive ou
  brouillon ; admin seulement (401/403). Projet supprime (`deletedAt`) :
  404, comme les autres routes.
- Verification (`smoke.mjs`) : porteur retire une image de sa galerie
  (reference disparue, objet supprime, pas de journal) ; admin retire la
  banniere d'un projet prive avec motif (journal `remove_project_media`,
  notification `admin_decision` au porteur, `GET /admin/stats` et le
  journal coherents) ; membre 403 ; image d'un autre projet 404 ;
  `GET /admin/projects/:slug/media` d'un brouillon prive.

## Etape 7 — Cycle de vie

- Entretien periodique (`MaintenanceService.run`) :
  `CustomizationService.purgeOrphans()` — lignes `attached_at IS NULL` et
  `uploaded_at < now() - 24 h`, objets puis lignes, par lots.
- Purge definitive R-X3 (`purgeDeleted`) : avant
  `projects.delete(...)`, lire les cles des images des projets purges et
  supprimer les objets (originale et miniature ; la cascade ne supprime
  que les lignes). **Decision : la purge supprime du stockage tous les
  fichiers du projet** — elle laisse aujourd'hui aussi les fichiers de
  projet (`project_files`). A inventorier au debut de l'etape : tout ce qui
  est ecrit dans le stockage au nom d'un projet (fichiers, images, pieces
  jointes du canal si elles survivent a la suppression du canal, Mur) et,
  pour les comptes anonymises, l'avatar.
- Transfert (`POST /projects/:slug/transfer`) : aucune action, la
  personnalisation suit le projet ; le nouveau porteur la modifie, l'ancien
  (devenu co-porteur) ne le peut plus.
- Verification : purge d'un depot de plus de 24 h (date forcee en base),
  depot rattache conserve ; transfert puis `PATCH` par le nouveau porteur
  200, par l'ancien 403 ; projet purge → plus aucun objet sous ses
  prefixes dans le seau (images, miniatures, fichiers de projet).

## Etape 8 — Finitions et branchement du front

- `seed.mjs` : un projet de demonstration personnalise (theme, sections
  reordonnees, banniere et deux images generees — pas de fausses photos,
  `PRODUCT.md` du front), idempotent.
- `README.md`, `REFACTO-V2.md`, `CLAUDE.md` (le contrat passe de 92 a 97
  operations : les 4 de ce lot et `POST /reports`), `Database.md`,
  `scripts/README.md`, `CHANGELOG.md`, version mineure.
- `contract-diff.mjs` : `EXPECTED_MISSING` vide de nouveau.
- **Branchement du front** : aucun code front a ecrire. En mode `http`,
  verifier de bout en bout dans l'interface : editeur
  `/projets/:slug/modifier` (depot avec compression, point focal, sections
  par boutons et glisser-deposer, couleurs, garde de sortie), fiche
  (banniere, palette imposee, galerie et visionneuse), cartes (accent,
  banniere recadree), administration (bouton « Medias », retrait avec
  motif). Le message « La personnalisation n'est pas encore disponible sur
  ce serveur » ne doit plus apparaitre.
- Front, a mettre a jour ensuite : `customization-scope.md` (statut,
  branche), `CHANGELOG.md`.

## Decisions prises

1. **URL signees pour toutes les images (D2)**, a fenetre fixe pour le
   cache, sous un prefixe prive. Pas de lecture publique, meme pour un
   projet public.
2. **Miniature des cartes dans ce lot** : `sharp`, WebP 640 px, generee au
   depot (etapes 2, 3 et 5).
3. **Image retiree du brouillon supprimee a l'enregistrement (D4).**
4. **Notification `admin_decision` au porteur** quand l'administration
   retire un de ses medias (R-S3), en plus du journal (R-S4).
5. **Purge R-X3 : tous les fichiers du projet sont supprimes du stockage**
   (etape 7), pas seulement les images de personnalisation.

A garder en tete, sans action : le contraste du theme n'est pas verifie
par le serveur (SPEC) ; un client autre que le front pourrait enregistrer
une palette illisible, que le front corrige a l'affichage.

## Fichiers touches (prevision)

```
src/contracts/{customization,project,admin,notification,index}.ts
openapi.yaml, schemas/*.json
src/entities/{project-image.entity,project.entity,index}.ts
src/common/http/upload.ts (+ upload.spec.ts)
src/common/storage/storage.service.ts
src/common/config/configuration.ts
src/modules/customization/ (nouveau : module, controleur, service, spec)
src/modules/projects/{projects.service,project-access.service}.ts
src/modules/admin/{admin.controller,admin.service}.ts
src/modules/maintenance/maintenance.service.ts
src/modules/files/files.service.ts (purge des objets)
package.json (sharp)
src/app.module.ts
scripts/{contract-diff,smoke,seed}.mjs
Database.md, README.md, CLAUDE.md, CHANGELOG.md, docs/REFACTO-V2.md
```
