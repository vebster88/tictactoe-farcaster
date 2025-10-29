// Farcaster Frame SDK инициализация
// Обеспечивает правильную работу с Farcaster Frames v2

import sdk from '@farcaster/frame-sdk';

export class FarcasterSDK {
  constructor() {
    this.sdk = sdk;
    this.isReady = false;
    this.isInitialized = false;
  }

  // Инициализация SDK согласно официальной документации
  async initialize() {
    if (this.isInitialized) {
      return this.sdk;
    }

    try {
      // Используем официальный Frame SDK
      this.sdk = sdk;
      
      // Получаем контекст и вызываем ready() - как в официальном примере
      const context = await this.sdk.context;
      console.log('📱 Farcaster context:', context);
      
      // Вызываем ready() - это критически важно для Farcaster
      this.sdk.actions.ready();
      this.isReady = true;
      this.isInitialized = true;
      console.log('✅ Farcaster Frame SDK initialized');
    } catch (error) {
      console.error('❌ Farcaster Frame SDK initialization failed:', error);
      console.log('ℹ️ Not in Farcaster environment, using mock SDK');
      this.sdk = this.createMockSDK();
      this.isInitialized = true;
    }

    return this.sdk;
  }

  // Вызов ready() согласно официальной документации
  async ready() {
    if (this.isReady) {
      return;
    }

    try {
      // После полной загрузки приложения вызываем ready()
      await this.sdk.actions.ready();
      this.isReady = true;
      console.log('✅ sdk.actions.ready() called successfully');
    } catch (error) {
      console.error('❌ sdk.actions.ready() failed:', error);
      throw error; // Пробрасываем ошибку для обработки в initialize()
    }
  }

  // Получение пользователя
  async getUser() {
    if (!this.sdk) {
      return null;
    }

    try {
      if (this.sdk.user) {
        return await this.sdk.user();
      }
    } catch (error) {
      console.error('❌ Get user failed:', error);
    }

    return null;
  }

  // Получение контекста
  async getContext() {
    if (!this.sdk) {
      return null;
    }

    try {
      if (this.sdk.context) {
        return await this.sdk.context();
      }
    } catch (error) {
      console.error('❌ Get context failed:', error);
    }

    return null;
  }

  // Открытие ссылки
  async openLink(url) {
    if (!this.sdk) {
      window.open(url, '_blank');
      return;
    }

    try {
      if (this.sdk.actions && this.sdk.actions.openLink) {
        await this.sdk.actions.openLink(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('❌ Open link failed:', error);
      window.open(url, '_blank');
    }
  }

  // Создание mock SDK для тестирования
  createMockSDK() {
    return {
      user: async () => ({
        fid: 12345,
        username: 'testuser',
        displayName: 'Test User',
        pfpUrl: 'https://via.placeholder.com/150',
        verifiedAddresses: {
          ethereum: ['0x1234567890123456789012345678901234567890']
        }
      }),
      context: async () => ({
        cast: {
          hash: '0x1234567890abcdef',
          author: {
            fid: 12345,
            username: 'testuser'
          }
        }
      }),
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

  // Проверка, что мы в Farcaster
  isInFarcaster() {
    return this.sdk && 
           this.sdk.actions && 
           this.sdk !== this.createMockSDK();
  }

  // Получение экземпляра SDK
  getSDK() {
    return this.sdk;
  }
}

// Создаем глобальный экземпляр
export const farcasterSDK = new FarcasterSDK();

// Автоматическая инициализация при загрузке
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    farcasterSDK.initialize();
  });
}
