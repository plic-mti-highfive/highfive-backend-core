/**
 * Contenu du jeu de demonstration (scripts/seed.mjs) : personnes, projets,
 * textes de commentaires et d'annonces.
 *
 * Les textes sont ecrits a la main et varies : le service IA en tire de vrais
 * embeddings (OpenAI), et des descriptions generiques donneraient des
 * recommandations sans relief. Les tags sont ceux de src/contracts/tag.ts.
 *
 * Les cinq premieres personnes et les cinq premiers projets sont ceux du front
 * (src/mocks/data/) : ne pas les renommer, l'e2e et les maquettes s'y referent.
 */

/** Les cinq personnes du front, inchangees. */
export const CORE_PEOPLE = [
  { username: 'alex.rivera', displayName: 'Alex Rivera', email: 'alex.rivera@example.com', bio: 'Fresques, murs et peinture qui deborde.', interests: ['dessin', 'quartier'] },
  { username: 'marc.leroy', displayName: 'Marc Leroy', email: 'marc.leroy@example.com', bio: 'Bricoleur du dimanche, soudeur le samedi.', interests: ['bricolage', 'reparation'] },
  { username: 'sophie.b', displayName: 'Sophie Bernard', email: 'sophie.b@example.com', bio: 'Jardin partage et compost collectif.', interests: ['jardinage', 'environnement'] },
  { username: 'yanis.f', displayName: 'Yanis Fournier', email: 'yanis.f@example.com', bio: 'Je code des petits jeux le soir.', interests: ['code', 'jeu-video'] },
  { username: 'lea.m', displayName: 'Lea Moreau', email: 'lea.m@example.com', bio: 'Cuisine de quartier, sans chichis.', interests: ['cuisine', 'solidarite'] },
];

export const FIRST_NAMES = [
  'Camille', 'Hugo', 'Inès', 'Lucas', 'Chloé', 'Nathan', 'Manon', 'Théo', 'Sarah', 'Mehdi',
  'Jade', 'Louis', 'Emma', 'Adam', 'Lina', 'Rayan', 'Zoé', 'Gabriel', 'Nina', 'Arthur',
  'Clara', 'Samuel', 'Maëlys', 'Karim', 'Juliette', 'Tom', 'Yasmine', 'Paul', 'Alice', 'Bilal',
  'Louise', 'Enzo', 'Anaïs', 'Victor', 'Salomé', 'Malik', 'Romane', 'Jules', 'Aya', 'Noah',
  'Elsa', 'Ibrahim', 'Margaux', 'Léo', 'Fatou', 'Antoine', 'Agathe', 'Sami', 'Célia', 'Maxime',
  'Océane', 'Kenzo', 'Lou', 'Moussa', 'Charlotte', 'Axel', 'Rose', 'Nolan', 'Mila', 'Diego',
];

export const LAST_NAMES = [
  'Martin', 'Petit', 'Dubois', 'Lambert', 'Garcia', 'Roux', 'Fontaine', 'Chevalier', 'Benali', 'Robin',
  'Mercier', 'Blanc', 'Guérin', 'Faure', 'André', 'Rousseau', 'Diallo', 'Bonnet', 'François', 'Morel',
  'Girard', 'Nguyen', 'Lefèvre', 'Mathieu', 'Gauthier', 'Perrin', 'Haddad', 'Clément', 'Muller', 'Henry',
  'Leclerc', 'Traore', 'Lopez', 'Barbier', 'Arnaud', 'Colin', 'Vidal', 'Caron', 'Masson', 'Renard',
  'Picard', 'Brunet', 'Schmitt', 'Meyer', 'Lemoine', 'Ferreira', 'Aubert', 'Kone', 'Marchand', 'Roger',
];

/**
 * Communautes d'interets : une personne en tire l'essentiel de ses themes,
 * avec parfois un theme d'ailleurs. C'est ce qui donne aux vecteurs des
 * grappes nettes, et aux recommandations quelque chose a trouver.
 */
export const COMMUNITIES = [
  { weight: 3, tags: ['dessin', 'photo', 'video', 'musique', 'ecriture', 'spectacle'] },
  { weight: 2, tags: ['code', 'jeu-video', 'sciences', 'entraide-scolaire'] },
  { weight: 3, tags: ['jardinage', 'environnement', 'animaux', 'quartier'] },
  { weight: 3, tags: ['solidarite', 'cuisine', 'quartier', 'entraide-scolaire', 'langues'] },
  { weight: 2, tags: ['bricolage', 'reparation', 'environnement', 'quartier'] },
  { weight: 2, tags: ['sport', 'evenement', 'voyage', 'jeux', 'spectacle'] },
  { weight: 1, tags: ['histoire', 'langues', 'ecriture', 'sciences', 'photo'] },
];

/** Bouts de bio par theme : une bio en assemble deux, jamais le meme couple. */
export const BIO_BITS = {
  bricolage: ['Toujours une visseuse dans le sac.', "J'ai retape un atelier de A a Z, je peux aider pour le vôtre."],
  jardinage: ['Mains dans la terre dès que le temps le permet.', 'Je fais pousser des tomates sur un balcon de quatre mètres carrés.'],
  reparation: ['Je refuse de jeter ce qui peut se réparer.', "Technique dans l'âme, je démonte tout ce qui grésille."],
  cuisine: ['Je cuisine pour vingt aussi facilement que pour deux.', 'Fan de recettes de grand-mère et de marchés du dimanche.'],
  solidarite: ['Bénévole depuis le lycée, je ne compte pas les heures.', "Je crois aux coups de main plus qu'aux grands discours."],
  environnement: ['Zéro déchet en progrès, pas en perfection.', 'Je compte les oiseaux le week-end et je trie tout le reste.'],
  quartier: ["Je connais le nom de tous les commerçants de ma rue.", 'Fan des fêtes de voisins et des tables dans la rue.'],
  animaux: ["Famille d'accueil pour chats depuis trois ans.", 'Je promène les chiens du refuge le mercredi.'],
  musique: ['Guitare le soir, chorale le mardi.', 'Je bidouille des sons sur un vieux synthé.'],
  dessin: ['Carnet de croquis dans la poche, toujours.', 'Illustration le jour, peinture murale le week-end.'],
  video: ['Je filme tout, je monte la nuit.', 'Je réalise des courts métrages au téléphone.'],
  ecriture: ["J'écris des nouvelles que personne n'a encore lues.", 'Je tiens un atelier d’écriture dans un café.'],
  'jeu-video': ['Je développe des jeux en pixel art sur mon temps libre.', 'Du speedrun au game design, il n’y a qu’un pas.'],
  code: ['Développeur web, je donne volontiers un coup de main aux assos.', "J'apprends Python et j'adore automatiser des trucs inutiles."],
  photo: ['Je photographie les façades et les gens qui passent devant.', 'Argentique, développement maison, patience infinie.'],
  langues: ["Je parle quatre langues et j'en apprends une cinquième.", 'Je donne des cours de français aux nouveaux arrivants.'],
  sciences: ['Prof de physique, je fais des expériences avec ce qui traîne.', "Astronomie amateur : je sors le télescope au moindre ciel clair."],
  histoire: ["Passion : les archives et les vieilles cartes postales.", 'Je raconte l’histoire du quartier à qui veut l’entendre.'],
  'entraide-scolaire': ["J'aide aux devoirs deux soirs par semaine.", 'En master de maths, je donne du soutien gratuit au collège.'],
  sport: ['Course à pied le matin, foot en salle le jeudi.', 'Coach bénévole dans un club de basket.'],
  evenement: ["J'organise des événements depuis dix ans, rien ne me fait peur.", "Une fête ou un festival à monter ? J'en suis."],
  voyage: ['Six mois de vélo au compteur, je cherche une nouvelle aventure.', 'Je collectionne les cartes et les trains de nuit.'],
  jeux: ['Soirées jeux de société tous les vendredis.', 'Je mène une table de jeu de rôle depuis des années.'],
  spectacle: ['Théâtre amateur et impro le lundi soir.', 'Régie lumière : je rends les petites scènes magiques.'],
};

/**
 * Projets du jeu. Champs facultatifs :
 * - `owner` : porteur impose ; sinon la personne la plus proche des themes.
 * - `state` : `draft` (jamais publie), `done`, `archived` ; actif par defaut.
 * - `participation` : `open` par defaut.
 * - `private` : projet prive (sur invitation), absent du fil et de l'IA.
 * - `ageDays` : anciennete impose ; `hype` : attrait (1 = moyen) ;
 *   `buzz` : rafale de highfives ces derniers jours (ce qui fait la tendance).
 * - `photos` : banniere puis galerie, photos du domaine public (CC0 / PDM)
 *   designees par leur identifiant Openverse. Chacune a ete choisie et
 *   regardee a la main : une recherche par mot-cle, meme filtree
 *   (`mature=false`), renvoie parfois des images explicites. Ne jamais
 *   remplacer ces identifiants par une recherche.
 */
export const PROJECTS = [
  // --- Les cinq projets du front ---
  {
    owner: 'alex.rivera',
    title: 'Fresque murale collaborative',
    photos: [{ id: '94cfd8ac-6174-4270-920f-14c4afc9827f', alt: 'Fresque murale colorée le long d\'une passerelle' }, { id: 'ee3d4b1e-d75d-4f54-be8d-120ec9a85508', alt: 'Grenouille peinte sur un mur couvert de graffitis' }],
    tagline: 'Repeindre le mur du gymnase avec le quartier',
    description: "Un mur gris de trente metres, un quartier qui passe devant tous les jours. On veut le couvrir de couleurs, ensemble, un samedi par mois.",
    tags: ['dessin', 'quartier'],
    needs: [{ label: 'Peintres amateurs' }, { label: 'Pret d un echafaudage' }],
    ageDays: 95, hype: 2.2,
  },
  {
    owner: 'sophie.b',
    title: 'Jardin partage des Lilas',
    photos: [{ id: '1e02dbc9-7aa3-42a9-a73c-9e19e918b379', alt: 'Bacs de potager surélevés' }, { id: 'fbdb84a1-4d23-40f2-b602-a43510599075', alt: 'Rang de légumes en pleine croissance' }, { id: '3d82f39b-d945-49c1-a76a-a7d0f281468c', alt: 'Potager fleuri dans un parc' }],
    tagline: 'Transformer la friche en potager de quartier',
    description: "Deux cents metres carres de friche derriere l ecole. On defriche, on plante, on partage la recolte.",
    tags: ['jardinage', 'environnement'],
    needs: [{ label: 'Outils de jardinage' }],
    ageDays: 88, hype: 1.8, buzz: true,
  },
  {
    owner: 'marc.leroy',
    title: 'Repair cafe mensuel',
    photos: [{ id: 'b3f3d399-4896-4df0-8f41-8523b610074c', alt: 'Bénévoles réparant des appareils sur une grande table' }, { id: 'b130e68e-494f-42cc-9e02-9055a7d45eeb', alt: 'Réparation d\'un batteur électrique' }],
    tagline: 'Reparer ensemble plutot que jeter',
    description: "Un samedi par mois, on ouvre l atelier : grille-pain, velos, lampes. On repare, et surtout on montre comment faire.",
    tags: ['reparation', 'solidarite'],
    needs: [{ label: 'Electronicien bienveillant' }],
    ageDays: 102, hype: 1.6,
  },
  {
    owner: 'lea.m',
    title: 'Distribution de soupe',
    photos: [{ id: '596cb918-e726-4098-b5f2-b964df061aaf', alt: 'Bol de soupe de potiron' }],
    tagline: 'Une soupe chaude devant la gare, tous les jeudis',
    description: "On cuisine l apres-midi, on distribue le soir. Il faut des bras, des marmites et de la bonne humeur.",
    tags: ['cuisine', 'solidarite'],
    needs: [{ label: 'Conducteur avec un vehicule' }],
    ageDays: 70, hype: 1.4,
  },
  {
    owner: 'yanis.f',
    title: 'Petit jeu du quartier',
    tagline: 'Un jeu video qui se passe dans nos rues',
    description: "Une carte du quartier, des personnages inspires des gens d ici. Encore au stade des idees.",
    tags: ['jeu-video', 'code'],
    needs: [{ label: 'Quelqu un qui dessine' }],
    state: 'draft',
  },

  // --- Créer ---
  {
    title: 'Chorale intergénérationnelle',
    photos: [{ id: '45b4e20c-c193-4ca1-a6ab-7b871f3d3a08', alt: 'Chorale en concert, partitions à la main' }, { id: 'b458350c-28be-4631-8ab3-04be4ed90559', alt: 'Choristes chantant sur scène' }],
    tagline: 'Des voix de 8 à 88 ans, un concert à la fête de la musique',
    description: "On répète le mardi soir à la maison de quartier. Pas besoin de savoir lire une partition : il suffit d'aimer chanter. Objectif : un vrai concert en juin, avec les enfants de l'école et les résidents de l'EHPAD voisin.",
    tags: ['musique', 'spectacle', 'quartier'],
    needs: [{ label: 'Pianiste accompagnateur', tagId: 'musique' }, { label: 'Salle pour les répétitions' }],
    hype: 1.5,
  },
  {
    title: 'Court métrage tourné au téléphone',
    photos: [{ id: '9b4c3763-6ac0-46af-9c8f-5fc55d8e5079', alt: 'Clap de cinéma tenu devant des façades anciennes' }, { id: '3ee29b0c-8950-46ed-8e4a-705028212fa8', alt: 'Jeune femme filmant avec une caméra sur trépied' }],
    tagline: 'Un film de quinze minutes, entièrement filmé au smartphone',
    description: "Un scénario écrit à plusieurs, un tournage sur trois week-ends dans le quartier, une projection publique à la médiathèque. On cherche des acteurs, des monteurs et des gens qui savent tenir une perche son.",
    tags: ['video', 'ecriture', 'spectacle'],
    needs: [{ label: 'Monteur vidéo', tagId: 'video' }, { label: 'Acteurs amateurs' }, { label: 'Preneur de son' }],
    participation: 'on_request', hype: 1.3, buzz: true,
  },
  {
    title: 'Fanzine du quartier',
    photos: [{ id: 'e33b88c2-f54f-4895-9264-ae34fa3198c5', alt: 'Page dessinée d\'un fanzine' }, { id: '92f289f6-f942-4343-a534-a821a2e6c572', alt: 'Enfants découpant et collant du papier à un atelier' }],
    tagline: "Un journal photocopié, écrit et dessiné par les habitants",
    description: "Seize pages tous les deux mois : portraits de voisins, recettes, BD, petites annonces. Tiré à 300 exemplaires et déposé chez les commerçants. Chacun peut proposer un article, un dessin ou une photo.",
    tags: ['ecriture', 'dessin', 'quartier'],
    needs: [{ label: 'Maquettiste' }, { label: 'Illustrateurs', tagId: 'dessin' }],
    hype: 1.1,
  },
  {
    title: 'Portraits de commerçants',
    photos: [{ id: 'd16f7ae1-c256-4ae3-b7ba-519e66ea1e54', alt: 'Étal de légumes au marché et sa marchande' }, { id: '23098bc1-60ea-4c19-b51e-0eb6f58e8ca3', alt: 'Antiquaire au milieu de ses meubles' }],
    tagline: 'Une expo photo des visages qui font vivre la rue',
    description: "Trente portraits en noir et blanc des commerçants du quartier, avec quelques lignes sur leur histoire. L'expo sera accrochée dans les vitrines elles-mêmes pendant un mois.",
    tags: ['photo', 'quartier', 'histoire'],
    needs: [{ label: 'Tirages grand format' }, { label: 'Rédacteur pour les textes', tagId: 'ecriture' }],
    state: 'done', ageDays: 110, hype: 1.7,
  },
  {
    title: 'Atelier BD pour ados',
    photos: [{ id: '58588952-142a-4354-b730-27774b2a4e82', alt: 'Enfants autour d\'une table de dessin avec un illustrateur' }],
    tagline: 'Créer une bande dessinée de A à Z en dix séances',
    description: "Scénario, découpage, crayonné, encrage : on accompagne un groupe de collégiens jusqu'à l'impression d'un album collectif. Les séances ont lieu le mercredi après-midi à la médiathèque.",
    tags: ['dessin', 'ecriture', 'entraide-scolaire'],
    needs: [{ label: 'Dessinateur bénévole', tagId: 'dessin' }],
    hype: 1.0,
  },
  {
    title: 'Podcast des anciens du quartier',
    photos: [{ id: '472c746b-24e2-4ed9-80fb-c7f146b903ba', alt: 'Enregistrement d\'un podcast autour d\'une table' }, { id: 'd4c241f4-572d-4ac6-88bf-dd4659035ef2', alt: 'Petit enregistreur audio numérique' }],
    tagline: "Enregistrer les souvenirs avant qu'ils ne s'effacent",
    description: "Des entretiens d'une heure avec les habitants les plus anciens : l'usine, le marché, les bals. Montés en épisodes de vingt minutes et diffusés sur la radio associative.",
    tags: ['histoire', 'ecriture', 'musique'],
    needs: [{ label: 'Micro et enregistreur' }, { label: 'Monteur audio' }],
    hype: 0.9,
  },
  {
    title: 'Scène ouverte du vendredi',
    photos: [{ id: '2de2f02a-2f9f-4f8c-92b7-26f493526e22', alt: 'Musicien chantant avec sa guitare au micro' }, { id: 'f1f7ba9f-656c-4ad9-a5f3-4f144a65c90c', alt: 'Violon posé sur des percussions' }],
    tagline: 'Un micro, une scène, dix minutes chacun',
    description: "Slam, chanson, stand-up, poésie : tous les premiers vendredis du mois dans le bar associatif. On cherche des gens pour la technique, l'accueil et bien sûr des artistes qui osent.",
    tags: ['spectacle', 'musique', 'evenement'],
    needs: [{ label: 'Technicien son', tagId: 'musique' }],
    hype: 1.4, buzz: true,
  },
  {
    title: 'Mosaïque de la place du marché',
    photos: [{ id: 'ebc7e678-10e3-4d82-925f-4682fa7ea0f6', alt: 'Carreaux de faïence cassés assemblés en mosaïque' }, { id: 'a178f01d-943a-47c3-ab6c-e86478db5a5c', alt: 'Mosaïque de carreaux violets et gris' }],
    tagline: 'Habiller les bancs de la place avec des carreaux cassés',
    description: "On récupère de la vaisselle et du carrelage cassés, on dessine ensemble un motif, puis on pose la mosaïque sur les six bancs en béton de la place. Chantier prévu sur quatre week-ends.",
    tags: ['dessin', 'bricolage', 'quartier'],
    needs: [{ label: 'Carrelage et vaisselle cassés' }, { label: 'Colle et joints' }],
    participation: 'on_request', ageDays: 6, hype: 1.2, buzz: true,
  },
  {
    title: 'Clip pour le groupe du lycée',
    tagline: 'Tourner le premier clip de Nuit Blanche',
    description: "Le groupe du lycée a enregistré son premier morceau. Il manque un clip : une journée de tournage, un peu de lumière, beaucoup d'idées.",
    tags: ['video', 'musique'],
    needs: [{ label: 'Projecteurs' }],
    state: 'archived', ageDays: 105, hype: 0.6,
  },
  {
    title: 'Concours de nouvelles',
    tagline: "Écrire sur le thème « la porte d'à côté »",
    description: "Ouvert à tous, sans limite d'âge. Les textes sélectionnés seront lus à voix haute lors d'une soirée et publiés dans un petit recueil.",
    tags: ['ecriture'],
    needs: [{ label: 'Membres du jury' }],
    hype: 0.8,
  },

  // --- Tech ---
  {
    title: "Site web pour l'épicerie solidaire",
    tagline: "Un site simple pour afficher les horaires et les arrivages",
    description: "L'épicerie solidaire n'a qu'une page Facebook. On veut un petit site statique, facile à mettre à jour par les bénévoles, avec les horaires, les produits du jour et un formulaire pour devenir bénévole.",
    tags: ['code', 'solidarite'],
    needs: [{ label: 'Développeur front', tagId: 'code' }, { label: 'Graphiste' }],
    hype: 1.2,
  },
  {
    title: 'Club de robotique du samedi',
    photos: [{ id: 'acee97cf-a2b6-4507-a8dc-d6c8d82a4248', alt: 'Jeunes pilotant un robot télécommandé lors d\'une compétition' }, { id: '0a624192-2606-44b6-8982-40e657e467a5', alt: 'Petits robots en briques de construction' }],
    tagline: 'Construire des robots avec des collégiens',
    description: "Arduino, capteurs, moteurs récupérés sur des imprimantes : on apprend en construisant. L'objectif de l'année est de participer à la coupe de robotique régionale.",
    tags: ['sciences', 'code', 'entraide-scolaire'],
    needs: [{ label: 'Kits Arduino' }, { label: 'Animateur électronique', tagId: 'sciences' }],
    hype: 1.6,
  },
  {
    title: 'Game jam de quartier',
    photos: [{ id: 'd2fa98db-33bd-4100-a71d-8c4d44469c49', alt: 'Jeu vidéo en cours de test sur une tablette' }],
    tagline: 'Faire un jeu vidéo en 48 heures, en équipe',
    description: "Un week-end, un thème annoncé le vendredi soir, des équipes mêlant codeurs, dessinateurs et musiciens. Les jeux seront jouables sur une borne installée à la médiathèque.",
    tags: ['jeu-video', 'code', 'evenement'],
    needs: [{ label: 'Lieu ouvert la nuit' }, { label: 'Ordinateurs portables' }],
    ageDays: 9, hype: 1.9, buzz: true,
  },
  {
    title: 'Ateliers numériques pour seniors',
    photos: [{ id: 'd3ba3d71-d8ff-4f8e-8398-e6c74b609deb', alt: 'Personne travaillant sur un ordinateur dans une salle informatique' }],
    tagline: 'Apprendre à appeler ses petits-enfants en visio',
    description: "Une heure par semaine, en petit groupe, pour apprivoiser le smartphone : messages, photos, démarches en ligne. Patience et bonne humeur exigées, compétences techniques minimales.",
    tags: ['code', 'solidarite', 'entraide-scolaire'],
    needs: [{ label: 'Bénévoles patients' }, { label: 'Tablettes de prêt' }],
    hype: 1.3,
  },
  {
    title: 'Carte interactive des fontaines',
    tagline: "Recenser toutes les fontaines d'eau potable de la ville",
    description: "On parcourt la ville, on note chaque fontaine, son état et ses horaires, et on publie le tout sur une carte libre. Utile l'été, pour les coureurs comme pour les sans-abri.",
    tags: ['code', 'environnement', 'quartier'],
    needs: [{ label: 'Cartographe OpenStreetMap', tagId: 'code' }],
    state: 'done', ageDays: 80, hype: 0.9,
  },
  {
    title: "Club d'astronomie amateur",
    photos: [{ id: 'c93487e0-4dda-4fdb-b1ef-5c3f13269533', alt: 'Astronome amateur réglant un télescope' }, { id: 'd960f041-c970-4559-bab5-011bf316e866', alt: 'Traînées d\'étoiles au-dessus d\'une maison de campagne' }],
    tagline: 'Observer le ciel depuis le toit du collège',
    description: "Un télescope prêté par l'observatoire, un toit accessible et des nuits claires. On organise des soirées d'observation ouvertes à tous, avec une petite initiation avant chaque séance.",
    tags: ['sciences', 'evenement'],
    needs: [{ label: 'Télescope supplémentaire' }],
    hype: 1.1,
  },
  {
    title: 'Appli de covoiturage pour le club de foot',
    tagline: 'Fini les messages perdus pour organiser les déplacements',
    description: "Une petite application web pour que les parents proposent et réservent des places pour les matchs à l'extérieur. Prototype en cours, on cherche des testeurs et un coup de main côté serveur.",
    tags: ['code', 'sport'],
    needs: [{ label: 'Développeur back', tagId: 'code' }],
    state: 'draft',
  },
  {
    title: 'Soutien en maths au collège',
    tagline: 'Deux soirs par semaine, gratuit, sans inscription',
    description: "Des étudiants et des retraités aident les collégiens à faire leurs devoirs de maths et de sciences. On manque surtout de bénévoles le jeudi.",
    tags: ['entraide-scolaire', 'sciences'],
    needs: [{ label: 'Bénévoles le jeudi' }],
    hype: 1.2,
  },

  // --- Jardin, environnement, animaux ---
  {
    title: 'Grainothèque de la médiathèque',
    photos: [{ id: '01630ee8-6576-495b-b8c6-0358d4df721e', alt: 'Jeunes plants en godets' }, { id: '30e24b78-0390-4323-9c2b-e56d2a4bd2a8', alt: 'Mains repiquant un plant avec sa motte' }],
    tagline: 'Échanger ses graines comme on emprunte un livre',
    description: "Une armoire à tiroirs dans le hall de la médiathèque : on dépose des graines récoltées chez soi, on en prend d'autres. Avec des ateliers pour apprendre à récolter et conserver ses semences.",
    tags: ['jardinage', 'environnement'],
    needs: [{ label: 'Meuble à tiroirs' }, { label: 'Animateur d’atelier', tagId: 'jardinage' }],
    hype: 1.0,
  },
  {
    title: 'Compost collectif de la résidence',
    photos: [{ id: 'eadbd488-a308-418c-8c4f-1d23965f441e', alt: 'Bacs à compost en bois' }, { id: '9acd1783-c7a3-49c0-a69d-836862c987b0', alt: 'Compost en cours dans un bac en palettes' }],
    tagline: 'Trois bacs, cinquante foyers, zéro odeur',
    description: "On installe un compost partagé au pied des immeubles. Il faut des volontaires pour le retourner chaque semaine et expliquer aux voisins ce qui peut y aller.",
    tags: ['environnement', 'jardinage', 'quartier'],
    needs: [{ label: 'Référents compost' }],
    hype: 1.1,
  },
  {
    title: 'Nettoyage des berges du canal',
    photos: [{ id: '90e85233-4468-4a69-80bf-c33520057967', alt: 'Bénévoles avec des sacs de déchets ramassés' }, { id: '7fbefc98-72a8-4d54-ae10-e023b15dacdd', alt: 'Bénévole ramassant des déchets au bord de l\'eau' }, { id: '9e15dcc9-36c5-408f-a669-2f52ae23371c', alt: 'Chaîne de bénévoles sur une berge' }],
    tagline: 'Un dimanche matin, des gants, des sacs et du café',
    description: "Chaque mois, on ramasse les déchets le long du canal sur deux kilomètres. La dernière fois : 140 kilos, dont un vélo et deux caddies. Gants et sacs fournis.",
    tags: ['environnement', 'quartier', 'sport'],
    needs: [{ label: 'Remorque pour les déchets' }],
    hype: 1.7, buzz: true,
  },
  {
    title: 'Ruches sur le toit de la mairie',
    photos: [{ id: 'f7a679f0-11f8-4254-8153-0bf1ff2f42cd', alt: 'Apicultrice présentant un cadre de ruche couvert d\'abeilles' }, { id: '4bb56e57-f6a8-4542-ba51-3f85dd3b3044', alt: 'Ruches colorées dans une prairie' }],
    tagline: 'Installer deux ruches et partager le miel',
    description: "La mairie a donné son accord pour deux ruches sur le toit-terrasse. On cherche un apiculteur pour encadrer, et des curieux pour apprendre. Le miel sera vendu au profit de l'école.",
    tags: ['environnement', 'animaux'],
    needs: [{ label: 'Apiculteur expérimenté', tagId: 'animaux' }, { label: 'Combinaisons' }],
    participation: 'on_request', hype: 1.4,
  },
  {
    title: 'Refuge pour chats errants',
    photos: [{ id: 'a3e49bdf-9358-47f8-bc16-0db829de60f9', alt: 'Chat roux caressé dans la rue' }, { id: 'abc69636-3d4c-4189-850a-1c1f8d9275ba', alt: 'Chat roux sur un muret' }, { id: '286e6a2c-6761-4086-9e5e-009c8d7a74a9', alt: 'Chats des rues sur des pavés' }],
    tagline: 'Nourrir, soigner et faire adopter les chats du quartier',
    description: "Une trentaine de chats vivent dans les jardins ouvriers. On organise les campagnes de stérilisation avec la vétérinaire, les tours de nourrissage et les adoptions.",
    tags: ['animaux', 'solidarite'],
    needs: [{ label: "Familles d'accueil", tagId: 'animaux' }, { label: 'Croquettes' }],
    hype: 1.5,
  },
  {
    title: 'Vergers en ville',
    photos: [{ id: '1cc11af3-1552-43b5-bfb2-ec3ace1c9d27', alt: 'Arbres fruitiers aux feuilles dorées' }],
    tagline: 'Planter des arbres fruitiers dans les espaces verts',
    description: "Pommiers, poiriers, cerisiers : on plante une vingtaine d'arbres dans les squares, en libre cueillette. On a besoin de bras pour la plantation de novembre et de parrains pour l'arrosage.",
    tags: ['jardinage', 'environnement', 'quartier'],
    needs: [{ label: 'Bêches et brouettes' }, { label: "Parrains d'arbres" }],
    ageDays: 4, hype: 1.3, buzz: true,
  },
  {
    title: 'Inventaire des oiseaux du parc',
    photos: [{ id: '6b68f0d1-7a0a-4842-85bb-646209743c4b', alt: 'Une garde forestière et une enfant observant des oiseaux aux jumelles' }, { id: 'f4f67389-1c69-4281-a819-b0aa70eca3c6', alt: 'Enfant regardant dans des jumelles' }],
    tagline: 'Compter les oiseaux pour mieux les protéger',
    description: "Un protocole simple, une sortie par mois à l'aube, des jumelles prêtées. Les données sont envoyées au muséum pour le suivi national.",
    tags: ['animaux', 'sciences', 'environnement'],
    needs: [{ label: 'Jumelles' }],
    hype: 0.8,
  },
  {
    title: 'Hôtel à insectes géant',
    photos: [{ id: 'd1e4ba64-506c-4a28-bc9b-f46a4e8d4497', alt: 'Grand hôtel à insectes en bois' }, { id: '718c5360-1d71-4ded-ae30-a8bfb81358df', alt: 'Abeille sauvage devant des tiges de bambou' }],
    tagline: "Construire un hôtel à insectes avec l'école primaire",
    description: "Palettes, bambous, briques, pommes de pin : on construit avec les enfants un grand hôtel à insectes pour le jardin de l'école.",
    tags: ['bricolage', 'environnement', 'animaux'],
    needs: [{ label: 'Palettes en bois' }],
    state: 'done', ageDays: 75, hype: 1.0,
  },

  // --- Solidarité, cuisine, langues ---
  {
    title: 'Frigo solidaire',
    photos: [{ id: '709407e9-2757-4fa8-8f2d-329e3525ff6f', alt: 'Carton de denrées données : conserves, boissons et fruits secs' }, { id: 'c5832309-6324-44fa-894d-89e8be1c0bdc', alt: 'Bénévoles triant des légumes à donner' }],
    tagline: 'Un frigo en libre-service devant la boulangerie',
    description: "Les commerçants et les habitants y déposent ce qu'ils ne mangeront pas, chacun se sert. Il faut des bénévoles pour le nettoyer et vérifier les dates chaque jour.",
    tags: ['solidarite', 'cuisine', 'environnement'],
    needs: [{ label: 'Bénévoles pour le nettoyage' }, { label: 'Électricien', tagId: 'bricolage' }],
    hype: 2.0, buzz: true,
  },
  {
    title: 'Cours de français pour nouveaux arrivants',
    tagline: 'Apprendre le français autour d’un thé',
    description: "Trois groupes de niveau, deux fois par semaine. On apprend avec des situations de tous les jours : le médecin, la mairie, le marché. On cherche des bénévoles, même sans expérience d'enseignement.",
    tags: ['langues', 'solidarite', 'entraide-scolaire'],
    needs: [{ label: 'Bénévoles enseignants', tagId: 'langues' }],
    participation: 'on_request', hype: 1.6,
  },
  {
    title: 'Cuisine du monde au centre social',
    photos: [{ id: 'a641918f-e0d9-4b5e-a853-8afa1f5c9f7a', alt: 'Cuisiniers bénévoles devant des bols prêts à servir' }],
    tagline: 'Chaque mois, une famille fait découvrir sa cuisine',
    description: "Une famille du quartier anime l'atelier et partage les recettes de son pays. On cuisine à quinze, on mange à quarante. Prochaine date : cuisine érythréenne.",
    tags: ['cuisine', 'langues', 'quartier'],
    needs: [{ label: 'Grandes marmites' }],
    hype: 1.4,
  },
  {
    title: 'Maraudes du dimanche soir',
    tagline: 'Du café, des couvertures et un peu de conversation',
    description: "Deux équipes de quatre partent chaque dimanche soir à la rencontre des personnes à la rue. On distribue des boissons chaudes et des kits d'hygiène, et surtout on prend le temps de parler.",
    tags: ['solidarite'],
    needs: [{ label: 'Thermos' }, { label: 'Kits d’hygiène' }],
    participation: 'on_request', hype: 1.3,
  },
  {
    title: 'Banque de vêtements pour enfants',
    tagline: 'Des vêtements trop petits pour les uns, parfaits pour les autres',
    description: "On collecte, on trie par taille et par saison, on redistribue gratuitement chaque premier samedi du mois. Le local est prêté par la paroisse.",
    tags: ['solidarite', 'environnement'],
    needs: [{ label: 'Portants à vêtements' }, { label: 'Trieurs bénévoles' }],
    hype: 1.0,
  },
  {
    title: 'Repas partagé de fin d’année',
    photos: [{ id: '9c849884-c7af-4132-b5bb-fd2bb464cc95', alt: 'Table garnie de plats à partager' }, { id: '2d58da03-8880-4937-acc8-3ba955a22a84', alt: 'Photo de groupe après un repas partagé' }],
    tagline: 'Une grande tablée pour que personne ne soit seul le 24',
    description: "Cent couverts dans le gymnase, un repas cuisiné ensemble, de la musique et des cadeaux pour les enfants. On cherche des cuisiniers, des serveurs, des musiciens et du matériel.",
    tags: ['cuisine', 'solidarite', 'evenement'],
    needs: [{ label: 'Cuisiniers', tagId: 'cuisine' }, { label: 'Tables et chaises' }, { label: 'Musiciens', tagId: 'musique' }],
    ageDays: 3, hype: 1.8, buzz: true,
  },
  {
    title: 'Café des langues',
    tagline: 'Parler anglais, arabe ou espagnol autour d’un café',
    description: "Chaque table a sa langue, on change toutes les vingt minutes. Ouvert à tous les niveaux, des débutants complets aux natifs qui veulent aider.",
    tags: ['langues', 'voyage'],
    needs: [{ label: 'Animateurs de table' }],
    hype: 0.9,
  },
  {
    title: 'Aide aux devoirs en ligne',
    tagline: 'Un coup de main par visio pour les lycéens',
    description: "Des étudiants bénévoles répondent aux questions des lycéens le soir, en visio. Il faut des volontaires en maths, physique, anglais et philo.",
    tags: ['entraide-scolaire', 'code'],
    needs: [{ label: 'Étudiants bénévoles', tagId: 'entraide-scolaire' }],
    state: 'archived', ageDays: 112, hype: 0.7,
  },

  // --- Bricolage, réparation ---
  {
    title: 'Atelier vélo participatif',
    photos: [{ id: '5f33ad14-6067-4e72-8bf6-ecaa6514ec82', alt: 'Personne réglant la roue d\'un vélo à l\'atelier' }],
    tagline: 'Apprendre à réparer son vélo soi-même',
    description: "Des outils, des pièces de récup et des bénévoles pour montrer comment changer une chambre à air ou régler ses freins. Ouvert le mercredi soir et le samedi matin.",
    tags: ['reparation', 'bricolage', 'sport'],
    needs: [{ label: 'Pied d’atelier' }, { label: 'Mécaniciens bénévoles', tagId: 'reparation' }],
    hype: 1.6,
  },
  {
    title: 'Boîte à livres en bois',
    photos: [{ id: '12770030-0f9a-481b-8b7f-3504c6ea119f', alt: 'Boîte à livres rouge plantée dans l\'herbe' }, { id: 'cbc68b94-c8df-4fa9-b2f5-fb182b422718', alt: 'Un père et sa fille choisissant un livre dans une boîte à livres' }],
    tagline: 'Construire trois boîtes à livres pour le quartier',
    description: "Plans libres, bois de récupération, toit en zinc. On construit trois boîtes à livres en atelier et on les installe à l'arrêt de bus, au parc et devant l'école.",
    tags: ['bricolage', 'ecriture', 'quartier'],
    needs: [{ label: 'Planches de bois' }, { label: 'Scie sauteuse' }],
    state: 'done', ageDays: 90, hype: 1.2,
  },
  {
    title: 'Bibliothèque d’outils',
    tagline: 'Une bibliothèque d’outils pour ne plus acheter une perceuse',
    description: "Perceuse, ponceuse, escabeau, nettoyeur haute pression : chacun dépose ce qu'il n'utilise qu'une fois par an, et tout le monde emprunte. Inventaire en ligne et permanences le samedi.",
    tags: ['bricolage', 'environnement', 'solidarite'],
    needs: [{ label: 'Local de stockage' }, { label: 'Outils à donner' }],
    hype: 1.3,
  },
  {
    title: 'Rénovation du local des jeunes',
    tagline: 'Repeindre et réaménager le local du centre social',
    description: "Le local des 12-17 ans est triste et abîmé. On le rénove avec eux : peinture, étagères, canapés en palettes. Chantier sur trois samedis.",
    tags: ['bricolage', 'quartier', 'dessin'],
    needs: [{ label: 'Peinture' }, { label: 'Encadrants chantier', tagId: 'bricolage' }],
    participation: 'on_request', hype: 1.1,
  },
  {
    title: 'Réparation de jouets avant Noël',
    tagline: 'Redonner vie aux jouets pour les offrir',
    description: "On collecte des jouets abîmés, on les répare, on les nettoie et on les offre aux familles du Secours populaire. Électronique, couture, menuiserie : tous les talents sont utiles.",
    tags: ['reparation', 'solidarite'],
    needs: [{ label: 'Fer à souder' }, { label: 'Couturières' }],
    ageDays: 8, hype: 1.5, buzz: true,
  },

  // --- Vivre ensemble : sport, événements, voyages, jeux ---
  {
    title: 'Course solidaire des quais',
    photos: [{ id: '7f6fed8e-3e66-4b99-9d9c-0bf46e243308', alt: 'Coureurs au départ d\'une course en ville' }, { id: '7398900b-94ab-4d2a-aa45-2885da24d658', alt: 'Enfants courant lors d\'une course solidaire' }],
    tagline: '5 km pour financer le séjour des enfants du centre social',
    description: "Une course familiale sur les quais, ouverte aux coureurs comme aux marcheurs. Les inscriptions financent le séjour d'été des enfants. Il faut des signaleurs, un ravitaillement et une sono.",
    tags: ['sport', 'evenement', 'solidarite'],
    needs: [{ label: 'Signaleurs' }, { label: 'Sono' }],
    hype: 1.5,
  },
  {
    title: 'Ludothèque éphémère',
    photos: [{ id: '064a9387-98c8-4fbd-ae86-7731d896dc65', alt: 'Partie de go en cours' }],
    tagline: 'Des jeux de société sur la place tous les dimanches',
    description: "On sort des tables, des centaines de jeux et des animateurs qui expliquent les règles. Pour les familles, les ados et les grands-parents.",
    tags: ['jeux', 'quartier', 'evenement'],
    needs: [{ label: 'Jeux de société' }, { label: 'Tonnelles' }],
    hype: 1.3,
  },
  {
    title: 'Tournoi de foot inter-quartiers',
    photos: [{ id: 'dc8a708e-f791-477b-ad4c-db3d6bb3e6f5', alt: 'Jeunes footballeurs en plein match sur un terrain synthétique' }, { id: '9dc7f629-36c6-435e-b01c-4fb2c1e5aacc', alt: 'Partie de foot entre enfants au coucher du soleil' }],
    tagline: 'Huit équipes, une journée, une coupe en carton',
    description: "Des équipes mixtes de tous âges, des matchs de dix minutes et un grand pique-nique à midi. On cherche des arbitres, des bénévoles pour la buvette et des maillots.",
    tags: ['sport', 'evenement', 'quartier'],
    needs: [{ label: 'Arbitres', tagId: 'sport' }, { label: 'Maillots' }],
    state: 'done', ageDays: 60, hype: 1.4,
  },
  {
    title: 'Voyage à vélo jusqu’à la mer',
    photos: [{ id: 'd17ce1d9-efe9-4849-b101-5ca16ab75096', alt: 'Cyclistes sur une voie verte' }, { id: 'adbf428d-22ca-419a-bc40-39fe1dcca699', alt: 'Vélo posé au bord d\'une rivière' }],
    tagline: '400 km en une semaine, en groupe et sans voiture',
    description: "Un itinéraire par les véloroutes, du camping chez l'habitant et des étapes de 60 km. Ouvert à tous les niveaux, on roule au rythme du plus lent.",
    tags: ['voyage', 'sport', 'environnement'],
    needs: [{ label: 'Remorques vélo' }],
    participation: 'on_request', hype: 1.2,
  },
  {
    title: 'Club de jeu de rôle',
    tagline: 'Des parties pour débutants tous les quinze jours',
    description: "Fantasy, enquête, science-fiction : on propose des parties courtes pour découvrir le jeu de rôle. Les meneurs expérimentés forment les nouveaux.",
    tags: ['jeux', 'ecriture'],
    needs: [{ label: 'Meneurs de jeu' }],
    hype: 1.0,
  },
  {
    title: 'Fête des voisins géante',
    photos: [{ id: '9fc9d671-601a-4087-86fc-5a0689b90df3', alt: 'Enfants à vélo dans une rue fermée à la circulation et fleurie' }, { id: 'dfb5dd5a-f2c5-4182-8105-d325580e3675', alt: 'Promeneurs dans une rue piétonne en fête' }, { id: 'a16accd5-241d-4395-8f9e-b8ab4ecb98f0', alt: 'Enfants maquillés sous un barnum de fête de quartier' }],
    tagline: 'Toute la rue fermée pour un après-midi de fête',
    description: "Tables dans la rue, scène ouverte, jeux pour enfants, barbecue partagé. La rue sera fermée à la circulation de 14 h à minuit.",
    tags: ['evenement', 'quartier', 'cuisine'],
    needs: [{ label: 'Barnums' }, { label: 'Groupes de musique', tagId: 'musique' }],
    state: 'done', ageDays: 100, hype: 1.9,
  },
  {
    title: 'Échange de séjours entre familles',
    tagline: 'Partir en vacances chez une famille d’une autre ville',
    description: "Un réseau de familles qui échangent leur logement pendant les vacances, avec un week-end de rencontre avant le départ. Pour partir sans se ruiner.",
    tags: ['voyage', 'solidarite'],
    needs: [{ label: 'Familles participantes' }],
    hype: 0.8,
  },
  {
    title: 'Théâtre forum au collège',
    tagline: 'Jouer les situations de harcèlement pour mieux les déjouer',
    description: "Une troupe d'élèves joue des scènes du quotidien, le public les arrête et propose d'autres fins. Accompagné par une comédienne et l'infirmière scolaire.",
    tags: ['spectacle', 'entraide-scolaire'],
    needs: [{ label: 'Comédiens encadrants', tagId: 'spectacle' }],
    hype: 1.1,
  },

  // --- Savoirs ---
  {
    title: 'Mémoire de l’usine Lebrun',
    photos: [{ id: 'bbf67953-0b95-4af1-892d-65b952b4073d', alt: 'Atelier d\'une ancienne fabrique de pianos, photo d\'archive' }, { id: 'e2045e21-a16c-437f-b084-0bc5fc6677e4', alt: 'Ouvriers devant une usine, photo d\'archive' }],
    tagline: 'Collecter photos et témoignages des anciens ouvriers',
    description: "L'usine a fermé en 1987, mais beaucoup d'anciens habitent encore le quartier. On numérise leurs photos, on enregistre leurs souvenirs et on prépare une exposition pour les 40 ans de la fermeture.",
    tags: ['histoire', 'photo', 'quartier'],
    needs: [{ label: 'Scanner de diapositives' }, { label: 'Interviewers' }],
    hype: 1.0,
  },
  {
    title: 'Balades historiques commentées',
    photos: [{ id: '9067000b-419c-4b90-abcd-7f5199d834b0', alt: 'Groupe écoutant un guide lors d\'une visite à pied' }],
    tagline: 'Découvrir le quartier en une heure et demie',
    description: "Des habitants passionnés guident des balades gratuites le premier dimanche du mois : l'ancien lavoir, la gare, les maisons ouvrières. On écrit un petit guide pour les nouveaux guides.",
    tags: ['histoire', 'quartier', 'voyage'],
    needs: [{ label: 'Guides bénévoles', tagId: 'histoire' }],
    hype: 1.1,
  },
  {
    title: 'Expériences de science au parc',
    photos: [{ id: '460b9b85-7c57-49ad-902a-78e45aefd73c', alt: 'Animatrice faisant une démonstration à l\'azote liquide' }],
    tagline: 'Des expériences spectaculaires pour les enfants, en plein air',
    description: "Volcans, fusées à eau, électricité statique : un après-midi par mois au parc, pour donner aux enfants le goût des sciences. Animé par des profs et des étudiants.",
    tags: ['sciences', 'entraide-scolaire', 'evenement'],
    needs: [{ label: 'Matériel de chimie simple' }],
    ageDays: 5, hype: 1.2, buzz: true,
  },
  {
    title: 'Projet secret de la troupe',
    tagline: 'Un spectacle surprise pour les 20 ans de la maison de quartier',
    description: "On prépare une surprise : la troupe seulement, pas un mot à l'extérieur.",
    tags: ['spectacle', 'musique'],
    private: true,
  },
  {
    title: 'Herbier du quartier',
    photos: [{ id: '34f0e998-bf9d-4d64-8228-634b61a8a652', alt: 'Prairie de fleurs sauvages' }, { id: '3c3da83c-ef60-4d78-bd53-8bc0ea22d8d7', alt: 'Petites fleurs blanches sauvages' }],
    tagline: 'Recenser et dessiner les plantes sauvages de nos trottoirs',
    description: "Les plantes qui poussent entre les pavés ont des noms et des histoires. On les cueille, on les dessine et on écrit à la craie leur nom sur le trottoir.",
    tags: ['jardinage', 'dessin', 'sciences'],
    needs: [{ label: 'Botaniste amateur', tagId: 'sciences' }],
    hype: 0.9,
  },
];

/** Commentaires de personnes qui soutiennent le projet. */
export const COMMENTS = [
  'Super initiative, je partage autour de moi !',
  'Je passe samedi voir comment ça se passe.',
  "C'est exactement ce qui manquait au quartier.",
  'Est-ce que les enfants peuvent venir aussi ?',
  "J'ai du matériel qui pourrait servir, je vous écris.",
  'Bravo pour tout ce travail, ça fait plaisir à voir.',
  'Il y a une date pour la prochaine séance ?',
  "J'en ai parlé à ma voisine, elle est partante.",
  'Hâte de voir le résultat final !',
  "Je ne suis pas dispo ce mois-ci mais je suis l'aventure de près.",
  'Vous avez besoin de monde le matin ou plutôt le soir ?',
  'Belle énergie, continuez comme ça.',
  'Je peux aider pour la communication si besoin.',
  "Venu une fois, j'y retourne dès que possible.",
  "Quelle bonne idée, je n'y aurais jamais pensé.",
  'On pourrait en faire autant dans la rue d’à côté.',
  "Merci pour l'accueil la dernière fois !",
  'Les photos de la dernière fois sont magnifiques.',
  "Est-ce qu'il faut s'inscrire à l'avance ?",
  'Je viens avec deux amis la prochaine fois.',
];

/** Reponses du porteur, sous un commentaire. */
export const REPLIES = [
  'Merci beaucoup, à très vite !',
  'Oui, tout le monde est bienvenu.',
  'Avec plaisir, écris-moi en message privé.',
  'La date sera annoncée cette semaine, reste branché.',
  'Pas besoin de s’inscrire, viens quand tu veux.',
  'Merci, ça nous touche vraiment.',
  'Bonne idée, on en parle à la prochaine réunion.',
  'Le matin surtout, mais toute aide compte.',
];

/** Annonces publiees par le porteur ; `{title}` est remplace. */
export const ANNOUNCEMENTS = [
  { title: 'Merci pour ce premier mois !', body: "Vous êtes déjà nombreux à soutenir {title}. Merci à toutes et à tous : la suite s'annonce belle." },
  { title: 'Prochaine séance confirmée', body: 'La date est fixée, le lieu aussi. Pensez à prévenir si vous venez, pour que l’on prévoie assez de matériel.' },
  { title: 'On cherche encore du monde', body: "L'équipe grandit mais il manque encore quelques bras. Regardez la liste des besoins, chaque coup de main compte." },
  { title: 'Retour en images', body: "Les photos de la dernière session sont dans la galerie. Merci aux photographes du jour !" },
  { title: 'Petit changement de programme', body: 'Météo oblige, on décale d’une semaine. Même heure, même endroit.' },
  { title: 'Un partenaire nous rejoint', body: "La mairie de quartier soutient {title} : prêt de salle et de matériel pour toute l'année." },
];
