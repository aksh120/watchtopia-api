import bootstrap from './app.js';

async function main() {
    const server = await bootstrap();
    await server.start();
}

main().catch((err) => {
    console.error('Fatal Server Error:', err);
    process.exit(1);
});
