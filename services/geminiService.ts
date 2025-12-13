
import { GoogleGenerativeAI } from "@google/generative-ai";
import { BrandProfile, AdTemplate, GeminiModel } from "../types";
import { AD_LIBRARY } from "../constants";
import { CONFIG } from "../config";

const getAiClient = () => {
  if (!CONFIG.GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured. Please set VITE_GEMINI_API_KEY environment variable.');
  }
  return new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
};

export const analyzeAdCopyForStyles = async (
  adCopy: string,
  availableTemplates: AdTemplate[] = AD_LIBRARY
): Promise<string[]> => {
  if (!adCopy || adCopy.length < 5) return [];

  const genAI = getAiClient();
  const model = genAI.getGenerativeModel({
    model: GeminiModel.ANALYSIS,
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

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
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonStr = response.text() || "[]";
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
  const genAI = getAiClient();
  const model = genAI.getGenerativeModel({
    model: GeminiModel.ANALYSIS,
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

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
    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "image/jpeg", data: cleanBase64 } }
    ]);

    const response = await result.response;
    const jsonStr = response.text() || "{}";
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

export const extractAdComponents = async (adCopy: string): Promise<{
  headline: string;
  subheadline: string;
  cta: string;
  tone_keywords: string[];
}> => {
  const genAI = getAiClient();
  const model = genAI.getGenerativeModel({
    model: GeminiModel.ANALYSIS,
    generationConfig: { responseMimeType: "application/json" }
  });

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
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return JSON.parse(response.text());
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

export const generateAdVariation = async (
  seedImageBase64: string,
  brand: BrandProfile,
  templateName: string,
  customPrompt?: string,
  adComponents?: { headline: string; subheadline: string; cta: string }
): Promise<string | null> => {
  const genAI = getAiClient();
  const model = genAI.getGenerativeModel({ model: GeminiModel.IMAGE_GEN });

  // Use extracted components if available, otherwise fallback to raw copy (but shorter)
  const copyContext = adComponents
    ? `
      Headline: "${adComponents.headline}"
      Subheadline: "${adComponents.subheadline}"
      CTA: "${adComponents.cta}"
      `
    : `Ad Copy: "${brand.adCopy.slice(0, 300)}"`; // Fallback truncation

  const colors = brand.colors.length > 0 ? brand.colors.join(", ") : "brand appropriate colors";

  // Allow custom prompt to override instructions, but we still enforce strict layout in the system context
  const systemContext = `
    You are an expert graphic designer. Your task is to adapt the provided reference advertisement image to a new brand, while STRICTLY PRESERVING layout and geometry.
    
    STRICT CONSTRAINTS:
    1. EXACT LAYOUT PRESERVATION: The output MUST align perfectly with the reference image. Buttons, text boxes, and image composition must not move.
    2. CONTENT ADJUSTMENT: Replace existing text with the provided headlines/CTA. Do not add extra text.
    3. VISUAL STYLE: Match the target Brand Colors and Typography.
    
    INPUT DATA:
    ${copyContext}
    Brand Voice: ${brand.brandVoice || "Professional"}
    Brand Colors: ${colors}
    Reference Style: ${templateName}
  `;

  const finalPrompt = customPrompt || `
    INSTRUCTIONS:
    - Reskin the reference image using the provided 'INPUT DATA'.
    - Replace the text in the image with the Headline, Subheadline, and CTA provided.
    - Updates colors to: ${colors}.
    - Keep the background scene composition identical but "fresh".
  `;

  const fullPrompt = `${systemContext}\n\n${finalPrompt}`;

  try {
    // Check for valid base64
    let cleanBase64 = seedImageBase64;
    if (seedImageBase64.includes('base64,')) {
      cleanBase64 = seedImageBase64.split(',')[1];
    }

    const result = await model.generateContent([
      fullPrompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      },
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
