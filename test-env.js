// test-env.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

console.log("=== ENVIRONMENT VARIABLES CHECK ===\n");

// Check OpenAI keys
console.log(
  "1. OPENAI_API_KEYS:",
  process.env.OPENAI_API_KEYS ? "SET" : "NOT SET"
);
console.log(
  "2. OPENAI_API_KEY:",
  process.env.OPENAI_API_KEY ? "SET" : "NOT SET"
);

if (process.env.OPENAI_API_KEYS) {
  const keys = process.env.OPENAI_API_KEYS.split(",").map((k) => k.trim());
  console.log(`\n✅ Found ${keys.length} keys in OPENAI_API_KEYS:`);
  keys.forEach((key, i) => {
    console.log(
      `   Key ${i + 1}: ${key.substring(0, 10)}...${key.substring(
        key.length - 4
      )}`
    );
  });
} else if (process.env.OPENAI_API_KEY) {
  console.log(
    `\n⚠️ Using single OPENAI_API_KEY: ${process.env.OPENAI_API_KEY.substring(
      0,
      10
    )}...`
  );
} else {
  console.log("\n❌ NO OpenAI keys found in environment!");
}

// Check other required variables
console.log("\n=== OTHER REQUIRED VARIABLES ===");
const required = [
  "MONGODB_URI",
  "JWT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];
required.forEach((varName) => {
  console.log(`${varName}:`, process.env[varName] ? "✓ SET" : "✗ MISSING");
});
