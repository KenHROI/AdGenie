
export interface BrandProfile {
  colors: string[];
  logo: string | null; // Base64
  adCopy: string;
  brandVoice: string;
  typography: string;
  librarySource: 'default' | 'drive' | 's3';
  driveFolderId?: string;
  driveFolderName?: string;
}

export interface AdTemplate {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // Placeholder URL
  tags: string[];
}

export interface GeneratedImage {
  id: string;
  base64: string; // Data URL
  promptUsed: string;
  seedTemplateId?: string;
  timestamp: number;
}

export enum AppStep {
  INPUT = 'INPUT',
  SELECTION = 'SELECTION',
  GENERATION = 'GENERATION',
}

export enum GeminiModel {
  ANALYSIS = 'gemini-2.5-flash',
  IMAGE_GEN = 'gemini-3-pro-image-preview',
}