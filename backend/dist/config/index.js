"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET || 'aftersale-flow-secret-key',
    jwtExpiresIn: '24h',
    database: {
        path: process.env.DB_PATH || './data/aftersale.db'
    }
};
//# sourceMappingURL=index.js.map