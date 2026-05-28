import bootstrap from '../src/app.js';

let server: any;

export default async (req: any, res: any) => {
    try {
        if (!server) {
            server = await bootstrap();
        }
        const app = server.getInstance();
        await app.ready();
        
        // Ensure Fastify handles the request correctly in a serverless environment and wait for completion
        await new Promise<void>((resolve, reject) => {
            res.on('finish', resolve);
            res.on('close', resolve);
            res.on('error', reject);
            app.server.emit('request', req, res);
        });
    } catch (err) {
        console.error('Vercel Invocation Error:', err);
        res.statusCode = 500;
        res.end(JSON.stringify({ 
            error: 'Internal Server Error', 
            details: err instanceof Error ? err.message : String(err) 
        }));
    }
};
