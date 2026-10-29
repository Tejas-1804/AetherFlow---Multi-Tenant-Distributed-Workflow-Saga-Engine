import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { MultiTenantMongoManager } from './src/server/db/mongo-manager.js';
import { SagaCoordinator } from './src/server/engine/saga-coordinator.js';
import { createApiRouter } from './src/server/routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Initialize WebSocket Server for Real-Time Execution Tracing
  const wss = new WebSocketServer({ server, path: '/ws' });
  const activeClients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    activeClients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected to AetherFlow Engine.' }));

    ws.on('close', () => {
      activeClients.delete(ws);
    });

    ws.on('error', () => {
      activeClients.delete(ws);
    });
  });

  const broadcastEvent = (event: any) => {
    const message = JSON.stringify(event);
    for (const client of activeClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  // Initialize Distributed Saga Coordinator
  const sagaCoordinator = new SagaCoordinator(broadcastEvent);

  // Connect MongoDB Change Streams to broadcast to clients
  const dbManager = MultiTenantMongoManager.getInstance();
  dbManager.globalChangeStream.on('change', (changeEvent) => {
    broadcastEvent({
      type: 'change_stream:event',
      payload: changeEvent,
      timestamp: new Date().toISOString(),
    });
  });

  // Mount API Endpoints
  const apiRouter = createApiRouter(sagaCoordinator);
  app.use('/api', apiRouter);

  // Mount Vite Middleware in Dev or Serve Static in Prod
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[Server] Vite middleware mounted in development mode');
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log('[Server] Serving production static bundle from /dist');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[AetherFlow] Distributed Workflow Engine running on http://0.0.0.0:${PORT}`);
    console.log(`[AetherFlow] WebSocket Trace endpoint available at ws://0.0.0.0:${PORT}/ws`);
  });
}

bootstrap().catch((err) => {
  console.error('[AetherFlow] Startup failure:', err);
  process.exit(1);
});
