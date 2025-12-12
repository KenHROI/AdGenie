import { AdTemplate } from './types';

export const AD_LIBRARY: AdTemplate[] = [
  {
    id: 'minimalist-1',
    name: 'Clean Minimalist',
    description: 'Plenty of whitespace, focus on product with subtle branding.',
    imageUrl: 'https://picsum.photos/id/1/400/400',
    tags: ['clean', 'tech', 'modern'],
  },
  {
    id: 'bold-type-1',
    name: 'Bold Typography',
    description: 'Heavy use of text overlays and strong contrast.',
    imageUrl: 'https://picsum.photos/id/20/400/400',
    tags: ['bold', 'sale', 'urgent'],
  },
  {
    id: 'lifestyle-1',
    name: 'Lifestyle Action',
    description: 'Product in use, human element, warm tones.',
    imageUrl: 'https://picsum.photos/id/42/400/400',
    tags: ['human', 'lifestyle', 'warm'],
  },
  {
    id: 'neon-cyber',
    name: 'Cyber Neon',
    description: 'Dark background with bright neon accents and glow.',
    imageUrl: 'https://picsum.photos/id/146/400/400',
    tags: ['dark', 'neon', 'gamer'],
  },
  {
    id: 'nature-organic',
    name: 'Organic Nature',
    description: 'Earth tones, leaves, soft lighting.',
    imageUrl: 'https://picsum.photos/id/28/400/400',
    tags: ['organic', 'green', 'eco'],
  },
  {
    id: 'luxury-gold',
    name: 'Luxury Gold',
    description: 'Black and gold palette, serif fonts, elegant layout.',
    imageUrl: 'https://picsum.photos/id/112/400/400',
    tags: ['luxury', 'premium', 'elegant'],
  },
  {
    id: 'flat-lay',
    name: 'Product Flat Lay',
    description: 'Top-down view of items arranged neatly.',
    imageUrl: 'https://picsum.photos/id/201/400/400',
    tags: ['product', 'flatlay', 'organized'],
  },
  {
    id: 'abstract-geo',
    name: 'Abstract Geometric',
    description: 'Geometric shapes and vibrant patterns.',
    imageUrl: 'https://picsum.photos/id/234/400/400',
    tags: ['abstract', 'colorful', 'pattern'],
  },
];


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
  { id: 'midjourney-v6', name: 'Midjourney v6', endpoint: '/api/v1/image/generate' }, // Assumption
  { id: 'gpt-4o-image', name: 'GPT-4o Image', endpoint: '/api/v1/gpt4o-image/generate' },
];

export const GOOGLE_IMAGE_MODELS = [
  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro (Gemini)' },
];

