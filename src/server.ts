import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { knownThirdPartyProxies } from './config.js';
import axios from 'axios';
import axiosRetry from 'axios-retry';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure global axios retry for transient network errors (including internal framework calls)
const retryConfig = {
    retries: 3,
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error: any) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code) ||
            (error.response?.status ?? 0) >= 500;
    },
    shouldResetTimeout: true,
    onRetry: (retryCount: number, error: any) => {
        console.log(`[Axios] Retry attempt ${retryCount} for ${error.config?.url || 'unknown request'} due to: ${error.message}`);
    }
};

// Patch default instance
axiosRetry(axios, retryConfig);

// Monkey-patch axios.create to ensure framework instances also get retries
const originalCreate = axios.create;
axios.create = function (...args) {
    const instance = originalCreate.apply(this, args);
    axiosRetry(instance, retryConfig);
    return instance;
};

async function main() {
    const server = new OMSSServer({
        name: 'CinePro',
        version: '1.0.0',

        // Network
        host: process.env.HOST ?? 'localhost',
        port: Number(process.env.PORT ?? 3000),
        publicUrl: process.env.PUBLIC_URL,

        // Cache (memory for dev, Redis for prod)
        cache: {
            type: process.env.CACHE_TYPE as 'memory' | 'redis' ?? 'memory',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24,
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD,
            },
        },

        // TMDB
        tmdb: {
            apiKey: process.env.TMDB_API_KEY!,
            cacheTTL: 24 * 60 * 60, // 24h
        },

        // Third Party Proxy removal
        proxyConfig: {
            knownThirdPartyProxies: knownThirdPartyProxies
        }
    });

    // Register providers
    const registry = server.getRegistry();
    await registry.discoverProviders(path.join(__dirname, './providers/'))

    await server.start();
}

main().catch(() => {
    process.exit(1);
});
