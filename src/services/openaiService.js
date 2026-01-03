// src/services/openaiService.js
const OpenAI = require("openai");
const config = require("../config");

class OpenAIService {
  constructor() {
    this.apiKeys = config.openaiApiKeys;
    this.currentKeyIndex = 0;
    this.keyStatus = new Map();
    this.rateLimits = new Map();
    this.initializeKeyStatus();
    this.clients = new Map();
    this.initializeClients();
  }

  initializeKeyStatus() {
    // Initialize all keys as active
    this.apiKeys.forEach((key, index) => {
      this.keyStatus.set(index, {
        active: true,
        lastError: null,
        errorCount: 0,
        successCount: 0,
        lastUsed: null,
        quotaExceeded: false,
      });
    });
  }

  initializeClients() {
    this.apiKeys.forEach((key, index) => {
      this.clients.set(
        index,
        new OpenAI({
          apiKey: key,
          maxRetries: 2,
          timeout: 30000,
        })
      );
    });
  }

  getCurrentKeyIndex() {
    return this.currentKeyIndex;
  }

  getCurrentClient() {
    return this.clients.get(this.currentKeyIndex);
  }

  getCurrentKey() {
    return this.apiKeys[this.currentKeyIndex];
  }

  markKeyFailed(keyIndex, error) {
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
    status.lastUsed = new Date();

    // Check if it's a quota exceeded error
    if (
      error?.status === 429 ||
      error?.code === "insufficient_quota" ||
      (error?.message && error.message.includes("quota"))
    ) {
      status.quotaExceeded = true;
      console.log(`❌ OpenAI Key ${keyIndex}: Quota exceeded. Disabling.`);
    } else {
      console.log(
        `⚠️ OpenAI Key ${keyIndex}: Failed with error: ${error.message}`
      );
    }

    this.keyStatus.set(keyIndex, status);

    // Try to switch to next key
    this.switchToNextKey();
  }

  markKeySuccess(keyIndex) {
    const status = this.keyStatus.get(keyIndex) || {
      active: true,
      lastError: null,
      errorCount: 0,
      successCount: 0,
      lastUsed: null,
      quotaExceeded: false,
    };

    status.successCount += 1;
    status.lastUsed = new Date();
    status.errorCount = Math.max(0, status.errorCount - 1); // Reduce error count on success

    // Reactivate if it was marked inactive but not due to quota
    if (!status.active && !status.quotaExceeded) {
      status.active = true;
      console.log(`✅ Reactivating OpenAI Key ${keyIndex} after success`);
    }

    this.keyStatus.set(keyIndex, status);
  }

  switchToNextKey() {
    const originalIndex = this.currentKeyIndex;
    let attempts = 0;

    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      attempts++;

      const status = this.keyStatus.get(this.currentKeyIndex);

      if (status?.active && !status?.quotaExceeded) {
        console.log(`🔄 Switched to OpenAI Key ${this.currentKeyIndex}`);
        return true;
      }

      // If we've tried all keys, check if we should reactivate any
      if (attempts >= this.apiKeys.length) {
        this.reactivateInactiveKeys();
        attempts = 0;
      }
    } while (
      this.currentKeyIndex !== originalIndex &&
      attempts < this.apiKeys.length * 2
    );

    console.error("❌ No active OpenAI API keys available");
    return false;
  }

  reactivateInactiveKeys() {
    const now = new Date();
    const COOLDOWN_PERIOD = 5 * 60 * 1000; // 5 minutes

    this.keyStatus.forEach((status, keyIndex) => {
      if (!status.active && !status.quotaExceeded) {
        const timeSinceError = now - (status.lastUsed || 0);

        if (timeSinceError > COOLDOWN_PERIOD) {
          status.active = true;
          status.errorCount = 0;
          console.log(`♻️ Reactivating OpenAI Key ${keyIndex} after cooldown`);
          this.keyStatus.set(keyIndex, status);
        }
      }
    });
  }

  getAllKeyStatus() {
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
        maskedKey: `${key.substring(0, 8)}...${key.substring(key.length - 4)}`,
        active: keyStatus.active,
        quotaExceeded: keyStatus.quotaExceeded,
        errorCount: keyStatus.errorCount,
        successCount: keyStatus.successCount,
        lastUsed: keyStatus.lastUsed,
      });
    });
    return status;
  }

  getActiveKeyCount() {
    let count = 0;
    this.keyStatus.forEach((status) => {
      if (status.active && !status.quotaExceeded) {
        count++;
      }
    });
    return count;
  }

  async makeRequest(requestFn) {
    const maxRetries = this.apiKeys.length * 2;
    let retryCount = 0;
    let lastError;

    while (retryCount < maxRetries) {
      const currentClient = this.getCurrentClient();
      const currentKeyIndex = this.getCurrentKeyIndex();

      try {
        const result = await requestFn(currentClient);
        this.markKeySuccess(currentKeyIndex);
        return result;
      } catch (error) {
        lastError = error;
        console.error(`OpenAI request failed (Key ${currentKeyIndex}):`, {
          error: error.message,
          status: error.status,
          code: error.code,
        });

        this.markKeyFailed(currentKeyIndex, error);

        // Check if we have any active keys left
        if (this.getActiveKeyCount() === 0) {
          throw new Error(
            "All OpenAI API keys have exceeded quota or are inactive"
          );
        }

        // Add exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));

        retryCount++;
      }
    }

    throw lastError || new Error("OpenAI request failed after all retries");
  }

  async chatCompletion(messages, options = {}) {
    return this.makeRequest(async (client) => {
      return client.chat.completions.create({
        model: options.model || "gpt-4o-mini",
        messages,
        temperature: options.temperature || 0.2,
        max_tokens: options.max_tokens || 2000,
        ...options,
      });
    });
  }

  async responsesCreate(input, options = {}) {
    return this.makeRequest(async (client) => {
      return client.responses.create({
        model: options.model || "gpt-4.1-mini",
        input,
        max_output_tokens: options.max_output_tokens || 2000,
        ...options,
      });
    });
  }
}

module.exports = new OpenAIService();
