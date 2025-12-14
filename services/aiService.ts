import { GoogleGenerativeAI } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel, SettingsState } from "../types";
import { AD_LIBRARY, KIE_IMAGE_MODELS } from "../constants";

// Kie.ai Helper
const resolveKieEndpoint = (modelId: string): string => {
    const known = KIE_IMAGE_MODELS.find(m => m.id === modelId);
    return known?.endpoint || '/api/v1/image/generate'; // Default fallback
};

// OpenRouter Interfaces
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
    architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
    };
}

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}


export const fetchOpenRouterModels = async (apiKey: string): Promise<Array<{
    id: string;
    name: string;
    capabilities: { isVision?: boolean; isImageGen?: boolean; };
}>> => {
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

        return json.data.map(m => {
            const caps = { isVision: false, isImageGen: false };

            // Capability detection logic based on API Response
            if (m.architecture) {
                // Vision: accepts image input
                if (m.architecture.input_modalities?.includes('image') || m.architecture.modality?.includes('+image->')) {
                    caps.isVision = true;
                }
                // Image Gen: produces image output
                if (m.architecture.output_modalities?.includes('image') || m.architecture.modality?.includes('->image')) {
                    caps.isImageGen = true;
                }
            }

            // Fallback for known models if architecture is missing
            if (m.id.includes('vision') || m.id.includes('4o')) caps.isVision = true;
            if (m.id.includes('dall-e') || m.id.includes('flux') || m.id.includes('midjourney')) caps.isImageGen = true;

            return {
                id: m.id,
                name: m.name || m.id,
                capabilities: caps
            };
        }).sort((a, b) => a.name.localeCompare(b.name));

    } catch (e) {
        console.error("Failed to fetch OpenRouter models", e);
        return [];
    }
};

const callOpenRouter = async (apiKey: string, model: string, prompt: string, image?: string) => {
    const body: any = {
        model: model || 'openai/gpt-4o',
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

const callKieChat = async (apiKey: string, model: string, prompt: string, image?: string) => {
    const body: any = {
        model: model || 'gpt-4o', // Default text model
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

    // Kie.ai Chat/Text Endpoint (Assumed OpenAI compatible)
    const response = await fetch("https://api.kie.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errorDetails = await response.text();
        throw new Error(`Kie.ai Error: ${response.statusText} - ${errorDetails}`);
    }

    const data = await response.json() as any;
    return data.choices[0]?.message?.content || "";
};

const callKieImageGen = async (apiKey: string, model: string, prompt: string, image?: string, size: string = "1024x1024"): Promise<string | null> => {
    const endpointPath = resolveKieEndpoint(model);
    const url = `https://api.kie.ai${endpointPath}`;

    // Construct payload based on endpoint type (Simplified assumption: Unified Format or Specifics)
    // Kie Docs imply specific endpoints, likely taking 'prompt', 'model', etc.
    const body: any = {
        model: model,
        prompt: prompt,
        n: 1,
        size: size,
        response_format: "b64_json" // Prefer base64
    };

    // Flux specific check?
    if (model.includes('flux')) {
        // Flux often takes different params, but let's try standard first.
    }

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Kie.ai Image Gen Error (${model}): ${err}`);
    }

    const data = await response.json();

    // Handle Response Variations
    if (data.data && data.data[0] && data.data[0].b64_json) {
        return `data:image/jpeg;base64,${data.data[0].b64_json}`;
    }
    if (data.data && data.data[0] && data.data[0].url) {
        return data.data[0].url;
    }

    // Fallback?
    return null;
};

export const extractAdComponents = async (settings: SettingsState, adCopy: string): Promise<{
    headline: string;
    subheadline: string;
    cta: string;
    tone_keywords: string[];
}> => {
    const serviceConfig = settings.services.analysis;
    const prompt = `
    You are an expert Copywriter and Creative Director.
    Analyze the following Ad Copy and extract the core components for a display ad.
    
    Ad Copy: "${adCopy}"
    
    Return a JSON object with:
    - headline: A punchy, attention-grabbing headline (max 8 words).
    - subheadline: A supporting value proposition (max 12 words).
    - cta: A strong Call to Action (2-4 words).
    - tone_keywords: 3 keywords describing the emotional hook.
    
    If the text is missing, infer the best professional options.
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

            const result = await model.generateContent(prompt);
            jsonStr = result.response.text();

        } else if (serviceConfig.provider === 'kie') {
            const apiKey = settings.apiKeys.kie;
            jsonStr = await callKieChat(apiKey, serviceConfig.modelId || 'gpt-4o', prompt);
        } else if (serviceConfig.provider === 'openRouter') {
            const apiKey = settings.apiKeys.openRouter;
            jsonStr = await callOpenRouter(apiKey, serviceConfig.modelId || 'openai/gpt-4o', prompt);
        }

        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Design Director extraction failed:", error);
        return {
            headline: "Special Offer",
            subheadline: "Check out our latest deals today.",
            cta: "Learn More",
            tone_keywords: ["Professional"]
        };
    }
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

        } else if (serviceConfig.provider === 'kie') {
            const apiKey = settings.apiKeys.kie;
            if (!apiKey) throw new Error("Kie.ai API Key missing");

            jsonStr = await callKieChat(apiKey, serviceConfig.modelId || 'gpt-4o', prompt);
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
    Act as a world-class Creative Director archiving high-converting assets for a multi-million dollar swipe file. Analyze the attached image with extreme attention to detail, focusing on psychological hooks, visual hierarchy, and aesthetic nuance.

    Identify its layout structure, visual style, and key composition elements.

    Return a JSON object with:
    - name: A short, punchy 2-3 word name for this style (e.g., "Minimalist Hero", "Chaos Maximalism").
    - description: A detailed strategic description of the layout and why it works effectively for conversion.
    - visual_analysis: A deep dive into the lighting, color palette (with hex codes if possible), typography style, and texture.
    - tags: An array of 5-8 descriptive keywords including specific design terms.
    - category: One of "Ecommerce", "Lead Gen", "App Install", "Brand Awareness", "Other".

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

        } else if (serviceConfig.provider === 'kie') {
            const apiKey = settings.apiKeys.kie;
            if (!apiKey) throw new Error("Kie.ai API Key missing");

            jsonStr = await callKieChat(apiKey, serviceConfig.modelId || 'gpt-4o', prompt, fullDataUrl);
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
// --- New Layout Analysis & Copy Fitting Functions ---

export interface LayoutConstraints {
    headline: { maxChars: number; location: string };
    subheadline: { maxChars: number; location: string };
    cta: { maxChars: number; location: string };
    body: { maxChars: number; location: string };
}

export const analyzeLayoutConstraints = async (settings: SettingsState, base64Image: string): Promise<LayoutConstraints> => {
    const serviceConfig = settings.services.vision;
    let cleanBase64 = base64Image;
    if (base64Image.includes('base64,')) {
        cleanBase64 = base64Image.split(',')[1];
    }
    const fullDataUrl = base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${cleanBase64}`;

    const prompt = `
        You are a Technical Design Director. Analyze this image template to determine strict text constraints.
        Identify where text appears (Headline, Subheadline, CTA Button, Body Text).
        
        For each area, estimate the MAXIMUM number of characters that can fit without breaking the layout or overlapping elements.
        Also briefly describe the location (e.g., "Top center", "Bottom right button").
        
        Return JSON format:
        {
          "headline": { "maxChars": 30, "location": "..." },
          "subheadline": { "maxChars": 60, "location": "..." },
          "cta": { "maxChars": 15, "location": "..." },
          "body": { "maxChars": 200, "location": "..." }
        }
    `;

    try {
        let jsonStr = "{}";
        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: GeminiModel.ANALYSIS, generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent([prompt, { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }]);
            jsonStr = result.response.text();
        } else if (serviceConfig.provider === 'kie') {
            jsonStr = await callKieChat(settings.apiKeys.kie, serviceConfig.modelId || 'gpt-4o', prompt, fullDataUrl);
        } else if (serviceConfig.provider === 'openRouter') {
            jsonStr = await callOpenRouter(settings.apiKeys.openRouter, serviceConfig.modelId || 'openai/gpt-4o', prompt, fullDataUrl);
        }

        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.warn("Layout analysis failed", e);
        return {
            headline: { maxChars: 40, location: "top" },
            subheadline: { maxChars: 100, location: "middle" },
            cta: { maxChars: 15, location: "bottom" },
            body: { maxChars: 200, location: "center" }
        };
    }
};

export const generateFittedCopy = async (
    settings: SettingsState,
    originalCopy: string,
    constraints: LayoutConstraints
): Promise<{ headline: string; subheadline: string; cta: string; body: string }> => {
    const serviceConfig = settings.services.analysis;

    const prompt = `
        You are a Senior Copywriter. Rewrite the following Ad Copy to STRICTLY fit the provided layout constraints.
        
        ORIGINAL COPY:
        "${originalCopy}"
        
        CONSTRAINTS:
        - Headline: Max ${constraints.headline.maxChars} chars. (Location: ${constraints.headline.location})
        - Subheadline: Max ${constraints.subheadline.maxChars} chars. (Location: ${constraints.subheadline.location})
        - CTA: Max ${constraints.cta.maxChars} chars. (Location: ${constraints.cta.location})
        - Body: Max ${constraints.body.maxChars} chars. (Location: ${constraints.body.location})
        
        INSTRUCTIONS:
        1. Keep the core message and emotional hook.
        2. Aggressively edit or summarize to fit the character limits.
        3. Do not assume the design can expand.
        
        Return JSON:
        { "headline": "...", "subheadline": "...", "cta": "...", "body": "..." }
    `;

    try {
        let jsonStr = "{}";
        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            const genAI = new GoogleGenerativeAI(apiKey!);
            const model = genAI.getGenerativeModel({ model: GeminiModel.ANALYSIS, generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(prompt);
            jsonStr = result.response.text();
        } else if (serviceConfig.provider === 'kie') {
            jsonStr = await callKieChat(settings.apiKeys.kie, serviceConfig.modelId || 'gpt-4o', prompt);
        } else if (serviceConfig.provider === 'openRouter') {
            jsonStr = await callOpenRouter(settings.apiKeys.openRouter, serviceConfig.modelId || 'openai/gpt-4o', prompt);
        }

        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
    } catch (e) {
        console.warn("Copy fitting failed", e);
        return {
            headline: "Special Offer",
            subheadline: "Don't miss out.",
            cta: "Click Here",
            body: originalCopy.slice(0, 100)
        };
    }
};
export const generateAdVariation = async (
    settings: SettingsState,
    seedImageBase64: string,
    brand: BrandProfile,
    templateName: string,
    customPrompt?: string,
    fittedComponents?: { headline: string; subheadline: string; cta: string; body: string }
): Promise<{ image: string | null; prompt: string }> => {
    const serviceConfig = settings.services.imageGeneration;

    const colors = brand.colors.length > 0 ? brand.colors.join(", ") : "brand appropriate colors";
    const voice = brand.brandVoice ? `Brand Voice: ${brand.brandVoice}.` : "";
    const typo = brand.typography ? `Typography Style: ${brand.typography}.` : "";

    // If we have fitted components, we use a much more specific layout prompt
    let copyInstructions = "";
    if (fittedComponents) {
        copyInstructions = `
        STRICT LAYOUT INSTRUCTIONS:
        - Headline: "${fittedComponents.headline}" (Must fit headline area)
        - Subhead: "${fittedComponents.subheadline}" (Must fit subhead area)
        - Body Text: "${fittedComponents.body}" (Must fit body area)
        - CTA Button: "${fittedComponents.cta}" (Must fit button)
        DO NOT ADD ANY OTHER TEXT. TEXT MUST NOT OVERFLOW.
        `;
    } else {
        copyInstructions = `Ad Copy: "${brand.adCopy.slice(0, 300)}"`;
    }

    const prompt = `
    Create a professional, high-resolution advertisement image based on the provided reference layout.
    ${copyInstructions}
    ${voice}
    ${typo}
    Brand Colors: ${colors}.
    Style Direction: ${templateName}.
    
    CRITICAL:
    1. PRESERVE THE LAYOUT OF THE REFERENCE IMAGE EXACTLY.
    2. REPLACE TEXT WITH THE PROVIDED STRINGS.
    3. DO NOT CHANGE THE POSITION OF ELEMENTS.
    4. ENSURE TEXT CONTRAST AND READABILITY.
  `;

    // Aspect Ratio Mapping
    const ratioMap = {
        '1:1': '1024x1024',
        '9:16': '1024x1792',
        '16:9': '1792x1024',
        '4:3': '1024x768'
    };
    const size = ratioMap[brand.aspectRatio || '1:1'];

    try {
        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            if (!apiKey) throw new Error("Google API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: GeminiModel.IMAGE_GEN
            });

            // Clean base64 for Google
            let cleanBase64 = seedImageBase64;
            if (seedImageBase64.includes('base64,')) {
                cleanBase64 = seedImageBase64.split(',')[1];
            }

            // Google Imagen 3 via Gemini API supports aspectRatio via generationConfig or prompt text
            const result = await model.generateContent([
                prompt + `\nEnsure Aspect Ratio is ${brand.aspectRatio || '1:1'}.`,
                { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
            ]);

            const response = await result.response;

            if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        return { image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`, prompt };
                    }
                }
            }
            return { image: null, prompt };

        } else if (serviceConfig.provider === 'kie') {
            const apiKey = settings.apiKeys.kie;
            if (!apiKey) throw new Error("Kie.ai API Key missing");

            const modelId = serviceConfig.modelId || 'seedream-3.0-text-to-image';

            // Pass size to Kie
            const image = await callKieImageGen(apiKey, modelId, prompt, undefined, size);
            return { image, prompt };

        } else if (serviceConfig.provider === 'openRouter') {
            const apiKey = settings.apiKeys.openRouter;
            if (!apiKey) throw new Error("OpenRouter API Key missing");

            // Use the selected model from settings, or fall back to DALL-E 3
            const modelToUse = serviceConfig.modelId || 'openai/dall-e-3';

            // NOTE: Standard Chat Completions vs Image Generation
            // OpenRouter handles specialized image params via model-specific routing often.
            // DALL-E 3 supports size.
            const result = await callOpenRouter(apiKey, modelToUse, prompt + `\nGenerate with Aspect Ratio ${size}.`);

            // Check for markdown image format ![...](url)
            const match = result.match(/\!\[.*?\]\((.*?)\)/);
            if (match && match[1]) {
                return { image: match[1], prompt };
            }

            // If it's just a raw URL
            if (result.startsWith('http')) return { image: result, prompt };

            console.warn("OpenRouter response did not contain a clear image URL:", result);
            return { image: null, prompt };
        }

        return { image: null, prompt };

    } catch (error: any) {
        console.error("Error generating image:", error);
        throw error;
    }
};
