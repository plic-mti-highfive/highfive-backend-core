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

  rabbitmq: {
    host: process.env.RABBITMQ_HOST ?? 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10),
    username: process.env.RABBITMQ_USERNAME ?? 'guest',
    password: process.env.RABBITMQ_PASSWORD ?? 'guest',
    vhost: process.env.RABBITMQ_VHOST ?? '/',
  },
});
