"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const init_1 = require("./db/init");
const auth_1 = __importDefault(require("./routes/auth"));
const order_1 = __importDefault(require("./routes/order"));
const afterSale_1 = __importDefault(require("./routes/afterSale"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
const frontendDir = path_1.default.join(__dirname, '..', '..', 'frontend');
app.use('/frontend', express_1.default.static(frontendDir));
app.get('/', (req, res) => {
    res.redirect('/frontend/login.html');
});
app.use('/api/auth', auth_1.default);
app.use('/api/orders', order_1.default);
app.use('/api/after-sale', afterSale_1.default);
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: '服务器内部错误' });
});
function startServer() {
    (0, init_1.initDatabase)();
    app.listen(config_1.config.port, () => {
        console.log(`Server is running on port ${config_1.config.port}`);
    });
}
exports.default = app;
if (require.main === module) {
    startServer();
}
//# sourceMappingURL=app.js.map