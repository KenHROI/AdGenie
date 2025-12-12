import { GoogleGenerativeAI } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel, SettingsState } from "../types";
import { AD_LIBRARY } from "../constants";

// OpenRouter Interface (Compatible with OpenAI)
interface OpenRouterResponse {
    choices: Array<{
        message: { content: string };
    }>;
}

interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
}

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

export const fetchOpenRouterModels = async (apiKey: string): Promise<Array<{ id: string, name: string }>> => {
    try {
        const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "HTTP-Referer": window.location.origin,
                "X-Title": "AdGenie"
            }
        });

        if (!response.ok) throw new Error("Failed to fetch models");

        const json = await response.json() as OpenRouterModelsResponse;

        return json.data.map(m => ({
            id: m.id,
            name: m.name || m.id
        })).sort((a, b) => a.name.localeCompare(b.name));

    } catch (e) {
        console.error("Failed to fetch OpenRouter models", e);
        return [];
    }
};

const callOpenRouter = async (apiKey: string, model: string, prompt: string, image?: string) => {
    const body: any = {
        model: model || 'openai/gpt-4o', // Default if not specified
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    ...(image ? [{ type: "image_url", image_url: { url: image } }] : [])
                ]
            }
        ]
    };

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin, // OpenRouter Requirement
            "X-Title": "AdGenie"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`OpenRouter Error: ${response.statusText} - ${errorDetails}`);
    }

    const data = await response.json() as OpenRouterResponse;
    return data.choices[0]?.message?.content || "";
};

// --- Service Functions receiving Settings ---

export const analyzeAdCopyForStyles = async (
    settings: SettingsState,
    adCopy: string,
    availableTemplates: AdTemplate[] = AD_LIBRARY
): Promise<string[]> => {
    if (!adCopy || adCopy.length < 5) return [];

    const serviceConfig = settings.services.analysis;
    const templatesToAnalyze = availableTemplates.slice(0, 50);

    const templatesDescription = templatesToAnalyze.map(
        (t) => `ID: ${t.id}, Name: ${t.name}, Desc: ${t.description || 'No description'}, Tags: ${t.tags.join(", ")}`
    ).join("\n");

    const prompt = `
    Analyze the following ad copy/script: "${adCopy}"
    
    Based on the tone, content, and likely audience, select exactly 3 Template IDs from the list below that would result in the highest converting image ad.
    
    Templates:
    ${templatesDescription}
    
    Return the 3 IDs in a JSON array (e.g. ["id1", "id2", "id3"]). Do not add markdown formatting.
  `;

    try {
        let jsonStr = "[]";

        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            if (!apiKey) throw new Error("Google API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: GeminiModel.ANALYSIS,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent(prompt);
            jsonStr = result.response.text();

        } else if (serviceConfig.provider === 'openRouter') {
            const apiKey = settings.apiKeys.openRouter;
            if (!apiKey) throw new Error("OpenRouter API Key missing");

            jsonStr = await callOpenRouter(apiKey, serviceConfig.modelId || 'openai/gpt-4o', prompt);
        }

        // Clean Markdown if present
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

        const selectedIds = JSON.parse(jsonStr) as string[];
        const validIds = selectedIds.filter(id => templatesToAnalyze.some(t => t.id === id));

        return (validIds.length > 0) ? validIds : templatesToAnalyze.slice(0, 3).map(t => t.id);

    } catch (error: any) {
        console.error("Error analyzing copy:", error);
        return templatesToAnalyze.slice(0, 3).map(t => t.id);
    }
};

export const describeImageStyle = async (settings: SettingsState, base64Image: string): Promise<Partial<AdTemplate>> => {
    const serviceConfig = settings.services.vision;

    let cleanBase64 = base64Image;
    let mimeType = "image/jpeg";
    if (base64Image.includes('base64,')) {
        const parts = base64Image.split(';');
        mimeType = parts[0].split(':')[1];
        cleanBase64 = parts[1].split(',')[1];
    }
    const fullDataUrl = `data:${mimeType};base64,${cleanBase64}`; // For OpenRouter

    const prompt = `
    Analyze this image to be used as an advertisement template.
    Identify its layout structure, visual style, and key composition elements.
    
    Return a JSON object with:
    - name: A short, punchy 2-3 word name for this style.
    - description: A concise 1-sentence description of the layout.
    - tags: An array of 3-5 keywords.
    
    Return ONLY valid JSON.
  `;

    try {
        let jsonStr = "{}";

        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            if (!apiKey) throw new Error("Google API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: GeminiModel.ANALYSIS,
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent([
                prompt,
                { inlineData: { mimeType, data: cleanBase64 } }
            ]);
            jsonStr = result.response.text();

        } else if (serviceConfig.provider === 'openRouter') {
            const apiKey = settings.apiKeys.openRouter;
            if (!apiKey) throw new Error("OpenRouter API Key missing");

            jsonStr = await callOpenRouter(apiKey, serviceConfig.modelId || 'openai/gpt-4o', prompt, fullDataUrl);
        }

        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr) as Partial<AdTemplate>;

    } catch (error) {
        console.error("Error describing image:", error);
        return { name: "Custom Upload", description: "User uploaded template", tags: ["custom"] };
    }
};

export const generateAdVariation = async (
    settings: SettingsState,
    seedImageBase64: string,
    brand: BrandProfile,
    templateName: string
): Promise<string | null> => {
    const serviceConfig = settings.services.imageGeneration;

    const colors = brand.colors.length > 0 ? brand.colors.join(", ") : "brand appropriate colors";
    const voice = brand.brandVoice ? `Brand Voice: ${brand.brandVoice}.` : "";
    const typo = brand.typography ? `Typography Style: ${brand.typography}.` : "";

    const prompt = `
    Create a professional, high-resolution advertisement image based on the provided reference layout.
    Ad Copy: "${brand.adCopy}"
    ${voice}
    ${typo}
    Brand Colors: ${colors}.
    Style Direction: ${templateName}.
    The image should use the composition of the reference image but replace content to match the Ad Copy.
  `;

    try {
        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            if (!apiKey) throw new Error("Google API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                // Explicitly use the model requested by USER: gemini-3-pro-image-preview
                model: GeminiModel.IMAGE_GEN
            });

            // Clean base64 for Google
            let cleanBase64 = seedImageBase64;
            if (seedImageBase64.includes('base64,')) {
                cleanBase64 = seedImageBase64.split(',')[1];
            }

            const result = await model.generateContent([
                prompt,
                { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } } // Google Image gen (Imagen 3) supports image-to-image prompting
            ]);

            const response = await result.response;

            if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
            }
            return null;

        } else if (serviceConfig.provider === 'openRouter') {
            const apiKey = settings.apiKeys.openRouter;
            if (!apiKey) throw new Error("OpenRouter API Key missing");

            // Use the selected model from settings, or fall back to DALL-E 3
            const modelToUse = serviceConfig.modelId || 'openai/dall-e-3';

            // NOTE: Standard Chat Completions vs Image Generation
            // OpenRouter exposes many image models via the standard chat API with image outputs, OR via /v1/images/generations
            // However, consistent Image-to-Image via OpenRouter varies heavily by model.
            // For this implementation, we will attempt to use the Chat API and hope it returns an image URL or markdown image.

            const result = await callOpenRouter(apiKey, modelToUse, prompt);

            // Check for markdown image format ![...](url)
            const match = result.match(/\!\[.*?\]\((.*?)\)/);
            if (match && match[1]) {
                return match[1]; // URL
            }

            // If it's just a raw URL
            if (result.startsWith('http')) return result;

            console.warn("OpenRouter response did not contain a clear image URL:", result);
            return null;
        }

        return null;

    } catch (error: any) {
        console.error("Error generating image:", error);
        throw error;
    }
};
