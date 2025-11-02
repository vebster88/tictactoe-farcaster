// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

let sdkInstance = null;
let fallbackOnly = false;

async function getSDK() {
  if (sdkInstance) {
    return sdkInstance;
  }

  try {
    const module = await import('@farcaster/miniapp-sdk');
    sdkInstance = module.sdk || module.default || module;
    fallbackOnly = false;
    return sdkInstance;
  } catch (error) {
    fallbackOnly = true;
    // Fallback for browser - SDK not available
    sdkInstance = {
      actions: { ready: async () => {} },
      user: async () => null,
      context: Promise.resolve(null),
      quickAuth: { fetch: async () => new Response('{}', { status: 200 }) }
    };
    return sdkInstance;
  }
}

// Wait for Farcaster host to be initialized
async function waitForHost(timeout = 5000) {
  // Check if host is already available
  if (window.farcaster || window.parent !== window) {
    return;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMsg);
      reject(new Error('Farcaster host timeout - not running in Mini App'));
    }, timeout);

    function onMsg(e) {
      if (e?.data?.type === 'farcaster:ready' || window.farcaster) {
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve();
      }
    }

    window.addEventListener('message', onMsg);
  });
}

export const farcasterSDK = {
  async ready() {
    const sdk = await getSDK();
    
    // Only wait for host if we have real SDK (not fallback)
    if (!fallbackOnly) {
      try {
        await waitForHost();
      } catch (error) {
        // Continue anyway - might be in preview/debug mode
      }
    }
    
    await sdk.actions.ready();
  },
  
  async getUserWithQuickAuth(backendOrigin) {
    const sdk = await getSDK();
    if (fallbackOnly) {
      throw new Error('SDK недоступен (fallback mode) - не в Mini App окружении');
    }
    
    if (!sdk.quickAuth || !sdk.quickAuth.fetch) {
      throw new Error('Quick Auth API недоступен в SDK');
    }
    
    const userUrl = `${backendOrigin}/api/user`;
    
    try {
      const res = await sdk.quickAuth.fetch(userUrl);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Quick Auth HTTP ${res.status}: ${res.statusText} - ${errorText}`);
      }
      
      const userData = await res.json();
      
      if (!userData || !userData.fid) {
        throw new Error('Quick Auth не вернул fid пользователя');
      }
      
      return userData;
    } catch (error) {
      throw error;
    }
  },
  
  async getUser() {
    const sdk = await getSDK();
    
    if (fallbackOnly) {
      throw new Error('SDK недоступен (fallback mode) - не в Mini App окружении');
    }
    
    // SDK provides user via sdk.context.user, not sdk.user()
    // context can be a Promise or an object
    try {
      // Resolve context (might be a Promise)
      const context = await Promise.resolve(sdk.context);
      
      if (!context) {
        throw new Error('SDK.context вернул null/undefined');
      }
      
      if (!context.user) {
        throw new Error('SDK.context.user недоступен - пользователь не найден в контексте');
      }
      
      const user = context.user;
      
      if (!user.fid) {
        throw new Error('SDK.context.user вернул user без fid');
      }
      
      return user;
    } catch (error) {
      throw error;
    }
  },
  
  async getContext() {
    const sdk = await getSDK();
    if (fallbackOnly) return null;
    
    try {
      return await sdk.context;
    } catch (error) {
      return null;
    }
  },
  
  // Reliable check: verify host presence, not just SDK import
  isInMiniApp() {
    // First check environment indicators (doesn't require SDK to be loaded)
    const envCheck = !!(
      window.farcaster ||
      (window.parent !== window) ||
      document.referrer?.includes('farcaster') ||
      (window.location !== window.parent.location)
    );
    
    if (!envCheck) {
      return false;
    }
    
    // If environment suggests Mini App, check if we have real SDK
    // If SDK not loaded yet, return true anyway (we'll try to load it)
    return !fallbackOnly;
  },
  
  // Alternative: check environment without SDK dependency
  checkMiniAppEnvironment() {
    return !!(
      window.farcaster ||
      (window.parent !== window) ||
      document.referrer?.includes('farcaster') ||
      (window.location !== window.parent.location)
    );
  }
};
