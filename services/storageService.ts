
import { AdTemplate } from '../types';
import { CONFIG } from '../config';
import { AD_LIBRARY } from '../constants';

const LOCAL_STORAGE_KEY = 'ad_genie_library';

/**
 * Utility: Fetch with timeout
 */
const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout: number = CONFIG.API_TIMEOUT): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - please check your connection');
    }
    throw error;
  }
};

/**
 * Utility: Retry with exponential backoff
 */
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = CONFIG.MAX_RETRIES,
  initialDelay: number = CONFIG.RETRY_DELAY
): Promise<T> => {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry on client errors (4xx)
      if (error.message?.includes('400') || error.message?.includes('404')) {
        throw error;
      }

      // Don't retry on last attempt
      if (i === maxRetries - 1) break;

      // Exponential backoff
      const delay = initialDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

/**
 * MOCK Implementation for Demo Purposes
 * Used if backend is unreachable or disabled
 */
const mockStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
      // Seed with default constants if empty
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(AD_LIBRARY));
      return AD_LIBRARY;
    }
    return JSON.parse(stored);
  },

  saveTemplate: async (template: AdTemplate): Promise<AdTemplate> => {
    const current = await mockStorage.getLibrary();
    const updated = [template, ...current];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    return template;
  },

  deleteTemplate: async (id: string): Promise<void> => {
    const current = await mockStorage.getLibrary();
    const updated = current.filter(t => t.id !== id);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    await new Promise(resolve => setTimeout(resolve, 300));
  },

  clearLibrary: async (): Promise<void> => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

/**
 * Real API Implementation
 */

// Transform snake_case API response to camelCase for frontend
const transformTemplate = (apiData: any): AdTemplate => ({
  id: apiData.id,
  name: apiData.name,
  description: apiData.description || '',
  imageUrl: apiData.image_url || apiData.imageUrl, // Handle both formats
  tags: apiData.tags || [],
  category: apiData.category
});

const apiStorage = {
  getLibrary: async (): Promise<AdTemplate[]> => {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(`${CONFIG.BACKEND_API_URL}/images/library`);
      if (!response.ok) {
        throw new Error(`Failed to fetch library: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return data.map(transformTemplate);
    });
  },

  uploadImage: async (file: File, metadata: Partial<AdTemplate>): Promise<AdTemplate> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('metadata', JSON.stringify(metadata));

    // Use longer timeout for uploads
    const response = await fetchWithTimeout(
      `${CONFIG.BACKEND_API_URL}/images/upload`,
      {
        method: 'POST',
        body: formData,
      },
      CONFIG.UPLOAD_TIMEOUT
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Upload failed: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return transformTemplate(data);
  },

  deleteImage: async (id: string): Promise<void> => {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${CONFIG.BACKEND_API_URL}/images/${id}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(`Delete failed: ${response.status} ${response.statusText}`);
      }
    });
  },

  clearLibrary: async (): Promise<void> => {
    return retryWithBackoff(async () => {
      const response = await fetchWithTimeout(
        `${CONFIG.BACKEND_API_URL}/images/library`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        throw new Error(`Clear library failed: ${response.status} ${response.statusText}`);
      }
    });
  }
};

// --- Exported Facade ---

export const getLibrary = async (): Promise<AdTemplate[]> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
      // Try real API first, fall back if it fails
      return await apiStorage.getLibrary();
    } catch (e) {
      console.warn("Backend unreachable. Using local storage fallback.");
      return await mockStorage.getLibrary();
    }
  }
  return await apiStorage.getLibrary();
};

export const uploadTemplate = async (file: File, metadata: Partial<AdTemplate>): Promise<AdTemplate> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
      return await apiStorage.uploadImage(file, metadata);
    } catch (e) {
      console.warn("Backend upload failed. Saving locally.");
      // For local mock, we need to convert file to base64
      const base64 = await fileToBase64(file);
      const mockTemplate: AdTemplate = {
        id: `local-${Date.now()}`,
        imageUrl: base64,
        name: metadata.name || 'Uploaded Image',
        description: metadata.description || '',
        tags: metadata.tags || ['custom'],
        category: metadata.category
      };
      return await mockStorage.saveTemplate(mockTemplate);
    }
  }
  return await apiStorage.uploadImage(file, metadata);
};

export const deleteTemplate = async (id: string): Promise<void> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
      await apiStorage.deleteImage(id);
    } catch (e) {
      await mockStorage.deleteTemplate(id);
    }
    return;
  }
  await apiStorage.deleteImage(id);
};

export const clearLibrary = async (): Promise<void> => {
  if (CONFIG.ENABLE_MOCK_FALLBACK) {
    try {
      await apiStorage.clearLibrary();
    } catch (e) {
      await mockStorage.clearLibrary();
    }
    return;
  }
  await apiStorage.clearLibrary();
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
  });
};
