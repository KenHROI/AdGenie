
export const CONFIG = {
  // Replace with your actual deployed backend URL in production
  BACKEND_API_URL: process.env.BACKEND_API_URL || 'http://localhost:3000/api',
  // Toggle this to false to force backend usage only, true allows fallback to localStorage for demo
  ENABLE_MOCK_FALLBACK: true,
};
