import { AdTemplate } from './types';

// Auto-generated default library
// Generated on: 2025-12-12
// Total templates: 145

$(cat /tmp/ad-library-output.ts | tail -n +5)

export const DEFAULT_BRAND_COLORS = ['#3B82F6', '#10B981', '#F59E0B'];

export const KIE_IMAGE_MODELS = [
  { id: 'seedream-3.0-text-to-image', name: 'Seedream 3.0', endpoint: '/api/v1/image/generate' },
  { id: 'seedream-4.0-text-to-image', name: 'Seedream 4.0', endpoint: '/api/v1/image/generate' },
  { id: 'seedream-4.5-text-to-image', name: 'Seedream 4.5', endpoint: '/api/v1/image/generate' },
  { id: 'flux-2-text-to-image', name: 'Flux 2 (Text to Image)', endpoint: '/api/v1/flux/generate' },
  { id: 'flux-2-pro-text-to-image', name: 'Flux 2 Pro', endpoint: '/api/v1/flux/generate' },
  { id: 'grok-imagine-text-to-image', name: 'Grok Imagine', endpoint: '/api/v1/image/generate' },
  { id: 'google-imagen-4-ultra', name: 'Google Imagen 4 Ultra', endpoint: '/api/v1/image/generate' },
  { id: 'ideogram-v3', name: 'Ideogram v3', endpoint: '/api/v1/image/generate' },
  { id: 'recraft-v3', name: 'Recraft v3', endpoint: '/api/v1/image/generate' },
  { id: 'midjourney-v6', name: 'Midjourney v6', endpoint: '/api/v1/image/generate' },
  { id: 'gpt-4o-image', name: 'GPT-4o Image', endpoint: '/api/v1/gpt4o-image/generate' },
];

export const GOOGLE_IMAGE_MODELS = [
  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro (Gemini)' },
];
