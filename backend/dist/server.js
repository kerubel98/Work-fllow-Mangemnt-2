import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { connectPostgres, isPostgresConnected } from './config/postgres.js';
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
import { mirrorTableManager } from './services/mirrorTableManager.js';
import { ftpFileStagingService } from './services/ftpFileStagingService.js';
// dotenv/config auto-loads
const app = express();
const PORT = process.env.PORT || 5002;
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Request logger middleware
app.use((req, _res, next) => {
    if (!req.url.startsWith('/api/events')) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});
// Route mounts
app.use('/api/auth', authRouter);
app.use('/api/issues', issuesRouter);
app.use('/api/db', databaseRouter);
app.use('/api/ai', aiRouter);
app.use('/api/organizations', organizationRouter);
app.use('/api/transactions', transactionSettingsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/workflows', workflowsRouter);
app.use('/api/investigations', investigationsRouter);
app.use('/api/validation-boxes', validationBoxesRouter);
app.use('/api/resolutions', resolutionsRouter);
app.use('/api/settings/proposals', workspaceSettingsProposalsRouter);
app.use('/api', eventsRouter);
app.use('/api', collaborationRouter);
app.use('/api', miscRouter);
app.get('/api/health', (_req, res) => {
    res.json({
        status: 'OK',
        service: 'Operational Workflow Manager Backend Service',
        database: isPostgresConnected ? 'PostgreSQL (operational_workflow_db)' : 'Unavailable',
        uptimeSeconds: process.uptime(),
        timestamp: new Date().toISOString()
    });
});
// Helper to get local LAN IP addresses for multi-device network testing
function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                ips.push(iface.address);
            }
        }
    }
    return ips;
}
// Initialize Database connections & seed data then start Express server
async function startServer() {
    await connectPostgres();
    await seedPostgres();
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
        SET status = 'Failed',
            description = COALESCE(description, '') || ' [Orphaned in-flight job swept on application restart: heartbeat expired]'
        WHERE i.status = 'In Progress'
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
        }
        catch (sweepErr) {
            console.warn('[ServerBoot] Precision sweeper check warning:', sweepErr.message);
        }
    }
    // MongoDB fallback removed — PostgreSQL is the sole persistence layer.
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
    }
    else {
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
