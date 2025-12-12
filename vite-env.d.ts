/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_GEMINI_API_KEY: string
    readonly VITE_BACKEND_API_URL: string
    readonly VITE_ENABLE_MOCK_FALLBACK: string
    readonly VITE_GOOGLE_CLIENT_ID: string
    readonly VITE_GOOGLE_PICKER_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
