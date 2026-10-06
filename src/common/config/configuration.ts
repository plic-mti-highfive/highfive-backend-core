/**
 * Configuration applicative, lue une seule fois au demarrage.
 *
 * Plus aucune notion de tenant : la plateforme est mono-instance (voir
 * `docs/REFACTO-V2.md`). Le seul `tenantId` qui subsiste est celui exige par
 * le service IA, qui n'a pas ete modifie : on lui envoie une constante.
 */
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  /** Origines autorisees par CORS, separees par des virgules ; `*` en dev. */
  corsOrigins: process.env.CORS_ORIGINS ?? '*',

  /**
   * Comptes d'administration, par adresse, separes par des virgules. Aucune
   * route ne donne ce role : un role plateforme ne doit pas s'obtenir par
   * l'API. La liste fait autorite dans les deux sens (promotion et retrait).
   */
  adminEmails: process.env.ADMIN_EMAILS ?? '',

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'highfive',
    password: process.env.DB_PASSWORD ?? 'secret',
    database: process.env.DB_DATABASE ?? 'highfive_dev',
  },

  session: {
    /**
     * Duree de vie d'un jeton de session (SPEC.md §1.2 : le mock n'expirait
     * jamais, un vrai backend doit expirer).
     */
    ttlDays: parseInt(process.env.SESSION_TTL_DAYS ?? '30', 10),
    /** Sel du hachage des jetons stockes en base (jamais le jeton en clair). */
    tokenPepper: process.env.SESSION_TOKEN_PEPPER ?? 'change-me-pepper',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  storage: {
    region: process.env.MINIO_REGION ?? 'eu-west-3',
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT,
    bucket: process.env.MINIO_BUCKET ?? 'highfive-core-bucket',
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    forcePathStyle: true,
  },

  canvas: {
    /** URL HTTP interne du service canvas (export du document). */
    url: process.env.CANVAS_URL ?? 'http://localhost:8585',
    /** URL WebSocket transmise au navigateur pour le provider Hocuspocus. */
    websocketUrl: process.env.CANVAS_WS_URL ?? 'ws://localhost:8585',
    /** Doit valoir exactement le JWT_SECRET du service canvas. */
    jwtSecret: process.env.CANVAS_JWT_SECRET ?? 'change-me-canvas',
    tokenExpiration: process.env.CANVAS_TOKEN_EXPIRATION ?? '1h',
    /** Doit valoir exactement l'INTERNAL_SECRET du service canvas. */
    internalSecret: process.env.CANVAS_INTERNAL_SECRET ?? 'dev-internal-secret',
  },

  ai: {
    /** Base HTTP du service IA (FastAPI). Vide = recommandations desactivees. */
    url: process.env.AI_URL ?? 'http://localhost:8000',
    /**
     * Le service IA est reste multi-tenant : il exige un `tenant_id` sur
     * chaque job et chaque embedding. On lui en fournit un fixe plutot que de
     * le modifier (consigne : toucher le moins possible au backend IA).
     */
    tenantId:
      process.env.AI_TENANT_ID ?? '00000000-0000-4000-8000-000000000001',
    /**
     * Doit valoir exactement le JWT_SECRET du service IA : ses routes
     * `/api/v1/matchmaking/*` sont derriere un `HTTPBearer` et lisent le
     * `tenantId` dans le jeton, pas dans la query.
     */
    jwtSecret: process.env.AI_JWT_SECRET ?? 'change-me-ai',
    /** R-IA-28 : une seule tentative, 12 s au maximum. */
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? '12000', 10),
  },

  openai: {
    // Pas de valeur par defaut : sans token, la generation de taches echoue
    // explicitement plutot que d'appeler l'API avec une cle bidon.
    token: process.env.OPENAI_TOKEN,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },

  files: {
    /** R-F1 : 20 Mo par fichier. */
    maxFileBytes: 20 * 1024 * 1024,
    /** R-F1 : 200 Mo par projet, toutes versions confondues. */
    maxProjectBytes: 200 * 1024 * 1024,
    /** R-F2 : familles autorisees (images, PDF, audio, archives). */
    allowedMimePrefixes: ['image/', 'audio/'],
    allowedMimeTypes: [
      'application/pdf',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
    ],
  },

  /** R-MSG8 : depots joints aux messages. */
  messages: {
    maxImageBytes: 10 * 1024 * 1024,
    maxVideoBytes: 50 * 1024 * 1024,
    maxOtherBytes: 20 * 1024 * 1024,
    /** Les familles des fichiers de projet (R-F2), plus la video. */
    allowedMimePrefixes: ['image/', 'audio/', 'video/'],
    /**
     * Un SVG peut porter du script : ouvert dans un onglet, il s'executerait
     * sur l'origine du stockage. Rien ne justifie ce risque dans un message.
     */
    deniedMimeTypes: ['image/svg+xml'],
    /** Duree de vie de `attachmentPreview.url`, relue a chaque lecture. */
    signedUrlTtlSeconds: 60 * 60,
    /** Un depot jamais joint a un message est purge passe ce delai. */
    orphanUploadTtlHours: 24,
  },
});
