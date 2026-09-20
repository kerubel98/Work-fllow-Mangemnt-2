import mongoose from 'mongoose';

export let isMongoConnected = false;
export let currentMongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/operational_workflow_db';
export let lastConnectionError: string | null = null;
export let lastConnectionAttempt: string | null = null;

export async function connectDB(customUri?: string): Promise<{ success: boolean; message: string; uri: string; error?: string }> {
  const uriToUse = customUri || process.env.MONGODB_URI || currentMongoUri;
  currentMongoUri = uriToUse;
  lastConnectionAttempt = new Date().toISOString();

  try {
    if (mongoose.connection.readyState === 1) {
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
  } catch (err: any) {
    isMongoConnected = false;
    lastConnectionError = err.message || 'Unknown MongoDB connection error';
    console.warn(`⚠️ Could not connect to MongoDB instance (${lastConnectionError}).`);
    console.warn(`ℹ️ Backend fallback: in-memory store active.`);
    return {
      success: false,
      message: `Failed to connect to MongoDB: ${lastConnectionError}`,
      uri: maskMongoUri(uriToUse),
      error: lastConnectionError || undefined
    };

  }
}

export async function disconnectDB(): Promise<{ success: boolean; message: string }> {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    isMongoConnected = false;
    console.log(`🔌 Disconnected from MongoDB.`);
    return { success: true, message: 'Disconnected from MongoDB' };
  } catch (err: any) {
    return { success: false, message: `Error disconnecting: ${err.message}` };
  }
}

export async function getMongoStatus() {
  const readyState = mongoose.connection.readyState;
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  
  let pingMs: number | null = null;
  let collections: { name: string; count: number }[] = [];

  if (readyState === 1 && mongoose.connection.db) {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      pingMs = Date.now() - start;

      const collList = await mongoose.connection.db.listCollections().toArray();
      collections = await Promise.all(
        collList.map(async (c) => {
          try {
            const count = await mongoose.connection.db!.collection(c.name).countDocuments();
            return { name: c.name, count };
          } catch {
            return { name: c.name, count: 0 };
          }
        })
      );
    } catch (e: any) {
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
    modelsLoaded: Object.keys(mongoose.models)
  };
}

export function maskMongoUri(uri: string): string {
  if (!uri) return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/, '$1******$3');
}

