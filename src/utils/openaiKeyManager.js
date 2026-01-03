// const path = require("path");

// require("dotenv").config({
//   path: path.resolve(__dirname, "../../.env"),
// });

// const OpenAI = require("openai");

// const keys = process.env.OPENAI_API_KEY?.split(",")
//   .map((k) => k.trim())
//   .filter(Boolean);

// if (!keys || keys.length === 0) {
//   throw new Error("❌ No OpenAI API keys found in OPENAI_API_KEYS");
// }

// let index = 0;

// function getClient() {
//   return new OpenAI({ apiKey: keys[index] });
// }

// function rotateKey() {
//   index = (index + 1) % keys.length;
//   console.warn(`🔁 Rotated OpenAI key → ${index + 1}/${keys.length}`);
// }

// function isQuotaError(err) {
//   return (
//     err?.status === 429 ||
//     err?.error?.code === "insufficient_quota" ||
//     err?.message?.toLowerCase().includes("quota")
//   );
// }

// function getKeyCount() {
//   return keys.length;
// }

// module.exports = {
//   getClient,
//   rotateKey,
//   isQuotaError,
//   getKeyCount,
// };
