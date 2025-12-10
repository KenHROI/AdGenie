import { GoogleGenAI, Type } from "@google/genai";
import { BrandProfile, AdTemplate, GeminiModel } from "../types";
import { AD_LIBRARY } from "../constants";

// Helper to get client with current key
const getAiClient = () => {
  // Always create a new instance to pick up the latest key from process.env.API_KEY
  // which might be updated by window.aistudio.openSelectKey()
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const analyzeAdCopyForStyles = async (
  adCopy: string
): Promise<string[]> => {
  if (!adCopy || adCopy.length < 5) return [];

  const ai = getAiClient();
  const templatesDescription = AD_LIBRARY.map(
    (t) => `ID: ${t.id}, Name: ${t.name}, Desc: ${t.description}, Tags: ${t.tags.join(", ")}`
  ).join("\n");

  const prompt = `
    Analyze the following ad copy/script: "${adCopy}"
    
    Based on the tone, content, and likely audience, select exactly 3 Template IDs from the list below that would result in the highest converting image ad.
    
    Templates:
    ${templatesDescription}
    
    Return the 3 IDs in a JSON array.
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

    const jsonStr = response.text || "[]";
    const selectedIds = JSON.parse(jsonStr) as string[];
    return selectedIds;
  } catch (error) {
    console.error("Error analyzing copy:", error);
    // Fallback to first 3 if error
    return [AD_LIBRARY[0].id, AD_LIBRARY[1].id, AD_LIBRARY[2].id];
  }
};

export const generateAdVariation = async (
  seedImageBase64: string,
  brand: BrandProfile,
  templateName: string
): Promise<string | null> => {
  const ai = getAiClient();

  // Construct a rich prompt
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
    const response = await ai.models.generateContent({
      model: GeminiModel.IMAGE_GEN,
      contents: {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg", // Assuming jpeg for simplicity, or we could detect
              data: seedImageBase64.split(",")[1], // Remove data URL prefix
            },
          },
        ],
      },
      config: {
        imageConfig: {
            // Using 2K for "Pro" feel as requested
            imageSize: "2K",
            aspectRatio: "1:1"
        }
      },
    });

    // Extract image
    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    throw error;
  }
};
