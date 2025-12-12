
// Vite exposes env vars via import.meta.env with VITE_ prefix
export const CONFIG = {
  // Gemini API Key - should be set via VITE_GEMINI_API_KEY
  GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',

  // Backend API URL - defaults to localhost for development
  BACKEND_API_URL: import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:3000/api',

  // Toggle this to false to force backend usage only, true allows fallback to localStorage for demo
  ENABLE_MOCK_FALLBACK: false,

  // API Timeout configurations (in milliseconds)
  API_TIMEOUT: 30000, // 30 seconds
  UPLOAD_TIMEOUT: 60000, // 60 seconds for uploads

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // Initial retry delay in ms

  // Google Integration
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  GOOGLE_PICKER_API_KEY: import.meta.env.VITE_GOOGLE_PICKER_API_KEY || '',
};
