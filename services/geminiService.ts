import { GoogleGenerativeAI, Type } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel } from "../types";
import { AD_LIBRARY } from "../constants";

const getAiClient = () => {
  return new GoogleGenerativeAI({ apiKey: process.env.API_KEY });
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
    
    Return the 3 IDs in a JSON array.
  `;

  try {
    const model = ai.getGenerativeModel({ 
      model: GeminiModel.ANALYSIS,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });
    const response = await model.generateContent(prompt);

    const jsonStr = response.response.text() || "[]";
    const selectedIds = JSON.parse(jsonStr) as string[];
    
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
    
    Return a JSON object with:
    - name: A short, punchy 2-3 word name for this style (e.g. "Minimalist Tech", "Bold Sale").
    - description: A concise 1-sentence description of the layout and vibe.
    - tags: An array of 3-5 keywords describing the style.
  `;

  try {
    const model = ai.getGenerativeModel({ 
      model: GeminiModel.ANALYSIS,
      generationConfig: {
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
    
    const response = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
    ]);
    
    const jsonStr = response.response.text();
    return JSON.parse(jsonStr) as Partial<AdTemplate>;
  } catch (error) {
    console.error("Error describing image:", error);
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

    const model = ai.getGenerativeModel({ 
      model: GeminiModel.IMAGE_GEN
    });

    const response = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      },
    ]);

    if (response.response.candidates && response.response.candidates[0].content.parts) {
      for (const part of response.response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error: any) {
    console.error("Error generating image:", error);
    // Pass specific error messages up
    if (error.message?.includes('429')) {
      throw new Error("Quota exceeded. Please try again later.");
    }
    if (error.message?.includes('SAFETY')) {
      throw new Error("Generation blocked by safety settings. Please refine your copy.");
    }
    throw error;
  }
};
