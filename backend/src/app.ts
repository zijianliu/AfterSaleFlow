import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { initDatabase } from './db/init';
import authRoutes from './routes/auth';
import orderRoutes from './routes/order';
import afterSaleRoutes from './routes/afterSale';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const frontendDir = path.join(__dirname, '..', '..', 'frontend');
app.use('/frontend', express.static(frontendDir));
app.get('/', (req, res) => {
  res.redirect('/frontend/login.html');
});

app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/after-sale', afterSaleRoutes);

app.get('/api/health', (req: express.Request, res: express.Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

export function startServer(): void {
  initDatabase();
  app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
  });
}

export default app;

if (require.main === module) {
  startServer();
}
