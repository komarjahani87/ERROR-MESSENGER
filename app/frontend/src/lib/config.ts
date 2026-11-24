type RuntimeConfig = {
    API_BASE_URL: string;
};

declare global {
    interface Window {
        errorMessenger?: {
            apiBaseUrl: string;
            appName: string;
            version: string;
        };
    }
}

let runtimeConfig: RuntimeConfig | null = null;
let configLoading = true;

const defaultConfig: RuntimeConfig = {
    API_BASE_URL: 'http://127.0.0.1:8000'
};

export async function loadRuntimeConfig(): Promise<void> {
    // Electron desktop application
    if (window.errorMessenger?.apiBaseUrl) {
        runtimeConfig = {
            API_BASE_URL: window.errorMessenger.apiBaseUrl
        };
        configLoading = false;
        return;
    }

    // Browser application
    try {
        const response = await fetch('/api/config');

        if (response.ok) {
            runtimeConfig = await response.json();
        }
    } catch (error) {
        console.warn('Runtime configuration unavailable:', error);
    } finally {
        configLoading = false;
    }
}

export function getConfig(): RuntimeConfig {
    if (window.errorMessenger?.apiBaseUrl) {
        return {
            API_BASE_URL: window.errorMessenger.apiBaseUrl
        };
    }

    if (configLoading) {
        return defaultConfig;
    }

    if (runtimeConfig) {
        return runtimeConfig;
    }

    if (import.meta.env.VITE_API_BASE_URL) {
        return {
            API_BASE_URL: import.meta.env.VITE_API_BASE_URL
        };
    }

    return defaultConfig;
}

export function getAPIBaseURL(): string {
    return getConfig().API_BASE_URL;
}

export const config = {
    get API_BASE_URL() {
        return getAPIBaseURL();
    }
};
