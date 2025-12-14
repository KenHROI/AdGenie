import { createClient } from '@supabase/supabase-js';
import { AdTemplate, Platform, UseCaseCategory, SettingsState } from '../types';
import { AD_LIBRARY } from '../constants';



// Initialize Supabase Client Safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase: any = null;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
        console.error("Failed to initialize Supabase client:", e);
    }
} else {
    console.warn("Missing Supabase Env Vars - Template Intelligence disabled");
}

export interface TemplateMetadata {
    id: string;
    name: string;
    description: string;
    visual_analysis: string;
    tags: string[];
    category: UseCaseCategory;
    platform_origin: Platform;
    image_url: string;
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
            platformOrigin: row.platform_origin as Platform
        }));

        // Option: Merge with local library to catch any new hardcoded ones not yet in DB?
        // For now, let's return DB templates if they exist, else fallback. 
        // Realistically we want to return a union if the IDs differ, but let's keep it simple.

        // If DB has fewer than constants, might represent partial scan. 
        // Let's overlay DB data onto AD_LIBRARY.
        const enrichedLibrary = AD_LIBRARY.map(localTmpl => {
            const remote = dbTemplates.find((t: any) => t.id === localTmpl.id);
            return remote ? { ...localTmpl, ...remote } : localTmpl;
        });

        return enrichedLibrary;

    } catch (e) {
        console.error("Error in getEnrichedTemplates", e);
        return AD_LIBRARY;
    }
};

// 2. Scan & Enrich Single Template
export const enrichTemplate = async (
    settings: SettingsState,
    template: AdTemplate,
    analyzeFn: (s: SettingsState, img: string) => Promise<Partial<AdTemplate>>
): Promise<AdTemplate> => {
    // 1. Analyze
    const analysis = await analyzeFn(settings, template.imageUrl);

    // 2. Merge
    const enriched: AdTemplate = {
        ...template,
        ...analysis,
        // Ensure defaults if analysis missed them
        tags: analysis.tags || template.tags,
        category: (analysis.category as UseCaseCategory) || template.category || UseCaseCategory.OTHER,
        platformOrigin: 'meta' // We know these are Meta
    };

    // 3. Save to DB
    if (supabase) {
        const row: TemplateMetadata = {
            id: enriched.id,
            name: enriched.name,
            description: enriched.description,
            visual_analysis: enriched.visual_analysis || "",
            tags: enriched.tags,
            category: enriched.category as UseCaseCategory,
            platform_origin: enriched.platformOrigin as Platform,
            image_url: enriched.imageUrl
        };

        const { error } = await supabase
            .from('template_metadata')
            .upsert(row);

        if (error) throw new Error(`Supabase Upsert Error: ${error.message}`);
    }

    return enriched;
};

// 3. Batch Scan (Async Iterator)
export async function* scanLibraryIterator(
    settings: SettingsState,
    templates: AdTemplate[],
    analyzeFn: (s: SettingsState, img: string) => Promise<Partial<AdTemplate>>
) {
    for (const tmpl of templates) {
        try {
            const result = await enrichTemplate(settings, tmpl, analyzeFn);
            yield { status: 'success', template: result };
        } catch (e: any) {
            yield { status: 'error', id: tmpl.id, error: e.message };
        }
    }
}
