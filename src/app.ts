import { OMSSServer } from '@omss/framework';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { knownThirdPartyProxies } from './thirdPartyProxies.js';
import { streamPatterns } from './streamPatterns.js';
import { VideasyProvider } from './providers/videasy/videasy.js';
import { VidNestProvider } from './providers/vidnest/vidnest.js';
import { NhdApiProvider } from './providers/nhdapi/nhdapi.js';

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : '';
const __dirname = __filename ? path.dirname(__filename) : '';

export default async function bootstrap() {
    const server = new OMSSServer({
        name: 'CinePro',
        version: '1.0.0',

        // Network
        host: process.env.HOST ?? '0.0.0.0',
        port: Number(process.env.PORT ?? 3000),
        publicUrl: process.env.PUBLIC_URL,

        // Cache (memory for dev, Redis for prod)
        cache: {
            type: (process.env.CACHE_TYPE as 'memory' | 'redis') ?? 'memory',
            ttl: {
                sources: 60 * 60,
                subtitles: 60 * 60 * 24
            },
            redis: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6379),
                password: process.env.REDIS_PASSWORD
            }
        },

        // TMDB
        tmdb: {
            apiKey: process.env.TMDB_API_KEY!,
            cacheTTL: 24 * 60 * 60 // 24h
        },

        // Third Party Proxy removal
        proxyConfig: {
            knownThirdPartyProxies: knownThirdPartyProxies,
            streamPatterns
        },

        cors: {
            origin: process.env.CORS_ORIGIN ?? '*',
            methods: ['GET', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            exposedHeaders: ['Content-Range', 'Accept-Ranges', 'ETag'],
            preflightContinue: false,
            optionsSuccessStatus: 204
        },

        stremio: {
            // exposes a stremio addon on /stremio/manifest.json
            enableNativeAddon: process.env.STREMIO_ADDON === 'true',
            // you can your own custom stremio addons as sources into cinepro.
            stremioAddons: []
            /*
            stremioAddons: [
                {
                    id: 'some-unique-id',
                    url: 'https://example.com/manifest.json',
                    enabled: true
                }
            ]
            */
        },

        // MCP for AI agents
        mcp: {
            enabled: process.env.MCP_ENABLED === 'true'
        }
    });

    const registry = server.getRegistry();

    // Statically register providers for serverless (Vercel) compatibility
    registry.register(new VideasyProvider());
    registry.register(new VidNestProvider());
    registry.register(new NhdApiProvider());

    // Optional: discover other providers if filesystem is accessible
    try {
        if (__dirname) {
            await registry.discoverProviders(path.join(__dirname, './providers/'));
        }
    } catch {
        // Discovery might fail in some serverless environments
    }

    const app = server.getInstance();
    app.addHook('preSerialization', async (request, reply, payload: any) => {
        if (payload && Array.isArray(payload.sources)) {
            return {
                ...payload,
                sources: payload.sources.map((source: any) => {
                    if (source && source.url !== undefined) {
                        const { url, ...rest } = source;
                        return {
                            rawUrl: url,
                            ...rest
                        };
                    }
                    return source;
                })
            };
        }
        return payload;
    });

    return server;
}

async function main() {
    const server = await bootstrap();
    await server.start();

    const publicUrl =
        process.env.PUBLIC_URL ??
        `http://${process.env.HOST ?? 'localhost'}:${process.env.PORT ?? 3000}`;

    const uiUrl = `https://ui.cinepro.cc/?omssurl=${encodeURIComponent(publicUrl)}`;

    const title = '🚀 CinePro/ui is in public testing';
    const contrib =
        '🤝 We are looking for contributors to improve and develop!';
    const repo = 'Contribute: https://github.com/cinepro-org/ui';
    const tryIt = `🌐 Try it out: ${uiUrl}!`;

    const lines = [title, '', repo, '', contrib, '', tryIt];

    // compute box width based on longest line
    const width = Math.max(...lines.map((l) => l.length)) + 2;

    const borderTop = '╭' + '─'.repeat(width) + '╮';
    const borderBottom = '╰' + '─'.repeat(width) + '╯';

    const pad = (line: string) => '│ ' + line.padEnd(width - 2, ' ') + ' │';

    console.log(`
================== CINEPRO BETA ANNOUNCEMENT ==================

${borderTop}
${lines.map(pad).join('\n')}
${borderBottom}
`);
}

if (!process.env.VERCEL && !process.env.IS_CLOUDFLARE_WORKER) {
    main().catch((err) => {
        console.error('Fatal Server Error:', err);
        process.exit(1);
    });
}
