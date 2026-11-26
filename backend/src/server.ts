import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import os from 'os';

import { connectPostgres, isPostgresConnected } from './config/postgres.js';
import { runMigrations } from './database/migrate.js';
import { seedPostgres } from './config/seedPostgres.js';
import { authRouter } from './routes/auth.js';
import { issuesRouter } from './routes/issues.js';
import { databaseRouter } from './routes/database.js';
import { aiRouter } from './routes/ai.js';
import { miscRouter } from './routes/misc.js';
import { organizationRouter } from './routes/organizations.js';
import { transactionSettingsRouter } from './routes/transactionSettings.js';
import { teamsRouter } from './routes/teams.js';
import { collaborationRouter } from './routes/collaboration.js';
import { eventsRouter } from './routes/events.js';
import { workflowsRouter } from './routes/workflows.js';
import { investigationsRouter } from './routes/investigations.js';
import { validationBoxesRouter } from './routes/validationBoxes.js';
import resolutionsRouter from './routes/resolutions.js';
import { workspaceSettingsProposalsRouter } from './routes/workspaceSettingsProposals.js';
import { approvalsRouter } from './routes/approvals.js';
import { metricsRouter } from './routes/metrics.js';
import { escalationsRouter } from './routes/escalations.js';
import { sandboxRouter } from './routes/sandbox.js';
import { messagesRouter } from './routes/messages.js';
import { workflowBundlesRouter } from './routes/workflowBundles.js';
import { assetSharingRouter } from './routes/assetSharing.js';
import { mirrorTableManager } from './services/mirrorTableManager.js';
import { ftpFileStagingService } from './services/ftpFileStagingService.js';
import { hashtagSchedulerService } from './services/hashtagSchedulerService.js';
import { ftpSchedulerService } from './services/ftpSchedulerService.js';
import { automationsRouter } from './routes/automations.js';
import { optionalAuth, requireAuth } from './middleware/auth.js';

// dotenv/config auto-loads

const app = express();
const PORT = process.env.PORT || 5002;

const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('CORS Not Allowed by Policy'), false);
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logger middleware (logs req.path without query string to protect credentials and PII - BE-28)
app.use((req, _res, next) => {
  if (!req.path.startsWith('/api/events')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Decodes JWT Bearer token into req.user for authenticated sessions
app.use(optionalAuth);

// 1. Public Unauthenticated Endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'Operational Workflow Manager Backend Service',
    database: isPostgresConnected ? 'PostgreSQL (operational_workflow_db)' : 'Unavailable',
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.use('/api/auth', authRouter);
app.use('/api', eventsRouter);

// 2. Protected Operational Routes (Require Valid JWT Token)
app.use('/api/issues', requireAuth, issuesRouter);
app.use('/api/db', requireAuth, databaseRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/organizations', requireAuth, organizationRouter);
app.use('/api/transactions', requireAuth, transactionSettingsRouter);
app.use('/api/teams', requireAuth, teamsRouter);
app.use('/api/workflows', requireAuth, workflowsRouter);
app.use('/api/investigations', requireAuth, investigationsRouter);
app.use('/api/validation-boxes', requireAuth, validationBoxesRouter);
app.use('/api/resolutions', requireAuth, resolutionsRouter);
app.use('/api/approvals', requireAuth, approvalsRouter);
app.use('/api/workflow-bundles', requireAuth, workflowBundlesRouter);
app.use('/api/assets', requireAuth, assetSharingRouter);
app.use('/api/settings/proposals', requireAuth, workspaceSettingsProposalsRouter);
app.use('/api/metrics', requireAuth, metricsRouter);
app.use('/api/escalations', requireAuth, escalationsRouter);
app.use('/api/sandbox', requireAuth, sandboxRouter);
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/external-requests', requireAuth, messagesRouter);
app.use('/api', requireAuth, collaborationRouter);
app.use('/api/automations', requireAuth, automationsRouter);
app.use('/api', requireAuth, miscRouter);

// API 404 Handler (BE-24)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path} - Endpoint not found.` });
});

// Global Express Error Handler (BE-24)
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[UnhandledError] ${req.method} ${req.path}:`, err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error'
  });
});

// Helper to get local LAN IP addresses for multi-device network testing
function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Initialize Database connections & run migrations then start Express server
async function startServer() {
  try {
    await runMigrations();
  } catch (migErr: any) {
    console.error('❌ [ServerBoot] Fatal: Database migrations failed to execute cleanly:', migErr);
    process.exit(1);
  }

  await mirrorTableManager.provisionAllConnectedDbMirrors().catch(err => {
    console.warn('[ServerBoot] Error auto-provisioning mirror tables on boot:', err.message);
  });
  await ftpFileStagingService.ensureFtpTablesArePermanent().catch(err => {
    console.warn('[ServerBoot] Error verifying permanent FTP mirror tables:', err.message);
  });

  // Precision Orphaned Task Sweeper: Fails in-flight jobs only if heartbeat expired (> 3 mins)
  if (isPostgresConnected) {
    try {
      const { queryPg } = await import('./config/postgres.js');
      const sweepRes = await queryPg(`
        UPDATE issues i
        SET status = 'FAILED',
            description = COALESCE(description, '') || ' [Orphaned in-flight job swept on application restart: heartbeat expired]'
        WHERE i.status IN ('IN_PROGRESS', 'In Progress')
          AND NOT EXISTS (
            SELECT 1 FROM task_batch_heartbeats h
            WHERE h.task_id = i.id 
              AND h.last_heartbeat_at > NOW() - INTERVAL '3 minutes'
          )
        RETURNING id;
      `);
      if (sweepRes.rowCount && sweepRes.rowCount > 0) {
        console.log(`[ServerBoot] Precision Sweeper: Safely marked ${sweepRes.rowCount} orphaned task(s) as Failed.`);
      }
    } catch (sweepErr: any) {
      console.warn('[ServerBoot] Precision sweeper check warning:', sweepErr.message);
    }
  }

  // Start autonomous hashtag scheduler for SCHEDULED_CRON presets
  hashtagSchedulerService.startHashtagScheduler();

  // Start autonomous FTP staging scheduler for scheduled remote polls (AUD-AUTO-002)
  ftpSchedulerService.startFtpScheduler();

  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'frontend'))
    ? process.cwd()
    : path.resolve(process.cwd(), '..');
  const frontendDir = path.resolve(rootDir, 'frontend');
  const indexHtmlPath = path.resolve(frontendDir, 'index.html');

  console.log(`[ServerBoot] Frontend dir: ${frontendDir}, indexHtml exists: ${fs.existsSync(indexHtmlPath)}`);

  const distPath = path.resolve(rootDir, 'frontend/dist');
  if (fs.existsSync(distPath)) {
    console.log(`[ServerBoot] Serving frontend application from ${distPath}`);
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/assets/')) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[ServerBoot] Frontend dist not found, running in pure API mode.');
  }

  // Bind to 0.0.0.0 so all network devices (WiFi/LAN/Cross-browser) can access the app
  app.listen(Number(PORT), '0.0.0.0', () => {
    const lanIps = getLocalIpAddresses();
    console.log(`====================================================`);
    console.log(`🚀 Operational Workflow Manager running on 0.0.0.0:${PORT}`);
    console.log(`💻 Local access:   http://localhost:${PORT}`);
    if (lanIps.length > 0) {
      lanIps.forEach(ip => {
        console.log(`📱 Network access: http://${ip}:${PORT}`);
      });
    }
    console.log(`🗄️ Database mode:  ${isPostgresConnected ? 'PostgreSQL (localhost:5432)' : 'In-Memory Store'}`);
    console.log(`⚡ Real-time SSE:  http://localhost:${PORT}/api/events`);
    console.log(`====================================================`);
  });
}

startServer();
