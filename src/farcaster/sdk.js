// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

let sdkInstance = null;
let isInitialized = false;
let isRealSDK = false; // Track if SDK is real or mock

// Initialize and get SDK - following official docs pattern
export async function getSDK() {
  if (isInitialized && sdkInstance) {
    return sdkInstance;
  }

  try {
    // Import SDK exactly as shown in documentation
    const { sdk } = await import('@farcaster/miniapp-sdk');
    sdkInstance = sdk;
    isRealSDK = true; // Mark as real SDK
    isInitialized = true;
    console.log('✅ Farcaster Mini App SDK imported');
    return sdk;
  } catch (error) {
    // Only log error if it's not a module resolution error (expected in browser)
    if (error.message && !error.message.includes('Failed to fetch dynamically imported module')) {
      console.error('❌ Failed to import Farcaster Mini App SDK:', error);
    } else {
      console.log('ℹ️ SDK not available (running in browser, not Mini App)');
    }
    
    // Create a minimal mock for browser testing
    sdkInstance = {
      actions: {
        ready: async () => {
          console.log('✅ Mock SDK ready() called');
        },
        openLink: async (url) => {
          window.open(url, '_blank');
        }
      },
      user: async () => null,
      context: Promise.resolve(null),
      quickAuth: {
        fetch: async (url) => {
          return new Response(JSON.stringify({ fid: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    };
    isRealSDK = false; // Mark as mock
    isInitialized = true;
    return sdkInstance;
  }
}

// Export SDK instance getter with improved API
export const farcasterSDK = {
  async initialize() {
    return await getSDK();
  },
  
  // Call ready() - CRITICAL for Mini Apps
  async ready() {
    const sdk = await getSDK();
    if (sdk && sdk.actions && sdk.actions.ready) {
      try {
        await sdk.actions.ready();
        console.log('✅ sdk.actions.ready() called');
        return true;
      } catch (error) {
        console.error('❌ sdk.actions.ready() failed:', error);
        return false;
      }
    }
    return false;
  },
  
  async getUserWithQuickAuth(backendOrigin) {
    const sdk = await getSDK();
    if (!sdk || !sdk.quickAuth) return null;
    
    try {
      const res = await sdk.quickAuth.fetch(`${backendOrigin}/api/user`);
      if (res.ok) {
        return await res.json();
      }
    } catch (error) {
      console.error('❌ Quick Auth failed:', error);
    }
    return null;
  },
  
  async getUser() {
    const sdk = await getSDK();
    if (!sdk || !sdk.user) return null;
    try {
      return await sdk.user();
    } catch (error) {
      console.error('❌ Get user failed:', error);
      return null;
    }
  },
  
  async getContext() {
    const sdk = await getSDK();
    if (!sdk || !sdk.context) return null;
    try {
      return await sdk.context;
    } catch (error) {
      console.error('❌ Get context failed:', error);
      return null;
    }
  },
  
  // Improved check: only true if real SDK is loaded
  isInMiniApp() {
    return isInitialized && isRealSDK;
  },
  
  getSDK() {
    return sdkInstance;
  }
};
