// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

let sdkInstance = null;
let isRealSDK = false;
let importPromise = null;

// Initialize SDK - use dynamic import that works in both browser and Mini App
async function initializeSDK() {
  if (sdkInstance !== null) {
    return sdkInstance;
  }

  if (!importPromise) {
    importPromise = (async () => {
      try {
        // Dynamic import - works in Mini App context
        const module = await import('@farcaster/miniapp-sdk');
        const sdk = module.sdk || module.default;
        sdkInstance = sdk;
        isRealSDK = true;
        console.log('✅ Farcaster Mini App SDK imported successfully');
        return sdk;
      } catch (error) {
        // SDK not available (running in browser or import failed)
        console.log('ℹ️ SDK not available, using fallback (running in browser)');
        
        // Create minimal mock for browser testing
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
        isRealSDK = false;
        return sdkInstance;
      }
    })();
  }

  return await importPromise;
}

// Export SDK instance getter
export async function getSDK() {
  return await initializeSDK();
}

// Export SDK wrapper with simplified API
export const farcasterSDK = {
  // Initialize and get SDK instance
  async initialize() {
    return await getSDK();
  },
  
  // Call ready() - CRITICAL for Mini Apps - call this ASAP
  async ready() {
    const sdk = await getSDK();
    if (!sdk || !sdk.actions || !sdk.actions.ready) {
      console.error('❌ SDK not available or ready() not found', {
        sdk: sdk ? 'exists' : 'null',
        actions: sdk?.actions ? 'exists' : 'null',
        ready: sdk?.actions?.ready ? 'exists' : 'null'
      });
      return false;
    }
    
    try {
      await sdk.actions.ready();
      console.log('✅ sdk.actions.ready() called successfully');
      return true;
    } catch (error) {
      console.error('❌ sdk.actions.ready() failed:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        sdk: sdk ? 'exists' : 'null',
        actions: sdk?.actions ? 'exists' : 'null',
        ready: sdk?.actions?.ready ? 'exists' : 'null',
        readyType: typeof sdk?.actions?.ready
      });
      return false;
    }
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
  
  // Check if running in Mini App (real SDK loaded)
  isInMiniApp() {
    return isRealSDK && sdkInstance !== null;
  }
};
