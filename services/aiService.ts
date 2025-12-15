import { GoogleGenerativeAI } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel, SettingsState, TextZone } from "../types";
import { AD_LIBRARY, KIE_IMAGE_MODELS } from "../constants";

// Kie.ai Helper
const resolveKieEndpoint = (modelId: string): string => {
    const known = KIE_IMAGE_MODELS.find(m => m.id === modelId);
    return known?.endpoint || '/api/v1/image/generate'; // Default fallback
};

const extractJSON = (str: string): string => {
    let clean = str.replace(/```json/g, '').replace(/```/g, '').trim();
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) return arrayMatch[0];
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (objectMatch) return objectMatch[0];
    return clean;
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

export const fetchKieModels = async (apiKey: string): Promise<Array<{ id: string; name: string; category?: 'image' | 'video' | 'audio' | 'text' }>> => {
    try {
        const response = await fetch("https://api.kie.ai/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` }
        });

        if (!response.ok) throw new Error("Failed to fetch Kie models");

        const json = await response.json();
        // Assume standard OpenAI-like list format: { data: [{ id: "...", ... }] }
        if (!json.data || !Array.isArray(json.data)) return [];

        return json.data.map((m: any) => ({
            id: m.id,
            name: m.id, // Kie often uses ID as name, or check if 'owned_by' or 'object' gives clues
            category: guessKieCategory(m.id)
        })).sort((a: any, b: any) => a.name.localeCompare(b.name));

    } catch (e) {
        console.error("Failed to fetch Kie models", e);
        return [];
    }
};

const guessKieCategory = (id: string): 'image' | 'video' | 'audio' | 'text' => {
    if (id.includes('banana') || id.includes('midjourney') || id.includes('flux') || id.includes('image') || id.includes('vision') || id.includes('dall')) return 'image';
    if (id.includes('veo') || id.includes('runway') || id.includes('kling') || id.includes('video') || id.includes('luma')) return 'video';
    if (id.includes('suno') || id.includes('audio') || id.includes('music')) return 'audio';
    return 'text';
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

// Imported dynamically to avoid circular dependency if possible, or pass in.
// But we need getEnrichedTemplates. 
// Ideally passed as argument, but for now let's modify signature or fetch inside.





// Debug Helper
function logToScreen(msg: string) {
    try {
        let el = document.getElementById('debug-console');
        if (!el) {
            el = document.createElement('div');
            el.id = 'debug-console';
            el.style.position = 'fixed';
            el.style.top = '0';
            el.style.right = '0';
            el.style.zIndex = '9999';
            el.style.background = 'rgba(255, 255, 255, 0.9)';
            el.style.color = 'red';
            el.style.border = '2px solid black';
            el.style.padding = '10px';
            el.style.maxWidth = '400px';
            el.style.maxHeight = '100vh';
            el.style.overflow = 'auto';
            el.style.fontSize = '12px';
            document.body.appendChild(el);
        }
        el.innerText += msg + '\n----------------\n';
    } catch (e) { console.error(e); }
}

export const analyzeAdCopyForStyles = async (
    settings: SettingsState,
    adCopy: string,
    templatesToAnalyze: AdTemplate[]
): Promise<string[]> => {
    // 1. Prepare Templates Context
    const templateContext = templatesToAnalyze.map(t =>
        `- ID: "${t.id}"\n  Tags: ${t.tags.join(', ')}`
    ).join('\n\n');

    const selectionPrompt = `
    Analyze the following Ad Copy: "${adCopy}"

    Select the best 3 templates from the list below that match the vibe (e.g. corporate vs playful, minimal vs busy).
    
    Templates:
    ${templateContext}

    Return ONLY a JSON Array of strings with the 3 selected IDs.
    Example: ["id1", "id2", "id3"]
    `;

    try {
        logToScreen("Starting Analysis...");
        const serviceConfig = settings.services.analysis;
        let jsonStr = "[]";

        if (serviceConfig.provider === 'google') {
            try {
                const apiKey = settings.apiKeys.google;
                logToScreen("Using Google. Key exists? " + !!apiKey);
                const genAI = new GoogleGenerativeAI(apiKey!);
                const modelId = serviceConfig.modelId || GeminiModel.ANALYSIS;
                logToScreen(`Using Model: ${modelId}`);

                const model = genAI.getGenerativeModel({
                    model: modelId,
                    generationConfig: { responseMimeType: "application/json" }
                });

                const result = await model.generateContent(selectionPrompt);
                jsonStr = result.response.text();
            } catch (googleError: any) {
                logToScreen(`Google API Error: ${googleError.message}`);

                // Fallback to OpenRouter if available
                if (settings.apiKeys.openRouter) {
                    logToScreen("Falling back to OpenRouter (google/gemini-2.0-flash-exp:free)...");
                    jsonStr = await callOpenRouter(settings.apiKeys.openRouter, 'google/gemini-2.0-flash-exp:free', selectionPrompt);
                } else {
                    throw googleError;
                }
            }

        } else if (serviceConfig.provider === 'kie') {
            logToScreen("Using Kie");
            const apiKey = settings.apiKeys.kie;
            jsonStr = await callKieChat(apiKey, serviceConfig.modelId || 'gpt-4o', selectionPrompt);
        } else if (serviceConfig.provider === 'openRouter') {
            logToScreen("Using OpenRouter");
            const apiKey = settings.apiKeys.openRouter;
            jsonStr = await callOpenRouter(apiKey, serviceConfig.modelId || 'openai/gpt-4o', selectionPrompt);
        }

        // Clean Markdown if present and robustly extract JSON
        jsonStr = extractJSON(jsonStr);
        logToScreen("Raw Response: " + jsonStr.substring(0, 100) + "...");

        const selectedIds = JSON.parse(jsonStr) as string[];
        logToScreen("Parsed IDs: " + JSON.stringify(selectedIds));

        const validIds = selectedIds.filter(id => templatesToAnalyze!.some(t => t.id === id));
        logToScreen("Valid IDs: " + JSON.stringify(validIds));


        if (validIds.length > 0) return validIds;

        logToScreen("Fallback Triggered (No valid IDs)");
        return templatesToAnalyze.slice(0, 3).map(t => t.id);

    } catch (error: any) {
        console.error("Error analyzing copy:", error);
        logToScreen("ERROR: " + error.message);
        if (error.response) {
            const txt = await error.response.text().catch(() => "No text");
            logToScreen("API Error Body: " + txt);
        }
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
    - description: A detailed strategic description of the layout and why it works effectively for conversion. Focus on text placement, color psychology, and use of space.
    - visual_analysis: A deep dive into the lighting, color palette (with hex codes if possible), typography style, and texture.
    - tags: An array of 5-8 descriptive keywords including specific design terms. DO NOT use generic tags like "custom", "template", or "default". Use terms like "Swiss Style", "Pastel", "Geometric", "High Contrast".
    - category: One of "Ecommerce", "Lead Gen", "App Install", "Brand Awareness", "Other".

    Return ONLY valid JSON.
  `;

    try {
        let jsonStr = "{}";

        if (serviceConfig.provider === 'google') {
            const apiKey = settings.apiKeys.google;
            if (!apiKey) throw new Error("Google API Key missing");

            const genAI = new GoogleGenerativeAI(apiKey);
            // Use selected model ID or fallback to 2.5 Pro (recommended for Vision)
            const modelId = serviceConfig.modelId || 'gemini-2.5-pro';

            const model = genAI.getGenerativeModel({
                model: modelId,
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

        // Clean Markdown if present
        const parsed: Partial<AdTemplate> = JSON.parse(extractJSON(jsonStr));
        return parsed;

    } catch (error) {
        console.error("Error describing image:", error);
        // CRITICAL: Re-throw error so UI can show it to the user
        throw error;
    }
};
// ------------------------------------------------------------------
// 4. Strict Layout Analysis (Vision)
// ------------------------------------------------------------------
export const analyzeLayoutConstraints = async (
    settings: SettingsState,
    base64Image: string
): Promise<TextZone[]> => {
    try {
        const apiKey = settings.apiKeys.google;
        if (!apiKey) throw new Error("Google API Key missing for Vision Analysis");

        // Use the configured Vision model (or fallback to flash 2.5)
        const modelId = settings.services.vision.modelId || 'gemini-2.5-flash';
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: { responseMimeType: "application/json" }
        });

        const prompt = `
        Recall the following rules:
        1. Identify EVERY text element designated for the user to edit.
        2. Identify "Static" UI elements (e.g. "AirDrop", "Decline", "Accept", fake headers/buttons) that MUST NOT change to preserve the mimicry effect.
        3. Ignore logo text or background patterns unless they look like editable copy.
        
        For each element, define a "Zone".
        
        Return a JSON LIST of objects with this schema:
        {
            "id": "string", // unique id (e.g. "visual_headline", "cta_button", "static_ui_header")
            "type": "headline" | "cta" | "body" | "caption",
            "description": "string", // location and style description
            "maxChars": number, // estimate the MAXIMUM characters that fit this visual space. BE CONSERVATIVE.
            "maxLines": number, // 1 for single line, 2+ for multi-line
            "contrastColor": "white" | "black", // best text color for this background
            "isStatic": boolean // TRUE if this is a fake UI element (like "AirDrop", "Decline") that should NOT be edited.
        }
        `;

        const imagePart = {
            inlineData: {
                data: base64Image.split(',')[1] || base64Image,
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();
        console.log("Layout Analysis Raw:", responseText);

        const zones = JSON.parse(extractJSON(responseText)) as TextZone[];
        return zones;

    } catch (e) {
        console.error("Layout Constraint Analysis Failed:", e);
        // Fallback: Return empty zones implies "no constraints detected"
        return [];
    }
};

// ------------------------------------------------------------------
// 5. Fitted Copy Generation (Text)
// ------------------------------------------------------------------
export const generateFittedCopy = async (
    settings: SettingsState,
    brandData: BrandProfile,
    zones: TextZone[]
): Promise<Record<string, string>> => {
    if (!zones || zones.length === 0) return {};

    try {
        const zonesPrompt = zones.map(z => {
            const staticNote = z.isStatic ? " [STATIC UI ELEMENT - DO NOT CHANGE TEXT]" : "";
            return `- ID: "${z.id}" (${z.type}): Max ${z.maxChars} chars, ${z.maxLines} lines. Desc: ${z.description}${staticNote}`;
        }).join('\n');

        const prompt = `
        You are a Specialized Copywriter for Ad Banners.
        Your goal is to write copy that STRICTLY fits into specific visual zones.
        
        Brand Context:
        - Product/Service: ${brandData.adCopy}
        - Voice: ${brandData.brandVoice}
        
        Constraints (YOU MUST OBEY MAX CHARS):
        ${zonesPrompt}
        
        INSTRUCTIONS:
        1. If a zone is marked [STATIC UI ELEMENT], you MUST return the text EXACTLY as implied by the description or standard UI (e.g. "AirDrop", "Decline", "Accept"). DO NOT REWRITE IT.
        2. For other zones, rewrite the brand copy to fit the character limits.
        
        Return a JSON object where keys are the Zone IDs and values are the written copy.
        Example: { "headline_1": "Sale Now On", "cta_btn": "Shop", "static_1": "AirDrop" }
        `;

        let jsonStr = "{}";
        const serviceConfig = settings.services.analysis;

        // Prioritize Google for complex instruction following if available
        if (settings.apiKeys.google) {
            const genAI = new GoogleGenerativeAI(settings.apiKeys.google);
            const modelId = serviceConfig.provider === 'google' ? (serviceConfig.modelId || 'gemini-2.5-flash') : 'gemini-2.5-flash';
            const model = genAI.getGenerativeModel({ model: modelId, generationConfig: { responseMimeType: "application/json" } });

            const result = await model.generateContent(prompt);
            jsonStr = result.response.text();

        } else if (settings.apiKeys.openRouter) {
            jsonStr = await callOpenRouter(settings.apiKeys.openRouter, serviceConfig.provider === 'openRouter' ? serviceConfig.modelId || 'openai/gpt-4o' : 'openai/gpt-4o', prompt);
        } else if (settings.apiKeys.kie) {
            jsonStr = await callKieChat(settings.apiKeys.kie, serviceConfig.provider === 'kie' ? serviceConfig.modelId || 'gpt-4o' : 'gpt-4o', prompt);
        } else {
            throw new Error("No API Key available for Copy Fitting");
        }

        // Clean JSON
        jsonStr = extractJSON(jsonStr);
        console.log("Fitted Copy Result:", jsonStr);

        return JSON.parse(jsonStr);

    } catch (error) {
        console.error("Copy Fitting Failed:", error);
        return {};
    }
};
export const generateAdVariation = async (
    settings: SettingsState,
    seedImageBase64: string,
    brand: BrandProfile,
    templateName: string,
    customPrompt?: string,
    fittedComponents?: Record<string, string>
): Promise<{ image: string | null; prompt: string }> => {
    const serviceConfig = settings.services.imageGeneration;

    const colors = brand.colors.length > 0 ? brand.colors.join(", ") : "brand appropriate colors";
    const voice = brand.brandVoice ? `Brand Voice: ${brand.brandVoice}.` : "";
    const typo = brand.typography ? `Typography Style: ${brand.typography}.` : "";

    // If we have fitted components, we use a much more specific layout prompt
    let copyInstructions = "";
    if (fittedComponents && Object.keys(fittedComponents).length > 0) {
        // Dynamic map of constraints
        const instructions = Object.entries(fittedComponents)
            .map(([zoneId, text]) => `- ${zoneId}: "${text}"`)
            .join('\n');

        copyInstructions = `
        STRICT LAYOUT INSTRUCTIONS:
        ${instructions}
        
        DO NOT ADD ANY OTHER TEXT.TEXT MUST NOT OVERFLOW.
        `;
    } else {
        copyInstructions = `Ad Copy: "${brand.adCopy.slice(0, 300)}"`;
    }

    const platform = brand.targetPlatform || 'meta';

    let platformRules = "";
    if (platform === 'meta') {
        platformRules = `
        PLATFORM RULES(META / INSTAGRAM):
    - DO NOT add "Click Here" buttons or fake UI elements.The platform adds these.
        - Keep text minimal(<20% of image area).
        - Focus on visual storytelling and emotional hooks.
        - Use a lifestyle / UGC aesthetic if appropriate.
        `;
    } else if (platform === 'google') {
        platformRules = `
        PLATFORM RULES(GOOGLE DISPLAY NETWORK):
    - CRITICAL: You MUST include a clear, high - contrast CTA button(e.g., "Learn More", "Shop Now") in the bottom - right or relevant area.
        - Ensure the Value Proposition is readable and prominent.
        - Include the logo clearly(top - left preferred).
        - Design must look clickable and actionable.
        `;
    } else if (platform === 'linkedin') {
        platformRules = `
        PLATFORM RULES(LINKEDIN):
    - Use professional, corporate imagery(high - quality stock or office vibes).
        - Clean, modern typography(Sans Serif).
        - Include data visualization or stats if the copy mentions numbers.
        - NO fake buttons(platform handles CTA).
        `;
    } else if (platform === 'native') {
        platformRules = `
        PLATFORM RULES(NATIVE ADS):
    - Make it look like editorial content, not an ad.
        - No text overlays or logos on the image itself.
        - Use candid, realistic photography.
        `;
    }

    const prompt = `
    Create a professional, high - resolution advertisement image based on the provided reference layout.
        ${copyInstructions}
    ${voice}
    ${typo}
    Brand Colors: ${colors}.
    Style Direction: ${templateName}.
    Target Platform: ${platform.toUpperCase()}.

    ${platformRules}

    CRITICAL:
    1. PRESERVE THE LAYOUT OF THE REFERENCE IMAGE EXACTLY(unless platform rules require adding a button).
    2. REPLACE TEXT WITH THE PROVIDED STRINGS.
    3. DO NOT CHANGE THE POSITION OF ELEMENTS(unless adapting for Google CTA).
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
                        return { image: `data:${part.inlineData.mimeType}; base64, ${part.inlineData.data} `, prompt };
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
