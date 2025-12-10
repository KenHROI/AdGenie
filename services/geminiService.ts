
import { GoogleGenAI, Type } from "@google/genai";
import { BrandProfile, AdTemplate, GeminiModel } from "../types";
import { AD_LIBRARY } from "../constants";

const getAiClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Helper to sanitize JSON string from Markdown or extra text
const cleanJson = (text: string): string => {
  if (!text) return "{}";
  // Remove markdown code blocks
  let clean = text.replace(/```json/g, '').replace(/```/g, '');
  // Extract content between first { and last }
  const firstOpen = clean.indexOf('{');
  const lastClose = clean.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1) {
    clean = clean.substring(firstOpen, lastClose + 1);
  }
  return clean.trim();
};

export const analyzeAdCopyForStyles = async (
  adCopy: string,
  availableTemplates: AdTemplate[] = AD_LIBRARY
): Promise<string[]> => {
  if (!adCopy || adCopy.length < 5) return [];

  const ai = getAiClient();
  
  // Use the provided templates (either default or Drive)
  // Limit to 50 to prevent context overflow if Drive folder is huge
  const templatesToAnalyze = availableTemplates.slice(0, 50);

  const templatesDescription = templatesToAnalyze.map(
    (t) => `ID: ${t.id}, Name: ${t.name}, Desc: ${t.description || 'No description'}, Tags: ${t.tags.join(", ")}`
  ).join("\n");

  const prompt = `
    Analyze the following ad copy/script: "${adCopy}"
    
    Based on the tone, content, and likely audience, select exactly 3 Template IDs from the list below that would result in the highest converting image ad.
    
    Templates:
    ${templatesDescription}
    
    Return ONLY a raw JSON array of strings, e.g. ["id1", "id2"]. Do not include markdown or explanations.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GeminiModel.ANALYSIS,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    // The SDK sometimes auto-parses, but we access .text to be safe given the prompt instructions
    const jsonStr = cleanJson(response.text || "[]");
    let selectedIds: string[] = [];
    
    try {
        selectedIds = JSON.parse(jsonStr) as string[];
    } catch (e) {
        console.warn("Failed to parse analysis JSON:", jsonStr);
        // Fallback: try to find strings in the text
        const matches = jsonStr.match(/"([^"]+)"/g);
        if (matches) {
            selectedIds = matches.map(s => s.replace(/"/g, ''));
        }
    }
    
    // Validate IDs exist
    const validIds = selectedIds.filter(id => templatesToAnalyze.some(t => t.id === id));
    
    // Fallback if AI returns garbage or no matches
    if (validIds.length === 0 && templatesToAnalyze.length > 0) {
        return templatesToAnalyze.slice(0, 3).map(t => t.id);
    }
    
    return validIds;
  } catch (error: any) {
    console.error("Error analyzing copy:", error);
    // Graceful fallback
    if (templatesToAnalyze.length > 0) {
        return templatesToAnalyze.slice(0, 3).map(t => t.id);
    }
    return [];
  }
};

export const describeImageStyle = async (base64Image: string): Promise<Partial<AdTemplate>> => {
  const ai = getAiClient();
  
  let cleanBase64 = base64Image;
  if (base64Image.includes('base64,')) {
      cleanBase64 = base64Image.split(',')[1];
  }

  const prompt = `
    Analyze this image to be used as an advertisement template.
    Identify its layout structure, visual style, and key composition elements.
    
    Return ONLY a JSON object with:
    - name: A short, punchy 2-3 word name for this style (e.g. "Minimalist Tech", "Bold Sale").
    - description: A concise 1-sentence description of the layout and vibe.
    - tags: An array of 3-5 keywords describing the style.
    
    Do not use markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
        model: GeminiModel.ANALYSIS, 
        contents: {
            parts: [
                { text: prompt },
                { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }
        }
    });
    
    const jsonStr = cleanJson(response.text || "{}");
    return JSON.parse(jsonStr) as Partial<AdTemplate>;
  } catch (error) {
      console.error("Error describing image:", error);
      // Return a safe fallback to prevent UI crash
      return {
          name: "Custom Upload",
          description: "User uploaded template",
          tags: ["custom", "upload"]
      };
  }
};

export const generateAdVariation = async (
  seedImageBase64: string,
  brand: BrandProfile,
  templateName: string
): Promise<string | null> => {
  const ai = getAiClient();

  const colors = brand.colors.length > 0 ? brand.colors.join(", ") : "brand appropriate colors";
  const voice = brand.brandVoice ? `Brand Voice: ${brand.brandVoice}.` : "";
  const typo = brand.typography ? `Typography Style: ${brand.typography}.` : "";
  
  const prompt = `
    Create a professional, high-resolution advertisement image based on the provided reference layout.
    
    Context:
    Ad Copy: "${brand.adCopy}"
    ${voice}
    ${typo}
    Brand Colors to incorporate: ${colors}.
    Style Direction: ${templateName}.
    
    The image should use the composition of the reference image but completely replace the content to match the Ad Copy and Brand Identity. 
    Make it look like a finished, high-end marketing asset.
  `;

  try {
    // Check for valid base64
    let cleanBase64 = seedImageBase64;
    if (seedImageBase64.includes('base64,')) {
        cleanBase64 = seedImageBase64.split(',')[1];
    }

    const response = await ai.models.generateContent({
      model: GeminiModel.IMAGE_GEN,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
        ],
      },
      config: {
        imageConfig: {
            imageSize: "2K",
            aspectRatio: "1:1"
        }
      },
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    console.error("Error generating image:", error);
    if (error.message?.includes('429')) {
        throw new Error("Quota exceeded. Please try again later.");
    }
    if (error.message?.includes('SAFETY')) {
        throw new Error("Generation blocked by safety settings. Please refine your copy.");
    }
    throw error;
  }
};
