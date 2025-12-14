
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
}

export interface AdTemplate {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // Placeholder or Thumbnail URL
  tags: string[];
  visual_analysis?: string; // Creative Director's deep dive
  category?: UseCaseCategory;
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
}

export enum GeminiModel {
  // Retain for backward compatibility or refactor to generic "AIModel"
  ANALYSIS = 'gemini-2.5-flash',
  IMAGE_GEN = 'gemini-3-pro-image-preview', // User explicitly requested this
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
}
