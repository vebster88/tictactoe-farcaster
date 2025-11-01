// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started
// Pattern from working React example: direct import works in Mini App context

let sdkInstance = null;

async function getSDK() {
  if (sdkInstance) {
    return sdkInstance;
  }

  try {
    const module = await import('@farcaster/miniapp-sdk');
    sdkInstance = module.sdk || module.default;
    return sdkInstance;
  } catch (error) {
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

export const farcasterSDK = {
  async ready() {
    const sdk = await getSDK();
    await sdk.actions.ready();
  },
  
  async getUserWithQuickAuth(backendOrigin) {
    const sdk = await getSDK();
    try {
      const res = await sdk.quickAuth.fetch(`${backendOrigin}/api/user`);
      if (res.ok) return await res.json();
    } catch (error) {
      console.error('❌ Quick Auth failed:', error);
    }
    return null;
  },
  
  async getUser() {
    const sdk = await getSDK();
    try {
      return await sdk.user();
    } catch (error) {
      console.error('❌ Get user failed:', error);
      return null;
    }
  },
  
  async getContext() {
    const sdk = await getSDK();
    try {
      return await sdk.context;
    } catch (error) {
      console.error('❌ Get context failed:', error);
      return null;
    }
  },
  
  isInMiniApp() {
    return sdkInstance !== null;
  }
};
