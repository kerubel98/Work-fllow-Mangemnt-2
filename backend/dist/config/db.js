// MongoDB connection stub / optional driver loader
// Primary datastore is PostgreSQL (operational_workflow_db)
let mongooseInstance = null;
try {
    // @ts-ignore
    const m = await import('mongoose');
    mongooseInstance = m.default || m;
}
catch {
    // Mongoose driver is not installed; PostgreSQL is the authoritative datastore.
}
export const mongoose = mongooseInstance;
export let isMongoConnected = false;
export let currentMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/operational_workflow_db';
export let lastConnectionError = null;
export let lastConnectionAttempt = null;
export async function connectDB(customUri) {
    if (!mongoose) {
        return {
            success: false,
            message: 'MongoDB driver is not installed. PostgreSQL is the active operational datastore.',
            uri: maskMongoUri(customUri || currentMongoUri),
            error: 'DRIVER_NOT_INSTALLED'
        };
    }
    const uriToUse = customUri || process.env.MONGODB_URI || currentMongoUri;
    currentMongoUri = uriToUse;
    lastConnectionAttempt = new Date().toISOString();
    try {
        if (mongoose.connection?.readyState === 1) {
            await mongoose.disconnect();
        }
        console.log(`🔌 Connecting to MongoDB: ${maskMongoUri(uriToUse)}...`);
        await mongoose.connect(uriToUse, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        });
        isMongoConnected = true;
        lastConnectionError = null;
        console.log(`✅ Successfully connected to MongoDB database [${mongoose.connection.name}].`);
        return {
            success: true,
            message: `Successfully connected to MongoDB (${mongoose.connection.name || 'operational_workflow_db'})`,
            uri: maskMongoUri(uriToUse)
        };
    }
    catch (err) {
        isMongoConnected = false;
        lastConnectionError = err.message || 'Unknown MongoDB connection error';
        console.warn(`⚠️ Could not connect to MongoDB instance (${lastConnectionError}).`);
        return {
            success: false,
            message: `Failed to connect to MongoDB: ${lastConnectionError}`,
            uri: maskMongoUri(uriToUse),
            error: lastConnectionError || undefined
        };
    }
}
export async function disconnectDB() {
    if (!mongoose) {
        isMongoConnected = false;
        return { success: true, message: 'Disconnected from MongoDB' };
    }
    try {
        if (mongoose.connection?.readyState !== 0) {
            await mongoose.disconnect();
        }
        isMongoConnected = false;
        console.log(`🔌 Disconnected from MongoDB.`);
        return { success: true, message: 'Disconnected from MongoDB' };
    }
    catch (err) {
        return { success: false, message: `Error disconnecting: ${err.message}` };
    }
}
export async function getMongoStatus() {
    if (!mongoose || !mongoose.connection) {
        return {
            isConnected: false,
            state: 'disconnected',
            readyState: 0,
            databaseName: null,
            host: null,
            port: null,
            currentUri: maskMongoUri(currentMongoUri),
            rawUriConfigured: Boolean(process.env.MONGODB_URI || currentMongoUri),
            lastAttempt: lastConnectionAttempt,
            lastError: lastConnectionError || 'MongoDB driver not installed in PostgreSQL deployment',
            pingMs: null,
            collections: [],
            modelsLoaded: []
        };
    }
    const readyState = mongoose.connection.readyState ?? 0;
    const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    let pingMs = null;
    let collections = [];
    if (readyState === 1 && mongoose.connection.db) {
        try {
            const start = Date.now();
            await mongoose.connection.db.admin().ping();
            pingMs = Date.now() - start;
            const collList = await mongoose.connection.db.listCollections().toArray();
            collections = await Promise.all(collList.map(async (c) => {
                try {
                    const count = await mongoose.connection.db.collection(c.name).countDocuments();
                    return { name: c.name, count };
                }
                catch {
                    return { name: c.name, count: 0 };
                }
            }));
        }
        catch (e) {
            console.warn('Could not ping MongoDB:', e.message);
        }
    }
    return {
        isConnected: readyState === 1,
        state: stateNames[readyState] || 'unknown',
        readyState,
        databaseName: mongoose.connection.name || null,
        host: mongoose.connection.host || null,
        port: mongoose.connection.port || null,
        currentUri: maskMongoUri(currentMongoUri),
        rawUriConfigured: Boolean(process.env.MONGODB_URI || currentMongoUri),
        lastAttempt: lastConnectionAttempt,
        lastError: lastConnectionError,
        pingMs,
        collections,
        modelsLoaded: mongoose.models ? Object.keys(mongoose.models) : []
    };
}
export function maskMongoUri(uri) {
    if (!uri)
        return '';
    return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
}
