export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'aftersale-flow-secret-key',
  jwtExpiresIn: '24h',
  database: {
    path: process.env.DB_PATH || './data/aftersale.db'
  }
};
