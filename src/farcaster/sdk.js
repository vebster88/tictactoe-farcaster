// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

export class FarcasterMiniAppSDK {
  constructor() {
    this.sdk = null;
    this.isReady = false;
    this.isInitialized = false;
    this.isMiniAppContext = false;
    this.user = null;
  }

  // Initialize Mini App SDK
  async initialize() {
    if (this.isInitialized) {
      return this.sdk;
    }

    try {
      // Import Mini App SDK according to documentation
      const { sdk } = await import('@farcaster/miniapp-sdk');
      this.sdk = sdk;
      this.isMiniAppContext = true;
      console.log('✅ Farcaster Mini App SDK imported');
      
      // Check if we're in Mini App context by trying to detect it
      try {
        // Try to get user info to verify we're in Mini App
        const user = await this.sdk.user();
        if (user && user.fid) {
          this.user = user;
          this.isMiniAppContext = true;
          console.log('✅ Running in Farcaster Mini App context');
        }
      } catch (e) {
        // Not in Mini App context, but SDK is available
        console.log('ℹ️ SDK available but not in Mini App context (running in browser)');
        this.isMiniAppContext = false;
      }

      this.isInitialized = true;
      return this.sdk;
    } catch (error) {
      console.error('❌ Farcaster Mini App SDK initialization failed:', error);
      console.log('ℹ️ Not in Farcaster environment, running in browser');
      this.sdk = this.createMockSDK();
      this.isInitialized = true;
      this.isMiniAppContext = false;
      return this.sdk;
    }
  }

  // Call ready() to hide splash screen - CRITICAL for Mini Apps
  // Must be called after app is fully loaded and ready to display
  async ready() {
    if (this.isReady) {
      return;
    }

    try {
      if (this.sdk && this.sdk.actions) {
        // According to documentation: await sdk.actions.ready()
        await this.sdk.actions.ready();
        this.isReady = true;
        console.log('✅ sdk.actions.ready() called successfully');
      } else {
        console.log('ℹ️ SDK not available, skipping ready() call');
      }
    } catch (error) {
      console.error('❌ sdk.actions.ready() failed:', error);
      // Don't throw - allow app to continue even if ready() fails
    }
  }

  // Get user using Quick Auth (recommended approach)
  async getUserWithQuickAuth(backendOrigin) {
    if (!this.sdk || !this.sdk.quickAuth) {
      return null;
    }

    try {
      const res = await this.sdk.quickAuth.fetch(`${backendOrigin}/api/user`);
      if (res.ok) {
        this.user = await res.json();
        return this.user;
      }
    } catch (error) {
      console.error('❌ Quick Auth fetch failed:', error);
    }

    // Fallback to direct user call
    return this.getUser();
  }

  // Get user info (fallback method)
  async getUser() {
    if (!this.sdk) {
      return null;
    }

    try {
      if (this.sdk.user) {
        const user = await this.sdk.user();
        this.user = user;
        return user;
      }
    } catch (error) {
      console.error('❌ Get user failed:', error);
    }

    return null;
  }

  // Get context (cast, channel, etc.)
  async getContext() {
    if (!this.sdk) {
      return null;
    }

    try {
      // context is a Promise property, not a function
      if (this.sdk.context) {
        return await this.sdk.context;
      }
    } catch (error) {
      console.error('❌ Get context failed:', error);
    }

    return null;
  }

  // Open link using SDK (opens in-app browser if available)
  async openLink(url) {
    if (!this.sdk || !this.sdk.actions) {
      window.open(url, '_blank');
      return;
    }

    try {
      if (this.sdk.actions.openLink) {
        await this.sdk.actions.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('❌ Open link failed:', error);
      window.open(url, '_blank');
    }
  }

  // Check if running in Mini App context
  isInMiniApp() {
    return this.isMiniAppContext && this.sdk && this.sdk !== this.createMockSDK();
  }

  // Get SDK instance
  getSDK() {
    return this.sdk;
  }

  // Create mock SDK for browser testing
  createMockSDK() {
    return {
      user: async () => ({
        fid: null,
        username: null,
        displayName: null,
      }),
      context: async () => null,
      quickAuth: {
        fetch: async (url) => {
          // Return mock response
          return new Response(JSON.stringify({
            fid: null,
            username: null,
            displayName: null,
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      },
      actions: {
        ready: async () => {
          console.log('✅ Mock SDK ready() called');
          return Promise.resolve();
        },
        openLink: async (url) => {
          console.log('🔗 Mock SDK openLink:', url);
          window.open(url, '_blank');
        }
      }
    };
  }
}

// Create global instance
export const farcasterSDK = new FarcasterMiniAppSDK();

// Initialize when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    await farcasterSDK.initialize();
  });
}
