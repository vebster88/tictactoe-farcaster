// Farcaster Mini App SDK integration
// Following official documentation: https://miniapps.farcaster.xyz/docs/getting-started

import { sdk } from '@farcaster/miniapp-sdk';

export const farcasterSDK = {
  async ready() {
    await sdk.actions.ready();
  },
  
  async getUserWithQuickAuth(backendOrigin) {
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
    try {
      return await sdk.user();
    } catch (error) {
      console.error('❌ Get user failed:', error);
      return null;
    }
  },
  
  async getContext() {
    try {
      return await sdk.context;
    } catch (error) {
      console.error('❌ Get context failed:', error);
      return null;
    }
  },
  
  isInMiniApp() {
    return true;
  }
};
