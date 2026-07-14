export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Modification en fonction de la db
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME ?? 'highfive',
    password: process.env.DB_PASSWORD ?? 'secret',
    database: process.env.DB_DATABASE ?? 'highfive_dev',
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'change-me',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'change-me-too',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '7d',
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  minio: {
    region: process.env.MINIO_REGION ?? 'eu-west-3',
    endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: true,
  },

  canvas: {
    /** URL HTTP interne du service canvas (export du document). */
    url: process.env.CANVAS_URL ?? 'http://localhost:8585',
    /** URL WebSocket transmise au navigateur pour le provider Hocuspocus. */
    websocketUrl: process.env.CANVAS_WS_URL ?? 'ws://localhost:8585',
    /** Doit valoir exactement le JWT_SECRET du service canvas, qui verifie ce token. */
    jwtSecret: process.env.CANVAS_JWT_SECRET ?? 'change-me-canvas',
    tokenExpiration: process.env.CANVAS_TOKEN_EXPIRATION ?? '1h',
    /** Doit valoir exactement l'INTERNAL_SECRET du service canvas. */
    internalSecret: process.env.CANVAS_INTERNAL_SECRET ?? 'dev-internal-secret',
  },

  openai: {
    // Pas de valeur par defaut : sans token, la generation de taches echoue
    // explicitement plutot que d'appeler l'API avec une cle bidon.
    token: process.env.OPENAI_TOKEN,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
});
