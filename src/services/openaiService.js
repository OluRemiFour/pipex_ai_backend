// // src/services/openaiService.js
// const OpenAI = require("openai");
// const config = require("../config");

// class OpenAIService {
//   constructor() {
//     this.apiKeys = config.openaiApiKeys;
//     this.currentKeyIndex = 0;
//     this.keyStatus = new Map();
//     this.rateLimits = new Map();
//     this.initializeKeyStatus();
//     this.clients = new Map();
//     this.initializeClients();
//   }

//   initializeKeyStatus() {
//     // Initialize all keys as active
//     this.apiKeys.forEach((key, index) => {
//       this.keyStatus.set(index, {
//         active: true,
//         lastError: null,
//         errorCount: 0,
//         successCount: 0,
//         lastUsed: null,
//         quotaExceeded: false,
//       });
//     });
//   }

//   initializeClients() {
//     this.apiKeys.forEach((key, index) => {
//       this.clients.set(
//         index,
//         new OpenAI({
//           apiKey: key,
//           maxRetries: 2,
//           timeout: 30000,
//         })
//       );
//     });
//   }

//   getCurrentKeyIndex() {
//     return this.currentKeyIndex;
//   }

//   getCurrentClient() {
//     return this.clients.get(this.currentKeyIndex);
//   }

//   getCurrentKey() {
//     return this.apiKeys[this.currentKeyIndex];
//   }

//   markKeyFailed(keyIndex, error) {
//     const status = this.keyStatus.get(keyIndex) || {
//       active: true,
//       lastError: null,
//       errorCount: 0,
//       successCount: 0,
//       lastUsed: null,
//       quotaExceeded: false,
//     };

//     status.active = false;
//     status.lastError = error;
//     status.errorCount += 1;
//     status.lastUsed = new Date();

//     // Check if it's a quota exceeded error
//     if (
//       error?.status === 429 ||
//       error?.code === "insufficient_quota" ||
//       (error?.message && error.message.includes("quota"))
//     ) {
//       status.quotaExceeded = true;
//       console.log(`❌ OpenAI Key ${keyIndex}: Quota exceeded. Disabling.`);
//     } else {
//       console.log(
//         `⚠️ OpenAI Key ${keyIndex}: Failed with error: ${error.message}`
//       );
//     }

//     this.keyStatus.set(keyIndex, status);

//     // Try to switch to next key
//     this.switchToNextKey();
//   }

//   markKeySuccess(keyIndex) {
//     const status = this.keyStatus.get(keyIndex) || {
//       active: true,
//       lastError: null,
//       errorCount: 0,
//       successCount: 0,
//       lastUsed: null,
//       quotaExceeded: false,
//     };

//     status.successCount += 1;
//     status.lastUsed = new Date();
//     status.errorCount = Math.max(0, status.errorCount - 1); // Reduce error count on success

//     // Reactivate if it was marked inactive but not due to quota
//     if (!status.active && !status.quotaExceeded) {
//       status.active = true;
//       console.log(`✅ Reactivating OpenAI Key ${keyIndex} after success`);
//     }

//     this.keyStatus.set(keyIndex, status);
//   }

//   switchToNextKey() {
//     const originalIndex = this.currentKeyIndex;
//     let attempts = 0;

//     do {
//       this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
//       attempts++;

//       const status = this.keyStatus.get(this.currentKeyIndex);

//       if (status?.active && !status?.quotaExceeded) {
//         console.log(`🔄 Switched to OpenAI Key ${this.currentKeyIndex}`);
//         return true;
//       }

//       // If we've tried all keys, check if we should reactivate any
//       if (attempts >= this.apiKeys.length) {
//         this.reactivateInactiveKeys();
//         attempts = 0;
//       }
//     } while (
//       this.currentKeyIndex !== originalIndex &&
//       attempts < this.apiKeys.length * 2
//     );

//     console.error("❌ No active OpenAI API keys available");
//     return false;
//   }

//   reactivateInactiveKeys() {
//     const now = new Date();
//     const COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes

//     this.keyStatus.forEach((status, keyIndex) => {
//       if (!status.active && !status.quotaExceeded) {
//         const timeSinceError = now - (status.lastUsed || 0);

//         if (timeSinceError > COOLDOWN_PERIOD) {
//           status.active = true;
//           status.errorCount = 0;
//           console.log(`♻️ Reactivating OpenAI Key ${keyIndex} after cooldown`);
//           this.keyStatus.set(keyIndex, status);
//         }
//       }
//     });
//   }

//   getAllKeyStatus() {
//     const status = [];
//     this.apiKeys.forEach((key, index) => {
//       const keyStatus = this.keyStatus.get(index) || {
//         active: true,
//         errorCount: 0,
//         successCount: 0,
//         quotaExceeded: false,
//       };
//       status.push({
//         index,
//         maskedKey: `${key.substring(0, 8)}...${key.substring(key.length - 4)}`,
//         active: keyStatus.active,
//         quotaExceeded: keyStatus.quotaExceeded,
//         errorCount: keyStatus.errorCount,
//         successCount: keyStatus.successCount,
//         lastUsed: keyStatus.lastUsed,
//       });
//     });
//     return status;
//   }

//   getActiveKeyCount() {
//     let count = 0;
//     this.keyStatus.forEach((status) => {
//       if (status.active && !status.quotaExceeded) {
//         count++;
//       }
//     });
//     return count;
//   }

//   async makeRequest(requestFn) {
//     const maxRetries = this.apiKeys.length * 2;
//     let retryCount = 0;
//     let lastError;

//     while (retryCount < maxRetries) {
//       const currentClient = this.getCurrentClient();
//       const currentKeyIndex = this.getCurrentKeyIndex();

//       try {
//         const result = await requestFn(currentClient);
//         this.markKeySuccess(currentKeyIndex);
//         return result;
//       } catch (error) {
//         lastError = error;
//         console.error(`OpenAI request failed (Key ${currentKeyIndex}):`, {
//           error: error.message,
//           status: error.status,
//           code: error.code,
//         });

//         this.markKeyFailed(currentKeyIndex, error);

//         // Check if we have any active keys left
//         if (this.getActiveKeyCount() === 0) {
//           throw new Error(
//             "All OpenAI API keys have exceeded quota or are inactive"
//           );
//         }

//         // Add exponential backoff
//         const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
//         await new Promise((resolve) => setTimeout(resolve, delay));

//         retryCount++;
//       }
//     }

//     throw lastError || new Error("OpenAI request failed after all retries");
//   }

//   async chatCompletion(messages, options = {}) {
//     return this.makeRequest(async (client) => {
//       return client.chat.completions.create({
//         model: options.model || "gpt-4o-mini",
//         messages,
//         temperature: options.temperature || 0.2,
//         max_tokens: options.max_tokens || 2000,
//         ...options,
//       });
//     });
//   }

//   async responsesCreate(input, options = {}) {
//     return this.makeRequest(async (client) => {
//       return client.responses.create({
//         model: options.model || "gpt-4.1-mini",
//         input,
//         max_output_tokens: options.max_output_tokens || 2000,
//         ...options,
//       });
//     });
//   }
// }

// module.exports = new OpenAIService();

// src/services/openaiService.js
const OpenAI = require("openai");

class OpenAIService {
  constructor() {
    // Lazy initialization properties
    this.apiKeys = null;
    this.currentKeyIndex = 0;
    this.keyStatus = new Map();
    this.rateLimits = new Map();
    this.clients = new Map();
    this.initialized = false;
    this.initializationPromise = null;
    this.lastKeySwitch = Date.now();
    this.MIN_SWITCH_INTERVAL = 1000; // 1 second minimum between switches
  }

  /**
   * Lazy initialization - loads config only when needed
   */
  async initialize() {
    // If already initialized, return
    if (this.initialized) return;

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        // Load config lazily
        const config = require("../config/config");

        // Get API keys from config
        this.apiKeys = config.openaiApiKeys || [];

        if (this.apiKeys.length === 0) {
          throw new Error(
            "No OpenAI API keys found. Please set OPENAI_API_KEYS environment variable."
          );
        }

        console.log(
          `🔑 OpenAI Service: Loaded ${this.apiKeys.length} API key(s)`
        );

        // Initialize key status and clients
        await this.initializeKeyStatus();
        await this.initializeClients();

        this.initialized = true;
        console.log("✅ OpenAI Service initialized successfully");

        return this;
      } catch (error) {
        console.error(
          "❌ OpenAI Service initialization failed:",
          error.message
        );
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }
  /**
   * Initialize key status tracking
   */
  async initializeKeyStatus() {
    this.apiKeys.forEach((key, index) => {
      this.keyStatus.set(index, {
        active: true,
        lastError: null,
        errorCount: 0,
        successCount: 0,
        lastUsed: null,
        quotaExceeded: false,
        totalTokensUsed: 0,
        lastSuccess: null,
        retryAfter: null,
      });
    });
  }

  /**
   * Initialize OpenAI clients for each key
   */
  async initializeClients() {
    this.apiKeys.forEach((key, index) => {
      try {
        this.clients.set(
          index,
          new OpenAI({
            apiKey: key,
            maxRetries: 0, // We handle retries ourselves
            timeout: 30000,
          })
        );
      } catch (error) {
        console.error(
          `Failed to initialize client for key ${index}:`,
          error.message
        );
        // Mark key as inactive
        const status = this.keyStatus.get(index);
        status.active = false;
        status.lastError = error;
        this.keyStatus.set(index, status);
      }
    });
  }

  /**
   * Ensure service is initialized before use
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKeys || this.apiKeys.length === 0) {
      throw new Error("OpenAI Service: No API keys available");
    }
  }

  /**
   * Get current active client
   */
  getCurrentClient() {
    if (!this.clients.has(this.currentKeyIndex)) {
      throw new Error(
        `No client available for key index ${this.currentKeyIndex}`
      );
    }
    return this.clients.get(this.currentKeyIndex);
  }

  /**
   * Get current key status
   */
  getCurrentKeyStatus() {
    return this.keyStatus.get(this.currentKeyIndex) || { active: false };
  }

  /**
   * Mark a key as failed and handle rotation
   */
  markKeyFailed(keyIndex, error) {
    const now = Date.now();
    const status = this.keyStatus.get(keyIndex) || {
      active: true,
      lastError: null,
      errorCount: 0,
      successCount: 0,
      lastUsed: null,
      quotaExceeded: false,
    };

    status.active = false;
    status.lastError = error;
    status.errorCount += 1;
    status.lastUsed = now;

    // Check error type
    const errorMessage = error.message || error.toString();
    const statusCode = error.status || error.code;

    if (
      statusCode === 429 ||
      errorMessage.includes("quota") ||
      errorMessage.includes("insufficient_quota") ||
      errorMessage.includes("rate limit") ||
      errorMessage.includes("billing")
    ) {
      status.quotaExceeded = true;
      console.log(`⛔ Key ${keyIndex}: Quota/Rate limit exceeded`);
    } else if (statusCode === 401 || errorMessage.includes("invalid api key")) {
      status.quotaExceeded = true; // Treat as permanent failure
      console.log(`🔐 Key ${keyIndex}: Invalid API key`);
    } else {
      console.log(
        `⚠️ Key ${keyIndex}: Failed - ${errorMessage.substring(0, 100)}`
      );
    }

    this.keyStatus.set(keyIndex, status);

    // Switch to next key if needed
    if (keyIndex === this.currentKeyIndex) {
      this.switchToNextKey();
    }
  }

  /**
   * Mark a key as successful
   */
  markKeySuccess(keyIndex) {
    const now = Date.now();
    const status = this.keyStatus.get(keyIndex) || {
      active: true,
      lastError: null,
      errorCount: 0,
      successCount: 0,
      lastUsed: null,
      quotaExceeded: false,
    };

    status.successCount += 1;
    status.lastUsed = now;
    status.lastSuccess = now;
    status.errorCount = Math.max(0, status.errorCount - 0.5); // Gradual recovery

    // Reactivate if it was temporarily disabled (but not quota exceeded)
    if (!status.active && !status.quotaExceeded && status.errorCount < 3) {
      status.active = true;
      console.log(`🔄 Key ${keyIndex}: Reactivated after success`);
    }

    this.keyStatus.set(keyIndex, status);
  }

  /**
   * Switch to the next available key
   */
  switchToNextKey() {
    const now = Date.now();

    // Rate limit key switching
    if (now - this.lastKeySwitch < this.MIN_SWITCH_INTERVAL) {
      return false;
    }

    const originalIndex = this.currentKeyIndex;
    let attempts = 0;
    const maxAttempts = this.apiKeys.length * 2;

    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      attempts++;

      const status = this.keyStatus.get(this.currentKeyIndex);

      if (status?.active && !status?.quotaExceeded) {
        const timeSinceLastError = status.lastError
          ? now - status.lastError
          : Infinity;

        // Don't switch back to a key that just failed (1 minute cooldown)
        if (timeSinceLastError > 60000) {
          this.lastKeySwitch = now;
          console.log(`🔄 Switched to Key ${this.currentKeyIndex}`);
          return true;
        }
      }

      if (attempts >= maxAttempts) {
        // Try to reactivate some keys
        this.reactivateInactiveKeys();
        attempts = 0;
      }
    } while (this.currentKeyIndex !== originalIndex && attempts < maxAttempts);

    console.error("❌ No active OpenAI API keys available");
    return false;
  }

  /**
   * Reactivate temporarily disabled keys
   */
  reactivateInactiveKeys() {
    const now = Date.now();
    const COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes

    this.keyStatus.forEach((status, keyIndex) => {
      if (!status.active && !status.quotaExceeded) {
        const timeSinceError = status.lastError
          ? now - status.lastError
          : Infinity;

        if (timeSinceError > COOLDOWN_PERIOD) {
          status.active = true;
          status.errorCount = 0;
          console.log(`♻️ Key ${keyIndex}: Reactivated after cooldown`);
          this.keyStatus.set(keyIndex, status);
        }
      }
    });
  }

  /**
   * Get status of all keys
   */
  getAllKeyStatus() {
    if (!this.apiKeys) return [];

    const status = [];
    this.apiKeys.forEach((key, index) => {
      const keyStatus = this.keyStatus.get(index) || {
        active: true,
        errorCount: 0,
        successCount: 0,
        quotaExceeded: false,
      };
      status.push({
        index,
        maskedKey: `${key.substring(0, 7)}...${key.substring(key.length - 4)}`,
        active: keyStatus.active,
        quotaExceeded: keyStatus.quotaExceeded,
        errorCount: keyStatus.errorCount,
        successCount: keyStatus.successCount,
        lastUsed: keyStatus.lastUsed
          ? new Date(keyStatus.lastUsed).toISOString()
          : null,
        lastError: keyStatus.lastError ? keyStatus.lastError.message : null,
      });
    });
    return status;
  }

  /**
   * Count active keys
   */
  getActiveKeyCount() {
    if (!this.apiKeys) return 0;

    let count = 0;
    this.keyStatus.forEach((status) => {
      if (status.active && !status.quotaExceeded) {
        count++;
      }
    });
    return count;
  }

  /**
   * Make an OpenAI request with automatic retry and key rotation
   */
  async makeRequest(requestFn, options = {}) {
    await this.ensureInitialized();

    const maxRetries = options.maxRetries || this.apiKeys.length * 2;
    const retryDelay = options.retryDelay || 1000;
    let retryCount = 0;
    let lastError;

    while (retryCount < maxRetries) {
      const currentKeyIndex = this.currentKeyIndex;
      const currentClient = this.getCurrentClient();
      const keyStatus = this.getCurrentKeyStatus();

      // Skip if current key is not active
      if (!keyStatus.active || keyStatus.quotaExceeded) {
        this.switchToNextKey();
        retryCount++;
        continue;
      }

      try {
        const result = await Promise.race([
          requestFn(currentClient),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), 30000)
          ),
        ]);

        this.markKeySuccess(currentKeyIndex);
        return result;
      } catch (error) {
        lastError = error;

        console.error(`OpenAI Request Failed (Key ${currentKeyIndex}):`, {
          error: error.message,
          status: error.status,
          type: error.type,
          attempt: retryCount + 1,
        });

        this.markKeyFailed(currentKeyIndex, error);

        // Check if we have any active keys left
        if (this.getActiveKeyCount() === 0) {
          throw new Error(
            "All OpenAI API keys are exhausted. Please add more keys or check billing."
          );
        }

        // Exponential backoff with jitter
        const jitter = Math.random() * 500;
        const delay =
          Math.min(retryDelay * Math.pow(2, retryCount), 10000) + jitter;

        if (retryCount < maxRetries - 1) {
          console.log(
            `⏳ Retrying in ${Math.round(delay / 1000)}s... (Attempt ${
              retryCount + 2
            }/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        retryCount++;
      }
    }

    throw lastError || new Error("OpenAI request failed after all retries");
  }

  /**
   * OpenAI Chat Completion wrapper
   */
  async chatCompletion(messages, options = {}) {
    return this.makeRequest(async (client) => {
      return client.chat.completions.create({
        model: options.model || "gpt-4o-mini",
        messages,
        temperature: options.temperature || 0.2,
        max_tokens: options.max_tokens || 2000,
        ...options,
      });
    }, options);
  }

  /**
   * OpenAI Responses API wrapper
   */
  async responsesCreate(input, options = {}) {
    return this.makeRequest(async (client) => {
      return client.responses.create({
        model: options.model || "gpt-4.1-mini",
        input,
        max_output_tokens: options.max_output_tokens || 2000,
        ...options,
      });
    }, options);
  }

  /**
   * Health check for OpenAI service
   */
  async healthCheck() {
    try {
      await this.ensureInitialized();

      const status = {
        initialized: this.initialized,
        totalKeys: this.apiKeys.length,
        activeKeys: this.getActiveKeyCount(),
        currentKeyIndex: this.currentKeyIndex,
        keyDetails: this.getAllKeyStatus(),
        timestamp: new Date().toISOString(),
      };

      return {
        healthy: status.activeKeys > 0,
        status,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Manually switch to a specific key (for testing)
   */
  setCurrentKey(index) {
    if (index >= 0 && index < this.apiKeys.length) {
      this.currentKeyIndex = index;
      this.lastKeySwitch = Date.now();
      console.log(`🔧 Manually switched to Key ${index}`);
      return true;
    }
    return false;
  }

  /**
   * Reset a key's status (for testing/recovery)
   */
  resetKey(index) {
    if (index >= 0 && index < this.apiKeys.length) {
      this.keyStatus.set(index, {
        active: true,
        lastError: null,
        errorCount: 0,
        successCount: 0,
        lastUsed: null,
        quotaExceeded: false,
      });
      console.log(`🔄 Reset Key ${index} status`);
      return true;
    }
    return false;
  }
}

// Export singleton instance
module.exports = new OpenAIService();
