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
    console.log('📦 Farcaster module:', module);
    sdkInstance = module.sdk || module.default || module;
    fallbackOnly = false;
    return sdkInstance;
  } catch (error) {
    console.warn('⚠️ SDK import failed, using fallback:', error);
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
        console.warn('⚠️ Host wait timeout:', error.message);
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
    console.log('🔐 Quick Auth request URL:', userUrl);
    
    try {
      const res = await sdk.quickAuth.fetch(userUrl);
      console.log('📡 Quick Auth response:', {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries())
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Quick Auth HTTP error:', {
          status: res.status,
          statusText: res.statusText,
          body: errorText
        });
        throw new Error(`Quick Auth HTTP ${res.status}: ${res.statusText} - ${errorText}`);
      }
      
      const userData = await res.json();
      console.log('✅ Quick Auth user data:', userData);
      
      if (!userData || !userData.fid) {
        throw new Error('Quick Auth не вернул fid пользователя');
      }
      
      return userData;
    } catch (error) {
      console.error('❌ Quick Auth fetch failed:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        url: userUrl
      });
      throw error; // Пробрасываем ошибку дальше
    }
  },
  
  async getUser() {
    const sdk = await getSDK();
    if (fallbackOnly) {
      throw new Error('SDK недоступен (fallback mode) - не в Mini App окружении');
    }
    
    if (!sdk.user || typeof sdk.user !== 'function') {
      throw new Error('SDK.user() метод недоступен');
    }
    
    try {
      console.log('👤 Calling SDK.user()...');
      const user = await sdk.user();
      console.log('👤 SDK.user() result:', user);
      
      if (!user) {
        throw new Error('SDK.user() вернул null/undefined');
      }
      
      return user;
    } catch (error) {
      console.error('❌ SDK.user() failed:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error; // Пробрасываем ошибку дальше
    }
  },
  
  async getContext() {
    const sdk = await getSDK();
    if (fallbackOnly) return null;
    
    try {
      return await sdk.context;
    } catch (error) {
      console.error('❌ Get context failed:', error);
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
