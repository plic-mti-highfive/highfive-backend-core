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
 */
export const PROJECTS = [
  // --- Les cinq projets du front ---
  {
    owner: 'alex.rivera',
    title: 'Fresque murale collaborative',
    tagline: 'Repeindre le mur du gymnase avec le quartier',
    description: "Un mur gris de trente metres, un quartier qui passe devant tous les jours. On veut le couvrir de couleurs, ensemble, un samedi par mois.",
    tags: ['dessin', 'quartier'],
    needs: [{ label: 'Peintres amateurs' }, { label: 'Pret d un echafaudage' }],
    ageDays: 95, hype: 2.2,
  },
  {
    owner: 'sophie.b',
    title: 'Jardin partage des Lilas',
    tagline: 'Transformer la friche en potager de quartier',
    description: "Deux cents metres carres de friche derriere l ecole. On defriche, on plante, on partage la recolte.",
    tags: ['jardinage', 'environnement'],
    needs: [{ label: 'Outils de jardinage' }],
    ageDays: 88, hype: 1.8, buzz: true,
  },
  {
    owner: 'marc.leroy',
    title: 'Repair cafe mensuel',
    tagline: 'Reparer ensemble plutot que jeter',
    description: "Un samedi par mois, on ouvre l atelier : grille-pain, velos, lampes. On repare, et surtout on montre comment faire.",
    tags: ['reparation', 'solidarite'],
    needs: [{ label: 'Electronicien bienveillant' }],
    ageDays: 102, hype: 1.6,
  },
  {
    owner: 'lea.m',
    title: 'Distribution de soupe',
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
    tagline: 'Des voix de 8 à 88 ans, un concert à la fête de la musique',
    description: "On répète le mardi soir à la maison de quartier. Pas besoin de savoir lire une partition : il suffit d'aimer chanter. Objectif : un vrai concert en juin, avec les enfants de l'école et les résidents de l'EHPAD voisin.",
    tags: ['musique', 'spectacle', 'quartier'],
    needs: [{ label: 'Pianiste accompagnateur', tagId: 'musique' }, { label: 'Salle pour les répétitions' }],
    hype: 1.5,
  },
  {
    title: 'Court métrage tourné au téléphone',
    tagline: 'Un film de quinze minutes, entièrement filmé au smartphone',
    description: "Un scénario écrit à plusieurs, un tournage sur trois week-ends dans le quartier, une projection publique à la médiathèque. On cherche des acteurs, des monteurs et des gens qui savent tenir une perche son.",
    tags: ['video', 'ecriture', 'spectacle'],
    needs: [{ label: 'Monteur vidéo', tagId: 'video' }, { label: 'Acteurs amateurs' }, { label: 'Preneur de son' }],
    participation: 'on_request', hype: 1.3, buzz: true,
  },
  {
    title: 'Fanzine du quartier',
    tagline: "Un journal photocopié, écrit et dessiné par les habitants",
    description: "Seize pages tous les deux mois : portraits de voisins, recettes, BD, petites annonces. Tiré à 300 exemplaires et déposé chez les commerçants. Chacun peut proposer un article, un dessin ou une photo.",
    tags: ['ecriture', 'dessin', 'quartier'],
    needs: [{ label: 'Maquettiste' }, { label: 'Illustrateurs', tagId: 'dessin' }],
    hype: 1.1,
  },
  {
    title: 'Portraits de commerçants',
    tagline: 'Une expo photo des visages qui font vivre la rue',
    description: "Trente portraits en noir et blanc des commerçants du quartier, avec quelques lignes sur leur histoire. L'expo sera accrochée dans les vitrines elles-mêmes pendant un mois.",
    tags: ['photo', 'quartier', 'histoire'],
    needs: [{ label: 'Tirages grand format' }, { label: 'Rédacteur pour les textes', tagId: 'ecriture' }],
    state: 'done', ageDays: 110, hype: 1.7,
  },
  {
    title: 'Atelier BD pour ados',
    tagline: 'Créer une bande dessinée de A à Z en dix séances',
    description: "Scénario, découpage, crayonné, encrage : on accompagne un groupe de collégiens jusqu'à l'impression d'un album collectif. Les séances ont lieu le mercredi après-midi à la médiathèque.",
    tags: ['dessin', 'ecriture', 'entraide-scolaire'],
    needs: [{ label: 'Dessinateur bénévole', tagId: 'dessin' }],
    hype: 1.0,
  },
  {
    title: 'Podcast des anciens du quartier',
    tagline: "Enregistrer les souvenirs avant qu'ils ne s'effacent",
    description: "Des entretiens d'une heure avec les habitants les plus anciens : l'usine, le marché, les bals. Montés en épisodes de vingt minutes et diffusés sur la radio associative.",
    tags: ['histoire', 'ecriture', 'musique'],
    needs: [{ label: 'Micro et enregistreur' }, { label: 'Monteur audio' }],
    hype: 0.9,
  },
  {
    title: 'Scène ouverte du vendredi',
    tagline: 'Un micro, une scène, dix minutes chacun',
    description: "Slam, chanson, stand-up, poésie : tous les premiers vendredis du mois dans le bar associatif. On cherche des gens pour la technique, l'accueil et bien sûr des artistes qui osent.",
    tags: ['spectacle', 'musique', 'evenement'],
    needs: [{ label: 'Technicien son', tagId: 'musique' }],
    hype: 1.4, buzz: true,
  },
  {
    title: 'Mosaïque de la place du marché',
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
    tagline: 'Construire des robots avec des collégiens',
    description: "Arduino, capteurs, moteurs récupérés sur des imprimantes : on apprend en construisant. L'objectif de l'année est de participer à la coupe de robotique régionale.",
    tags: ['sciences', 'code', 'entraide-scolaire'],
    needs: [{ label: 'Kits Arduino' }, { label: 'Animateur électronique', tagId: 'sciences' }],
    hype: 1.6,
  },
  {
    title: 'Game jam de quartier',
    tagline: 'Faire un jeu vidéo en 48 heures, en équipe',
    description: "Un week-end, un thème annoncé le vendredi soir, des équipes mêlant codeurs, dessinateurs et musiciens. Les jeux seront jouables sur une borne installée à la médiathèque.",
    tags: ['jeu-video', 'code', 'evenement'],
    needs: [{ label: 'Lieu ouvert la nuit' }, { label: 'Ordinateurs portables' }],
    ageDays: 9, hype: 1.9, buzz: true,
  },
  {
    title: 'Ateliers numériques pour seniors',
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
    tagline: 'Échanger ses graines comme on emprunte un livre',
    description: "Une armoire à tiroirs dans le hall de la médiathèque : on dépose des graines récoltées chez soi, on en prend d'autres. Avec des ateliers pour apprendre à récolter et conserver ses semences.",
    tags: ['jardinage', 'environnement'],
    needs: [{ label: 'Meuble à tiroirs' }, { label: 'Animateur d’atelier', tagId: 'jardinage' }],
    hype: 1.0,
  },
  {
    title: 'Compost collectif de la résidence',
    tagline: 'Trois bacs, cinquante foyers, zéro odeur',
    description: "On installe un compost partagé au pied des immeubles. Il faut des volontaires pour le retourner chaque semaine et expliquer aux voisins ce qui peut y aller.",
    tags: ['environnement', 'jardinage', 'quartier'],
    needs: [{ label: 'Référents compost' }],
    hype: 1.1,
  },
  {
    title: 'Nettoyage des berges du canal',
    tagline: 'Un dimanche matin, des gants, des sacs et du café',
    description: "Chaque mois, on ramasse les déchets le long du canal sur deux kilomètres. La dernière fois : 140 kilos, dont un vélo et deux caddies. Gants et sacs fournis.",
    tags: ['environnement', 'quartier', 'sport'],
    needs: [{ label: 'Remorque pour les déchets' }],
    hype: 1.7, buzz: true,
  },
  {
    title: 'Ruches sur le toit de la mairie',
    tagline: 'Installer deux ruches et partager le miel',
    description: "La mairie a donné son accord pour deux ruches sur le toit-terrasse. On cherche un apiculteur pour encadrer, et des curieux pour apprendre. Le miel sera vendu au profit de l'école.",
    tags: ['environnement', 'animaux'],
    needs: [{ label: 'Apiculteur expérimenté', tagId: 'animaux' }, { label: 'Combinaisons' }],
    participation: 'on_request', hype: 1.4,
  },
  {
    title: 'Refuge pour chats errants',
    tagline: 'Nourrir, soigner et faire adopter les chats du quartier',
    description: "Une trentaine de chats vivent dans les jardins ouvriers. On organise les campagnes de stérilisation avec la vétérinaire, les tours de nourrissage et les adoptions.",
    tags: ['animaux', 'solidarite'],
    needs: [{ label: "Familles d'accueil", tagId: 'animaux' }, { label: 'Croquettes' }],
    hype: 1.5,
  },
  {
    title: 'Vergers en ville',
    tagline: 'Planter des arbres fruitiers dans les espaces verts',
    description: "Pommiers, poiriers, cerisiers : on plante une vingtaine d'arbres dans les squares, en libre cueillette. On a besoin de bras pour la plantation de novembre et de parrains pour l'arrosage.",
    tags: ['jardinage', 'environnement', 'quartier'],
    needs: [{ label: 'Bêches et brouettes' }, { label: "Parrains d'arbres" }],
    ageDays: 4, hype: 1.3, buzz: true,
  },
  {
    title: 'Inventaire des oiseaux du parc',
    tagline: 'Compter les oiseaux pour mieux les protéger',
    description: "Un protocole simple, une sortie par mois à l'aube, des jumelles prêtées. Les données sont envoyées au muséum pour le suivi national.",
    tags: ['animaux', 'sciences', 'environnement'],
    needs: [{ label: 'Jumelles' }],
    hype: 0.8,
  },
  {
    title: 'Hôtel à insectes géant',
    tagline: "Construire un hôtel à insectes avec l'école primaire",
    description: "Palettes, bambous, briques, pommes de pin : on construit avec les enfants un grand hôtel à insectes pour le jardin de l'école.",
    tags: ['bricolage', 'environnement', 'animaux'],
    needs: [{ label: 'Palettes en bois' }],
    state: 'done', ageDays: 75, hype: 1.0,
  },

  // --- Solidarité, cuisine, langues ---
  {
    title: 'Frigo solidaire',
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
    tagline: 'Apprendre à réparer son vélo soi-même',
    description: "Des outils, des pièces de récup et des bénévoles pour montrer comment changer une chambre à air ou régler ses freins. Ouvert le mercredi soir et le samedi matin.",
    tags: ['reparation', 'bricolage', 'sport'],
    needs: [{ label: 'Pied d’atelier' }, { label: 'Mécaniciens bénévoles', tagId: 'reparation' }],
    hype: 1.6,
  },
  {
    title: 'Boîte à livres en bois',
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
    tagline: '5 km pour financer le séjour des enfants du centre social',
    description: "Une course familiale sur les quais, ouverte aux coureurs comme aux marcheurs. Les inscriptions financent le séjour d'été des enfants. Il faut des signaleurs, un ravitaillement et une sono.",
    tags: ['sport', 'evenement', 'solidarite'],
    needs: [{ label: 'Signaleurs' }, { label: 'Sono' }],
    hype: 1.5,
  },
  {
    title: 'Ludothèque éphémère',
    tagline: 'Des jeux de société sur la place tous les dimanches',
    description: "On sort des tables, des centaines de jeux et des animateurs qui expliquent les règles. Pour les familles, les ados et les grands-parents.",
    tags: ['jeux', 'quartier', 'evenement'],
    needs: [{ label: 'Jeux de société' }, { label: 'Tonnelles' }],
    hype: 1.3,
  },
  {
    title: 'Tournoi de foot inter-quartiers',
    tagline: 'Huit équipes, une journée, une coupe en carton',
    description: "Des équipes mixtes de tous âges, des matchs de dix minutes et un grand pique-nique à midi. On cherche des arbitres, des bénévoles pour la buvette et des maillots.",
    tags: ['sport', 'evenement', 'quartier'],
    needs: [{ label: 'Arbitres', tagId: 'sport' }, { label: 'Maillots' }],
    state: 'done', ageDays: 60, hype: 1.4,
  },
  {
    title: 'Voyage à vélo jusqu’à la mer',
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
    tagline: 'Collecter photos et témoignages des anciens ouvriers',
    description: "L'usine a fermé en 1987, mais beaucoup d'anciens habitent encore le quartier. On numérise leurs photos, on enregistre leurs souvenirs et on prépare une exposition pour les 40 ans de la fermeture.",
    tags: ['histoire', 'photo', 'quartier'],
    needs: [{ label: 'Scanner de diapositives' }, { label: 'Interviewers' }],
    hype: 1.0,
  },
  {
    title: 'Balades historiques commentées',
    tagline: 'Découvrir le quartier en une heure et demie',
    description: "Des habitants passionnés guident des balades gratuites le premier dimanche du mois : l'ancien lavoir, la gare, les maisons ouvrières. On écrit un petit guide pour les nouveaux guides.",
    tags: ['histoire', 'quartier', 'voyage'],
    needs: [{ label: 'Guides bénévoles', tagId: 'histoire' }],
    hype: 1.1,
  },
  {
    title: 'Expériences de science au parc',
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
