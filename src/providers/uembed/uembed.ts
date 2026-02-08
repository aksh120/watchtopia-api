import { BaseProvider, type SourceType } from '@omss/framework';
import type { ProviderCapabilities, ProviderMediaObject, ProviderResult, Source, Subtitle } from '@omss/framework';
import axios from 'axios';

interface StreamData {
    title?: string;
    file: string;
    label?: string;
    id?: string;
    type?: string;
}

interface FileEntry {
    file: string;
    type: string;
    lang: string;
    quality: string;
    headers: Record<string, string>;
    provider: string;
}

export class UEmbedProvider extends BaseProvider {
    readonly id = 'uembed';
    readonly name = 'UEmbed';
    readonly enabled = true;
    readonly BASE_URL = 'https://uembed.xyz';
    readonly HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://madplay.site',
        'Referer': 'https://madplay.site/',
    };

    // API endpoints
    private readonly UEMBED_API = 'https://uembed.xyz/api/video/tmdb';
    private readonly VXR_API = 'https://cdn.madplay.site/vxr';
    private readonly HOLLY_API = 'https://api.madplay.site/api/movies/holly';
    private readonly ROGFLIX_API = 'https://api.madplay.site/api/rogflix';



    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv'],
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media, 'movie');
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSources(media, 'tv');
    }

    private async getSources(media: ProviderMediaObject, type: 'movie' | 'tv'): Promise<ProviderResult> {
        try {
            const tmdbId = media.tmdbId;
            const season = media.s?.toString() ?? '1';
            const episode = media.e?.toString() ?? '1';

            this.console.debug(`UEmbed scrape started for ${type} ${tmdbId}`);

            // Build all API URLs
            const apis = this.buildApiUrls(tmdbId, type, season, episode);

            // Fetch from ALL APIs in parallel for speed
            const results = await Promise.allSettled(
                apis.map(api => this.fetchApi(api.url, api.name))
            );

            // Collect all successful responses
            const allFiles: FileEntry[] = [];

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const apiName = apis[i].name;

                if (result.status === 'fulfilled' && result.value && Array.isArray(result.value)) {
                    const files = this.processApiResponse(result.value, apiName);
                    allFiles.push(...files);
                    this.console.debug(`${apiName}: ${files.length} streams found`);
                }
            }

            if (allFiles.length === 0) {
                return this.emptyResult('No streams found from any API', media);
            }

            // Deduplicate and convert to sources
            const uniqueFiles = this.deduplicateFiles(allFiles);

            // Limit to top 10 for performance
            const topFiles = uniqueFiles.slice(0, 10);

            const sources: Source[] = topFiles.map(file => {
                const isAsiaFlix = file.file.includes('asiaflix.net');

                return {
                    url: isAsiaFlix ? `${file.file}&headers=%7B%7D` : this.createProxyUrl(file.file, file.headers),
                    rawUrl: file.file,
                    headers: file.headers,
                    type: 'hls' as SourceType,
                    quality: file.quality,
                    audioTracks: [{
                        language: file.lang,
                        label: this.getLanguageLabel(file.lang),
                    }],
                    provider: {
                        id: this.id,
                        name: `${this.name} (${file.provider})`,
                    },
                } as any;
            });

            this.console.success(`${sources.length} sources from UEmbed`, media);

            return {
                sources,
                subtitles: [],
                diagnostics: [],
            };
        } catch (error) {
            this.console.error('UEmbed failed', error, media);
            return this.emptyResult(error instanceof Error ? error.message : 'Unknown error', media);
        }
    }

    private buildApiUrls(tmdbId: string, type: 'movie' | 'tv', season: string, episode: string): Array<{ url: string; name: string }> {
        const apis: Array<{ url: string; name: string }> = [];

        // UEmbed - primary
        apis.push({
            url: `${this.UEMBED_API}?id=${tmdbId}`,
            name: 'uembed'
        });

        // VXR - movies only
        if (type === 'movie') {
            apis.push({
                url: `${this.VXR_API}?id=${tmdbId}&type=movie`,
                name: 'vxr'
            });
        }

        // Holly - both types
        const hollyType = type === 'movie' ? 'movie' : 'series';
        let hollyUrl = `${this.HOLLY_API}?id=${tmdbId}&type=${hollyType}`;
        if (type === 'tv') {
            hollyUrl += `&season=${season}&episode=${episode}`;
        }
        apis.push({ url: hollyUrl, name: 'holly' });

        // Rogflix - both types
        const rogflixType = type === 'movie' ? 'movie' : 'series';
        let rogflixUrl = `${this.ROGFLIX_API}?id=${tmdbId}&type=${rogflixType}`;
        if (type === 'tv') {
            rogflixUrl += `&season=${season}&episode=${episode}`;
        }
        apis.push({ url: rogflixUrl, name: 'rogflix' });

        return apis;
    }

    private async fetchApi(url: string, name: string): Promise<StreamData[] | null> {
        try {
            const response = await axios.get(url, {
                headers: this.HEADERS,
                timeout: 8000, // Fast timeout
            });
            return response.data;
        } catch (error) {
            this.console.debug(`${name} API failed: ${(error as Error).message}`);
            return null;
        }
    }

    private processApiResponse(data: StreamData[], apiName: string): FileEntry[] {
        const files: FileEntry[] = [];

        for (const stream of data) {
            if (!stream.file) continue;

            // Skip Hindi streams
            const title = stream.title || stream.label || '';
            if (title.toLowerCase().includes('hindi')) continue;

            // Skip 'embed' type streams (as requested)
            if (stream.type === 'embed') continue;

            // Skip GitHub raw content (as requested)
            if (stream.file.includes('raw.githubusercontent.com')) continue;

            try {
                const urlOrigin = new URL(stream.file).origin;
                const quality = apiName === 'vxr' ? '804p' : this.extractQuality(stream.file, stream.label);
                const lang = this.getLanguageCode(title);

                files.push({
                    file: stream.file,
                    type: 'hls',
                    lang,
                    quality,
                    headers: {
                        'Referer': urlOrigin + '/',
                        'Origin': urlOrigin,
                        'User-Agent': this.HEADERS['User-Agent'],
                    },
                    provider: apiName,
                });
            } catch {
                // Invalid URL, skip
            }
        }

        return files;
    }

    private extractQuality(url: string, label?: string): string {
        // Try to extract from URL
        const patterns = [
            /(\d{3,4})p/i,
            /(\d{3,4})k/i,
            /quality[_-]?(\d{3,4})/i,
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                const q = parseInt(match[1]);
                if (q >= 240 && q <= 4320) return `${q}p`;
            }
        }

        // Use label if available
        if (label) {
            if (label.includes('4K') || label.includes('2160')) return '4K';
            if (label.includes('1080')) return '1080p';
            if (label.includes('720')) return '720p';
            if (label.includes('HD')) return 'HD';
        }

        return 'Auto';
    }

    private getLanguageCode(title: string): string {
        const lower = title.toLowerCase().trim();
        const langMap: Record<string, string> = {
            'english': 'en', 'french': 'fr', 'german': 'de', 'spanish': 'es',
            'italian': 'it', 'portuguese': 'pt', 'russian': 'ru', 'japanese': 'ja',
            'korean': 'ko', 'chinese': 'zh', 'arabic': 'ar', 'dutch': 'nl',
            'polish': 'pl', 'turkish': 'tr', 'thai': 'th', 'vietnamese': 'vi',
        };

        for (const [name, code] of Object.entries(langMap)) {
            if (lower.includes(name)) return code;
        }

        return 'en'; // Default to English
    }

    private getLanguageLabel(code: string): string {
        const labels: Record<string, string> = {
            'en': 'English', 'fr': 'French', 'de': 'German', 'es': 'Spanish',
            'it': 'Italian', 'pt': 'Portuguese', 'ru': 'Russian', 'ja': 'Japanese',
            'ko': 'Korean', 'zh': 'Chinese', 'ar': 'Arabic', 'nl': 'Dutch',
        };
        return labels[code] || 'English';
    }

    private deduplicateFiles(files: FileEntry[]): FileEntry[] {
        // Sort by quality (highest first)
        const qualityOrder: Record<string, number> = {
            '804p': 9, '4K': 8, '2160p': 8, '1440p': 7, '1080p': 6, '720p': 5,
            '480p': 4, '360p': 3, 'HD': 5, 'Auto': 4, 'Unknown': 1,
        };

        files.sort((a, b) => {
            // Prefer English
            if (a.lang === 'en' && b.lang !== 'en') return -1;
            if (b.lang === 'en' && a.lang !== 'en') return 1;

            // Then by quality
            const orderA = qualityOrder[a.quality] || 0;
            const orderB = qualityOrder[b.quality] || 0;
            return orderB - orderA;
        });

        // Deduplicate by URL
        const seen = new Set<string>();
        return files.filter(file => {
            if (seen.has(file.file)) return false;
            seen.add(file.file);
            return true;
        });
    }

    private emptyResult(message: string, media: ProviderMediaObject): ProviderResult {
        this.console.warn(`UEmbed: ${message}`);
        return {
            sources: [],
            subtitles: [],
            diagnostics: [{
                code: 'PROVIDER_ERROR',
                message: `${this.name}: ${message}`,
                field: '',
                severity: 'error',
            }],
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(this.UEMBED_API + '?id=550', {
                timeout: 5000,
                headers: this.HEADERS,
            });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
