<div align="center">

# Watchtopia API 🎬

**OMSS-compliant streaming backend powering the Watchtopia ecosystem.**<br/>
Built with [@omss/framework](https://www.npmjs.com/package/@omss/framework) for extensible, type-safe media scraping and streaming.

</div>

---

## Overview

Watchtopia API is the foundational backend service for the Watchtopia App. It serves as a centralized scraping and streaming engine, designed to provide high-quality media sources efficiently.

Built on the Open Media Streaming Standard (OMSS), this backend implements a modular provider system that enables easy integration of multiple streaming sources while maintaining type safety and production-ready standards.

---

## ✨ Features

- 🎯 **OMSS-Compliant** – Follows the Open Media Streaming Standard specification
- 🔌 **Modular Providers** – Drop-in provider system with auto-discovery
- 🛡️ **Type-Safe** – Full TypeScript implementation with strict types
- ⚡ **Production-Ready** – Redis caching, Docker support, robust error handling
- 🎬 **Multi-Source** – Support for movies and TV shows from multiple providers
- 🔄 **Hot Reload** – Development mode with automatic restarts

### Supported Providers
- **UEmbed**
- **Vidzee**

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- TMDB API Key ([get one here](https://www.themoviedb.org/settings/api))

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your TMDB_API_KEY
```

### Development

```bash
# Start dev server with hot reload
npm run dev

# Server runs at http://localhost:3000
```

### Production

> [!Caution]
> **Watchtopia API is designed for personal and home use only.**
> <br/> Users are responsible for ensuring compliance with applicable laws and terms of service for streaming sources.

```bash
# Build and start
npm run build
npm start
```

---

## 📁 Project Structure

```
watchtopia-api/
├── src/
│   ├── server.ts           # Main server entrypoint
│   ├── providers/          # Streaming source providers
│   │   ├── uembed/         # UEmbed provider implementation
│   │   └── vidzee/         # Vidzee provider implementation
│   └── config.ts           # Shared configuration
├── .env.example            # Environment configuration template
├── package.json            # Dependencies and scripts
└── tsconfig.json           # TypeScript configuration
```

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Required
TMDB_API_KEY=your_tmdb_api_key_here

# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
PUBLIC_URL=http://localhost:3000

# Redis (Production)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### TMDB API Key

Watchtopia API requires a TMDB API key for metadata enrichment:

1. Create a TMDB account at [themoviedb.org](https://www.themoviedb.org/)
2. Navigate to Settings → API
3. Request an API key (choose "Developer" option)
4. Add the key to your `.env` file

---

## 🛠️ Development

### Scripts

```bash
npm run dev      # Development server with hot reload
npm run build    # Build for production
npm start        # Start production server. Requires build first
npm run format   # Format code with Prettier
```

---

## 🔒 Legal Notice

Watchtopia API is designed for **personal and home use only**. Users are responsible for ensuring compliance with applicable laws and terms of service for streaming sources. This software does not host, store, or distribute any copyrighted content.

---

## 🌟 Acknowledgments

- Built with [OMSS Framework](https://github.com/omss-spec)
- Metadata powered by [The Movie Database (TMDB)](https://www.themoviedb.org/)