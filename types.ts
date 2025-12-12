
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
}

export interface AdTemplate {
  id: string;
  name: string;
  description: string;
  imageUrl: string; // Placeholder or Thumbnail URL
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
  SETTINGS = 'SETTINGS',
}

export enum GeminiModel {
  ANALYSIS = 'gemini-2.5-flash',
  IMAGE_GEN = 'gemini-3-pro-image-preview',
}

export type NotificationType = 'success' | 'error' | 'info';

export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
}

export type AIProvider = 'google' | 'openRouter';

export interface ServiceConfig {
  provider: AIProvider;
  modelId?: string;
  isEnabled: boolean; // Allow disabling specific features
}

export interface SettingsState {
  apiKeys: {
    google: string;
    openRouter: string;
  };
  services: {
    analysis: ServiceConfig;      // Text/Ad Copy analysis
    imageGeneration: ServiceConfig;
    vision: ServiceConfig;        // Image description
    video: ServiceConfig;         // Video analysis
  };
}
