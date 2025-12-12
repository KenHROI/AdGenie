/**
 * Script to upload default library images to Supabase storage
 * Run with: node scripts/upload-defaults.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET_NAME = process.env.SUPABASE_BUCKET;
const SOURCE_DIR = '/tmp/adgenie-default-library';

async function uploadDefaultLibrary() {
    const files = fs.readdirSync(SOURCE_DIR)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.startsWith('.'))
        .sort((a, b) => {
            // Sort numerically: 1.1.jpg, 1.2.jpg, 2.1.jpg, etc.
            const numA = parseFloat(a.split('.')[0] + '.' + (a.split('.')[1] || '0'));
            const numB = parseFloat(b.split('.')[0] + '.' + (b.split('.')[1] || '0'));
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });

    console.log(`Found ${files.length} images to upload`);

    const results = [];
    let success = 0;
    let failed = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(SOURCE_DIR, file);

        try {
            // Read and optimize the image
            const buffer = fs.readFileSync(filePath);
            const optimized = await sharp(buffer)
                .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 80, progressive: true })
                .toBuffer();

            // Generate a clean filename
            const baseName = path.basename(file, path.extname(file))
                .replace(/\s+/g, '-')
                .toLowerCase();
            const fileName = `default-${baseName}-${Date.now()}.jpg`;

            // Upload to Supabase
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, optimized, {
                    contentType: 'image/jpeg',
                    cacheControl: '31536000', // 1 year cache for defaults
                });

            if (error) {
                console.error(`[${i + 1}/${files.length}] Failed: ${file} - ${error.message}`);
                failed++;
                continue;
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

            // Parse a descriptive name from the filename
            const parts = file.split('.');
            const groupNum = parts[0];
            const variantNum = parts.length > 2 ? parts[1] : '1';

            results.push({
                id: `default-${groupNum}-${variantNum}`,
                name: `Template ${groupNum}.${variantNum}`,
                description: `Default library template`,
                imageUrl: publicUrl,
                tags: ['default', 'template']
            });

            success++;
            console.log(`[${i + 1}/${files.length}] Uploaded: ${file} -> ${fileName}`);

            // Small delay to prevent rate limiting
            await new Promise(r => setTimeout(r, 100));

        } catch (err) {
            console.error(`[${i + 1}/${files.length}] Error: ${file} - ${err.message}`);
            failed++;
        }
    }

    console.log(`\nDone! Success: ${success}, Failed: ${failed}`);

    // Write the results to a file for use in constants.ts
    const output = `// Auto-generated default library
// Generated on: ${new Date().toISOString()}
// Total templates: ${results.length}

export const AD_LIBRARY: AdTemplate[] = ${JSON.stringify(results, null, 2)};
`;

    fs.writeFileSync('/tmp/ad-library-output.ts', output);
    console.log('\nOutput written to /tmp/ad-library-output.ts');

    return results;
}

uploadDefaultLibrary().catch(console.error);
