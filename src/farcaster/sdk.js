// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

let sdkInstance = null;
let isRealSDK = false;

// Try to get SDK - use direct import for Mini App context
async function getSDKInstance() {
  if (sdkInstance !== null) {
    return sdkInstance;
  }

  try {
    // Direct import - this should work in Mini App context
    const { sdk } = await import('@farcaster/miniapp-sdk');
    sdkInstance = sdk;
    isRealSDK = true;
    console.log('✅ Farcaster Mini App SDK imported');
    return sdk;
  } catch (error) {
    console.warn('⚠️ SDK import failed, using fallback:', error.message);
    
    // Fallback for browser
    sdkInstance = {
      actions: {
        ready: async () => {
          console.log('✅ Mock ready() called');
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
}

// CRITICAL: Try to call ready() immediately when SDK is available
// This ensures ready() is called as early as possible
let readyCalled = false;
let readyPromise = null;

async function callReadyImmediately() {
  if (readyCalled || readyPromise) {
    return readyPromise;
  }
  
  readyPromise = (async () => {
    try {
      const sdk = await getSDKInstance();
      if (sdk && sdk.actions && sdk.actions.ready) {
        await sdk.actions.ready();
        readyCalled = true;
        console.log('✅ sdk.actions.ready() called immediately');
        return true;
      }
      console.warn('⚠️ SDK ready() not available yet');
      return false;
    } catch (error) {
      console.error('❌ Immediate ready() call failed:', error);
      return false;
    }
  })();
  
  return readyPromise;
}

// Try to call ready() immediately if SDK is already available
if (typeof window !== 'undefined') {
  // Small delay to ensure module is loaded
  setTimeout(() => {
    callReadyImmediately().catch(console.error);
  }, 0);
}

export const farcasterSDK = {
  // Call ready() IMMEDIATELY - CRITICAL
  async ready() {
    // If ready() was already called, return success
    if (readyCalled) {
      return true;
    }
    
    // If ready() is being called, wait for it
    if (readyPromise) {
      return await readyPromise;
    }
    
    // Otherwise, call ready() now
    const sdk = await getSDKInstance();
    if (!sdk || !sdk.actions || !sdk.actions.ready) {
      console.error('❌ SDK or ready() not available', {
        hasSdk: !!sdk,
        hasActions: !!sdk?.actions,
        hasReady: !!sdk?.actions?.ready
      });
      return false;
    }
    
    try {
      await sdk.actions.ready();
      readyCalled = true;
      console.log('✅ sdk.actions.ready() called successfully');
      return true;
    } catch (error) {
      console.error('❌ ready() error:', error);
      console.error('Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name
      });
      return false;
    }
  },
  
  async getUserWithQuickAuth(backendOrigin) {
    const sdk = await getSDKInstance();
    if (!sdk || !sdk.quickAuth) return null;
    try {
      const res = await sdk.quickAuth.fetch(`${backendOrigin}/api/user`);
      if (res.ok) return await res.json();
    } catch (error) {
      console.error('❌ Quick Auth failed:', error);
    }
    return null;
  },
  
  async getUser() {
    const sdk = await getSDKInstance();
    if (!sdk || !sdk.user) return null;
    try {
      return await sdk.user();
    } catch (error) {
      console.error('❌ Get user failed:', error);
      return null;
    }
  },
  
  async getContext() {
    const sdk = await getSDKInstance();
    if (!sdk || !sdk.context) return null;
    try {
      return await sdk.context;
    } catch (error) {
      console.error('❌ Get context failed:', error);
      return null;
    }
  },
  
  isInMiniApp() {
    return isRealSDK && sdkInstance !== null;
  }
};
