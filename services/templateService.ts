import { createClient } from '@supabase/supabase-js';
import { AdTemplate, Platform, UseCaseCategory, SettingsState } from '../types';
import { AD_LIBRARY } from '../constants';
import { supabase } from './supabaseClient';

// Initialize Supabase Client Safely (Done in supabaseClient.ts)

export interface TemplateMetadata {
    id: string;
    name: string;
    description: string;
    visual_analysis: string;
    tags: string[];
    category: UseCaseCategory;
    platform_origin: Platform;
    image_url: string;
    layout?: any; // JSONB storage for TextZone[]
    updated_at?: string;
}

// 1. Fetch All Templates (Merged with Constants)
export const getEnrichedTemplates = async (): Promise<AdTemplate[]> => {
    if (!supabase) return AD_LIBRARY; // Fallback if no specific config
    try {
        const { data, error } = await supabase
            .from('template_metadata')
            .select('*');

        if (error) {
            console.warn("Failed to fetch template metadata:", error);
            return AD_LIBRARY; // Fallback to constants
        }

        if (!data || data.length === 0) {
            return AD_LIBRARY;
        }

        // Merge DB data with Constants to ensure we have valid objects
        // DB takes precedence for metadata, Constants for base existence (if needed, or just use DB)
        // Here we'll treat DB as the source of truth for ENRICHED data, but map it to AdTemplate type

        const dbTemplates = data.map((row: any) => ({
            id: row.id,
            name: row.name,
            description: row.description,
            imageUrl: row.image_url,
            tags: row.tags, // JSONB comes back as array
            visual_analysis: row.visual_analysis,
            category: row.category as UseCaseCategory,
            platformOrigin: row.platform_origin as Platform,
            layout: row.layout // Pass through the layout object (zones)
        }));

        // Option: Merge with local library to catch any new hardcoded ones not yet in DB?
        // For now, let's return DB templates if they exist, else fallback. 
        // Realistically we want to return a union if the IDs differ, but let's keep it simple.

        // If DB has fewer than constants, might represent partial scan. 
        // Let's overlay DB data onto AD_LIBRARY.
        const enrichedLibrary = AD_LIBRARY.map(localTmpl => {
            const remote = dbTemplates.find((t: any) => t.id === localTmpl.id);
            if (remote) {
                // Merge tags to ensure new defaults (like 'meta') persist even if DB is stale
                const mergedTags = Array.from(new Set([
                    ...(remote.tags || []),
                    ...(localTmpl.tags || []),
                    "meta", "instagram"
                ]));

                return {
                    ...localTmpl,
                    ...remote,
                    tags: mergedTags
                };
            }
            return localTmpl;
        });

        return enrichedLibrary;

    } catch (e) {
        console.error("Error in getEnrichedTemplates", e);
        return AD_LIBRARY;
    }
};

// Helper to get base64 from URL (Browser-compatible)
async function urlToBase64(url: string): Promise<string> {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error("Error converting URL to base64:", e);
        throw e;
    }
}

// 2. Scan & Enrich Single Template
export const enrichTemplate = async (
    settings: SettingsState,
    template: AdTemplate,
    analyzeFn: (s: SettingsState, img: string) => Promise<Partial<AdTemplate>>,
    layoutFn?: (s: SettingsState, img: string) => Promise<any[]> // New optional layout analysis function
): Promise<AdTemplate> => {
    // 1. Prepare Image (Fetch if URL)
    let imagePayload = template.imageUrl;

    // Simple heuristic: if it looks like a URL (http or /), fetch it. 
    // Data URLs start with 'data:'
    if (!imagePayload.startsWith('data:')) {
        try {
            console.log(`Fetching image for ${template.id}...`);
            imagePayload = await urlToBase64(template.imageUrl);
            console.log(`Fetch success for ${template.id}`);
        } catch (e) {
            console.warn(`Could not fetch image for template ${template.id}`, e);
            // specific fallback or rethrow? 
            // Gemini API absolutely needs base64 for inlineData. 
            // If we fail to fetch, we can't analyze.
            throw new Error(`Failed to load image data for ${template.id}`);
        }
    }

    // 2. Analyze (Parallelize if layoutFn provided)
    const promises: Promise<any>[] = [analyzeFn(settings, imagePayload)];
    if (layoutFn) {
        promises.push(layoutFn(settings, imagePayload));
    }

    const results = await Promise.all(promises);
    const analysis = results[0];
    const layoutZones = results[1] || []; // TextZone[]

    // 3. Merge
    const enriched: AdTemplate = {
        ...template,
        ...analysis,
        // Ensure defaults if analysis missed them
        tags: analysis.tags || template.tags,
        category: (analysis.category as UseCaseCategory) || template.category || UseCaseCategory.OTHER,
        platformOrigin: 'meta', // We know these are Meta
        layout: layoutZones.length > 0 ? { zones: layoutZones } : template.layout
    };

    // 4. Save to DB
    if (supabase) {
        const row: TemplateMetadata = {
            id: enriched.id,
            name: enriched.name,
            description: enriched.description,
            visual_analysis: enriched.visual_analysis || "",
            tags: enriched.tags,
            category: enriched.category as UseCaseCategory,
            platform_origin: enriched.platformOrigin as Platform,
            image_url: enriched.imageUrl,
            layout: enriched.layout // Save layout as JSONB
        };

        const { error } = await supabase
            .from('template_metadata')
            .upsert(row);

        if (error) {
            // If error is about missing column, warn but don't crash
            console.warn(`Supabase Upsert Error (likely missing layout column?): ${error.message}`);
            // Retry without layout?
            delete row.layout;
            const { error: retryError } = await supabase.from('template_metadata').upsert(row);
            if (retryError) throw new Error(`Supabase Retry Error: ${retryError.message}`);
        }
    }

    return enriched;
};

// 3. Batch Scan (Async Iterator)
export async function* scanLibraryIterator(
    settings: SettingsState,
    templates: AdTemplate[],
    analyzeFn: (s: SettingsState, img: string) => Promise<Partial<AdTemplate>>,
    layoutFn?: (s: SettingsState, img: string) => Promise<any[]>
) {
    for (const tmpl of templates) {
        try {
            const result = await enrichTemplate(settings, tmpl, analyzeFn, layoutFn);
            yield { status: 'success', template: result };
        } catch (e: any) {
            yield { status: 'error', id: tmpl.id, error: e.message };
        }
    }
}
