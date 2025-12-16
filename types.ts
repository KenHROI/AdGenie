
export type Platform = 'meta' | 'google' | 'linkedin' | 'native';

export interface BrandProfile {
  colors: string[];
  logo: string | null; // Base64
  adCopy: string;
  brandVoice: string;
  typography: string;
  librarySource: 'default' | 'drive' | 's3';
  driveFolderId?: string;
  driveFolderName?: string;
  driveAccessToken?: string;
  aspectRatio: AspectRatio; // Moved from Settings
  targetPlatform?: Platform; // New field
}

export interface AdTemplate {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // Placeholder or Thumbnail URL
  tags: string[];
  visual_analysis?: string; // Creative Director's deep dive
  category?: UseCaseCategory;
  platformOrigin?: Platform; // Metadata for smart matching
  layout?: {
    zones: TextZone[];
    safeZones?: number[][]; // Areas to NEVER put text
  };
}

export interface TextZone {
  id: string; // e.g. "box_1"
  type: 'headline' | 'cta' | 'body' | 'caption';
  description: string; // e.g. "Top left large bold text"
  maxChars: number; // The absolute visual limit (e.g. 15 chars)
  maxLines: number; // e.g. 1, 2, or 3 lines
  contrastColor: string; // "white" or "black" for overlay readability
  boundingBox?: number[]; // [x, y, w, h] percentage (0-100)
  isStatic?: boolean; // If true, this text is part of the "UI" and MUST NOT be changed
  allowEditing?: boolean; // Explicit override
}

export enum UseCaseCategory {
  ECOMMERCE = 'Ecommerce',
  LEAD_GEN = 'Lead Gen',
  APP_INSTALL = 'App Install',
  BRAND_AWARENESS = 'Brand Awareness',
  OTHER = 'Other'
}

export interface GeneratedImage {
  id: string;
  base64: string; // Data URL
  promptUsed: string;
  seedTemplateId?: string;
  referenceUrl?: string; // For side-by-side comparison
  timestamp: number;
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

export enum AppStep {
  INPUT = 'INPUT',
  SELECTION = 'SELECTION',
  GENERATION = 'GENERATION',
  SETTINGS = 'SETTINGS',
  CAMPAIGNS = 'CAMPAIGNS',
}

export enum GeminiModel {
  // Retain for backward compatibility or refactor to generic "AIModel"
  ANALYSIS = 'gemini-2.5-flash',
  IMAGE_GEN = 'gemini-3-pro-image-preview', // Updated to Nano Banana Pro (Gemini 3)
}

export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

export type AIProvider = 'google' | 'kie' | 'openRouter';

export interface ServiceConfig {
  provider: AIProvider;
  modelId?: string; // For Kie.ai/OpenRouter specific models
  endpoint?: string; // For Custom Kie.ai models
  isEnabled: boolean;
}

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export interface SettingsState {
  theme: 'light' | 'dark';
  notifications: boolean;
  apiKeys: {
    google: string;
    kie: string;
    openRouter: string;
  };
  services: {
    analysis: ServiceConfig;      // Text/Ad Copy analysis
    imageGeneration: ServiceConfig;
    vision: ServiceConfig;        // Image description
  };
  // preferredRatio field removed
  openRouterModels: Array<{
    id: string;
    name: string;
    capabilities: {
      isVision?: boolean;
      isImageGen?: boolean;
    };
  }>; // Cache available models
  kieModels: Array<{
    id: string;
    name: string;
    category?: 'image' | 'video' | 'audio' | 'text';
  }>;
}

export interface Campaign {
  id: string;
  name: string;
  brandData: BrandProfile;
  createdAt: string;
  updatedAt: string;
  images?: CampaignImage[];
}

export interface CampaignImage {
  id: string;
  campaignId: string;
  storagePath: string;
  promptUsed: string;
  referenceUrl: string;
  seedTemplateId: string;
  metadata?: any;
  createdAt: string;
  publicUrl?: string;
}
