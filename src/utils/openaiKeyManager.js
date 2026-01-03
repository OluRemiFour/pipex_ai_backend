const OpenAI = require("openai");

const keys = process.env.OPENAI_API_KEYS?.split(",")
  .map((k) => k.trim())
  .filter(Boolean);

if (!keys || keys.length === 0) {
  throw new Error("❌ No OpenAI API keys found");
}

let index = 0;

function getClient() {
  const key = keys[index];
  return new OpenAI({ apiKey: key });
}

function rotateKey() {
  index = (index + 1) % keys.length;
  console.warn(`🔁 Rotating OpenAI key → index ${index}`);
}

function isQuotaError(err) {
  return (
    err?.status === 429 ||
    err?.error?.code === "insufficient_quota" ||
    err?.message?.includes("quota")
  );
}

module.exports = {
  getClient,
  rotateKey,
  isQuotaError,
};
