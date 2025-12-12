import { GoogleGenerativeAI } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel, SettingsState } from "../types";
import { AD_LIBRARY } from "../constants";

// OpenRouter Interface (Compatible with OpenAI)
interface OpenRouterResponse {
    choices: Array<{
        message: { content: string };
    }>;
}

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

            // OpenRouter doesn't strictly enforce JSON mode for all models, so we prompt carefully
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
            const model = genAI.getGenerativeModel({ model: GeminiModel.IMAGE_GEN });

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
            // Check for base64 response (standard for Gemini Image Gen API via Vertex/Studio)
            // Note: The public Gemini API for Imagen might differ slightly in response structure or return links.
            // Assuming current implementation returns inlineData based on previous file.

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

            // OpenRouter Image Gen (e.g. Flux, DALL-E 3) usually returns a URL.
            // Implementing text-to-image is standard, but image-to-image varies by model.
            // For simplicity, we'll try a text-to-image call with detailed description of the reference.

            // This is a placeholder for OpenRouter Image Gen as it requires a different endpoint usually (/v1/images/generations)
            // or specifically supported models on chat/completions.
            // Use generic error for now if they pick OpenRouter for Image Gen
            throw new Error("OpenRouter Image Generation is not fully implemented yet.");
        }

        return null;

    } catch (error: any) {
        console.error("Error generating image:", error);
        throw error;
    }
};
