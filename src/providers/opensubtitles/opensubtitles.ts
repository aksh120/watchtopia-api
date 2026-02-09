import { BaseProvider, type ProviderCapabilities, type ProviderMediaObject, type ProviderResult, type Subtitle } from '@omss/framework';
import axios from 'axios';
import { gunzipSync } from 'node:zlib';

export class OpenSubtitlesProvider extends BaseProvider {
    readonly id = 'opensubtitles';
    readonly name = 'OpenSubtitles';
    readonly enabled = true;

    readonly BASE_URL = 'https://rest.opensubtitles.org';
    readonly HEADERS = {
        'User-Agent': 'TemporaryUserAgent',
    };

    readonly capabilities: ProviderCapabilities = {
        supportedContentTypes: ['movies', 'tv'],
    };

    async getMovieSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSubtitles(media, 'movie');
    }

    async getTVSources(media: ProviderMediaObject): Promise<ProviderResult> {
        return this.getSubtitles(media, 'tv');
    }

    private async getSubtitles(media: ProviderMediaObject, type: 'movie' | 'tv'): Promise<ProviderResult> {
        try {
            const tmdbId = media.tmdbId;
            let imdbId = media.imdbId;

            if (!imdbId) {
                imdbId = await this.getImdbId(tmdbId, type, media.s, media.e);
            }

            if (!imdbId) {
                this.console.warn('OpenSubtitles: No IMDB ID found', media);
                return this.emptyResult();
            }

            const cleanImdbId = imdbId.replace('tt', '');
            const url = `${this.BASE_URL}/search/imdbid-${cleanImdbId}/sublanguageid-eng`;

            this.console.debug(`OpenSubtitles fetching: ${url}`);

            const response = await axios.get(url, {
                headers: this.HEADERS,
                timeout: 8000,
            });

            const data = response.data;

            if (!Array.isArray(data)) {
                return this.emptyResult();
            }

            const subtitles: Subtitle[] = [];

            // Process top 3 results
            const candidates = data
                .filter((item: any) => item.SubFormat === 'srt' || item.SubFormat === 'vtt')
                .slice(0, 3);

            for (const item of candidates) {
                try {
                    const contentValues = await this.fetchAndProcessSubtitle(item.SubDownloadLink, item.SubFormat);
                    if (contentValues) {
                        subtitles.push({
                            url: contentValues.url,
                            label: item.MovieReleaseName || 'English (OpenSubtitles)',
                            format: 'vtt', // Always VTT after conversion
                        });
                    }
                } catch (err) {
                    this.console.warn(`Failed to process subtitle: ${item.SubFileName}`, (err as Error).message);
                }
            }

            this.console.success(`OpenSubtitles found and processed ${subtitles.length} subs`, media);

            return {
                sources: [],
                subtitles,
                diagnostics: [],
            };

        } catch (error) {
            this.console.error('OpenSubtitles failed', error, media);
            return this.emptyResult();
        }
    }

    private async fetchAndProcessSubtitle(url: string, format: string): Promise<{ url: string } | null> {
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 5000,
            });

            let buffer = Buffer.from(response.data);

            // Check for GZIP magic bytes (1f 8b)
            if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
                buffer = gunzipSync(buffer);
            }

            let text = buffer.toString('utf-8');

            // Convert SRT to VTT if needed
            if (format === 'srt') {
                text = this.srtToVtt(text);
            }

            // Create Data URI
            const base64 = Buffer.from(text).toString('base64');
            return {
                url: `data:text/vtt;base64,${base64}`,
            };
        } catch (e) {
            return null;
        }
    }

    private srtToVtt(srt: string): string {
        // Simple SRT to VTT converter
        let vtt = 'WEBVTT\n\n';

        // Remove potentially BOM
        srt = srt.replace(/^\uFEFF/, '');

        // Replace time format (00:00:00,000 -> 00:00:00.000)
        vtt += srt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

        return vtt;
    }

    private async getImdbId(tmdbId: string, type: 'movie' | 'tv', season?: number | string, episode?: number | string): Promise<string | undefined> {
        try {
            const apiKey = process.env.TMDB_API_KEY;
            if (!apiKey) return undefined;

            let url = `https://api.themoviedb.org/3/movie/${tmdbId}/external_ids?api_key=${apiKey}`;

            if (type === 'tv') {
                if (!season || !episode) return undefined;
                url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}/external_ids?api_key=${apiKey}`;
            }

            const response = await axios.get(url, { timeout: 5000 });
            return response.data.imdb_id;
        } catch (e) {
            return undefined;
        }
    }

    private emptyResult(): ProviderResult {
        return {
            sources: [],
            subtitles: [],
            diagnostics: [],
        };
    }

    async healthCheck(): Promise<boolean> {
        try {
            await axios.get(`${this.BASE_URL}/search/imdbid-0137523/sublanguageid-eng`, {
                headers: this.HEADERS,
                timeout: 5000,
            });
            return true;
        } catch {
            return false;
        }
    }
}
