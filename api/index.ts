import { bootstrap } from '../src/server.js';

let server: any;

export default async (req: any, res: any) => {
    if (!server) {
        server = await bootstrap();
    }
    const app = server.getInstance();
    await app.ready();
    app(req, res);
};
