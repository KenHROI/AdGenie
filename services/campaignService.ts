import { supabase } from './supabaseClient';
import { BrandProfile, GeneratedImage, Campaign, CampaignImage } from '../types';

const BUCKET_NAME = 'ad-genie-assets'; // Make sure this matches your environment

// Image Compression Helper
const compressImage = async (base64: string, quality = 0.8): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context failed"));
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error("Compression failed"));
            }, 'image/jpeg', quality);
        };
        img.onerror = (err) => reject(err);
    });
};

export const saveCampaign = async (
    name: string,
    brandData: BrandProfile,
    images: GeneratedImage[]
): Promise<string> => {
    if (!supabase) throw new Error("Supabase not initialized");

    // 1. Create Campaign
    const { data: campaign, error: campError } = await supabase
        .from('campaigns')
        .insert({
            name,
            brand_data: brandData,
            updated_at: new Date().toISOString()
        })
        .select()
        .single();

    if (campError || !campaign) throw new Error(campError?.message || "Failed to create campaign");
    const campaignId = campaign.id;

    // 2. Upload Images & Create Records
    const uploadPromises = images.filter(img => img.status === 'success' && img.base64).map(async (img) => {
        try {
            // Compress
            const blob = await compressImage(img.base64);
            const path = `campaigns/${campaignId}/${img.id}.jpg`;

            // Upload
            const { error: uploadError } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(path, blob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            // Insert Record
            const { error: dbError } = await supabase
                .from('campaign_images')
                .insert({
                    campaign_id: campaignId,
                    storage_path: path,
                    prompt_used: img.promptUsed,
                    reference_url: img.referenceUrl,
                    seed_template_id: img.seedTemplateId,
                    metadata: { original_id: img.id }
                });

            if (dbError) throw dbError;

        } catch (e) {
            console.error(`Failed to save image ${img.id}`, e);
            // Non-fatal, just log
        }
    });

    await Promise.all(uploadPromises);
    return campaignId;
};

export const loadCampaigns = async (): Promise<Campaign[]> => {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Failed to load campaigns", error);
        return [];
    }

    // Map DB to Type
    return data.map((d: any) => ({
        id: d.id,
        name: d.name,
        brandData: d.brand_data,
        createdAt: d.created_at,
        updatedAt: d.updated_at
    }));
};

export const loadCampaign = async (id: string): Promise<Campaign | null> => {
    if (!supabase) return null;

    // Fetch Campaign
    const { data: campaign, error: campError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();

    if (campError || !campaign) return null;

    // Fetch Images
    const { data: images, error: imgError } = await supabase
        .from('campaign_images')
        .select('*')
        .eq('campaign_id', id);

    if (imgError) console.error("Failed to load images", imgError);

    // Get Public URLs
    const mappedImages: CampaignImage[] = (images || []).map((img: any) => {
        const { data } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(img.storage_path);

        return {
            id: img.id,
            campaignId: img.campaign_id,
            storagePath: img.storage_path,
            promptUsed: img.prompt_used,
            referenceUrl: img.reference_url,
            seedTemplateId: img.seed_template_id,
            metadata: img.metadata,
            createdAt: img.created_at,
            publicUrl: data.publicUrl
        };
    });

    return {
        id: campaign.id,
        name: campaign.name,
        brandData: campaign.brand_data,
        createdAt: campaign.created_at,
        updatedAt: campaign.updated_at,
        images: mappedImages
    };
};
