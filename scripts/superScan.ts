
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { AD_LIBRARY } from '../constants';
import * as fs from 'fs';
import * as path from 'path';

// Load env
dotenv.config();

console.log("Loaded Keys:", Object.keys(process.env).filter(k => k.includes('VITE') || k.includes('SUPABASE') || k.includes('GOOGLE')));

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
const googleKey = process.env.VITE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase Env Vars. Ensure .env has SUPABASE_URL and SUPABASE_KEY");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = googleKey ? new GoogleGenerativeAI(googleKey) : null;

async function analyzeImage(imageUrl: string): Promise<any> {
    if (!genAI) return null;
    try {
        // Fetch image to buffer
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent([
            "Analyze this ad template. Return a JSON object with: { visual_analysis: string (detailed description), tags: string[], category: 'retail'|'service'|'digital'|'other' }",
            { inlineData: { data: base64, mimeType: 'image/jpeg' } }
        ]);
        const text = result.response.text();
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(clean);
    } catch (e: any) {
        console.error("Gemini Error (skipping analysis):", e.message);
        return null;
    }
}

async function main() {
    console.log(`Starting Restore & Scan for ${AD_LIBRARY.length} templates...`);
    if (!genAI) console.warn("⚠️  GOOGLE_API_KEY missing. Skipping AI enrichment, only restoring metadata.");

    let processed = 0;

    for (const tmpl of AD_LIBRARY) {
        console.log(`Processing ${tmpl.id} (${processed + 1}/${AD_LIBRARY.length})...`);

        let analysis = null;

        // 1. Try Analyze if we haven't already and have key
        if (genAI) {
            // Check if analysis exists to save cost/time? 
            // For now, let's just do it if we can
            try {
                // Short wait to avoid rate limit
                await new Promise(r => setTimeout(r, 1500));
                analysis = await analyzeImage(tmpl.imageUrl);
            } catch (e) {
                console.log("Analysis skipped");
            }
        }

        // 2. Prepare Data
        const tags = analysis?.tags?.length ? [...new Set([...tmpl.tags, ...analysis.tags])] : tmpl.tags;

        // A. Insert into template_metadata (Intelligence)
        const metaRow = {
            id: tmpl.id,
            name: tmpl.name,
            description: tmpl.description,
            visual_analysis: analysis?.visual_analysis || "",
            tags: tags,
            category: analysis?.category || 'other',
            platform_origin: 'meta',
            image_url: tmpl.imageUrl
        };
        const { error: metaError } = await supabase.from('template_metadata').upsert(metaRow);
        if (metaError) console.error(`Metadata Error [${tmpl.id}]:`, metaError.message);

        // B. Insert into image_library (Main Display)
        // This is crucial for fixing the "39 assets" issue if backend serves this
        const libraryRow = {
            // id: tmpl.id, // REMOVED: Let DB generate UUID
            // image_library likely has UUID PK. AD_LIBRARY has string IDs.
            // If image_library.id is uuid, this might fail if tmpl.id is not uuid.
            // Checking constants: id is like "default-1-1".
            // If image_library.id type is text, this is fine.
            // If image_library.id type is uuid, we must verify schema.
            // Assuming image_library.id is text or we let it auto-gen.
            // Actually server.js uses `image_library`.
            // Let's try upserting by name/url if possible, or just insert if not exists.

            // Wait, usually ID in AD_LIBRARY is local.
            // We should check if we can Upsert by name? 
            // Or just trust that we want these 145 items visible.

            name: tmpl.name,
            description: tmpl.description,
            tags: tags,
            image_url: tmpl.imageUrl
        };

        // Note: image_library table schema verification needed. 
        // Based on server.js: name, description, tags, image_url.
        // We will try to insert if not present (to avoid duplicates).
        // But checking duplication by 'image_url' is best.

        const { data: existingLib } = await supabase.from('image_library').select('id').eq('image_url', tmpl.imageUrl).single();

        if (!existingLib) {
            const { error: libError } = await supabase.from('image_library').insert(libraryRow);
            if (libError) console.error(`Library Insert Error [${tmpl.id}]:`, libError.message);
            else console.log(`Restored to Library: ${tmpl.name}`);
        } else {
            console.log(`Already in Library: ${tmpl.name}`);
        }

        processed++;
    }
    console.log("Done.");
}

main();
