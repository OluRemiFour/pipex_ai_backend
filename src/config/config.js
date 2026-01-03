// src/config.js
// require("dotenv").config();

// const config = {
//   // Server
//   port: process.env.PORT || 4000,
//   nodeEnv: process.env.NODE_ENV || "development",
//   frontendUrl: process.env.FRONTEND_URL || "https://pipex-ai.vercel.app",

//   // Database
//   mongoUri: process.env.MONGODB_URI,

//   // Authentication
//   jwtSecret: process.env.JWT_SECRET,
//   jwtExpiry: "7d",

//   // Google OAuth
//   googleClientId: process.env.GOOGLE_CLIENT_ID,
//   googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
//   googleCallbackUrl: "/api/auth/google/callback",

//   // GitHub OAuth
//   githubClientId: process.env.GITHUB_CLIENT_ID,
//   githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
//   githubCallbackUrl:
//     process.env.GITHUB_CALLBACK_URL || "/api/auth/github/callback",
//   githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET, // ADD THIS

//   // APIs
//   openaiApiKey: process.env.OPENAI_API_KEY, // ADD THIS

//   // CORS
//   corsOptions: {
//     origin: function (origin, callback) {
//       const allowedOrigins = [
//         "http://localhost:5173",
//         "https://pipex-ai.vercel.app",
//       ];

//       if (!origin || allowedOrigins.indexOf(origin) !== -1) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true,
//     optionsSuccessStatus: 200,
//   },
// };

// // Validate required environment variables
// const requiredVars = [
//   "MONGODB_URI",
//   "JWT_SECRET",
//   "GOOGLE_CLIENT_ID",
//   "GOOGLE_CLIENT_SECRET",
//   "GITHUB_CLIENT_ID",
//   "GITHUB_CLIENT_SECRET",
//   "OPENAI_API_KEY",
//   "GITHUB_WEBHOOK_SECRET", // ADD THIS
// ];

// requiredVars.forEach((varName) => {
//   if (!process.env[varName]) {
//     console.error(`❌ Missing required environment variable: ${varName}`);
//     process.exit(1);
//   }
// });

// module.exports = config;

require("dotenv").config();

const config = {
  // Server
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendUrl: process.env.FRONTEND_URL || "https://pipex-ai.vercel.app",

  // Database
  mongoUri: process.env.MONGODB_URI,

  // Authentication
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiry: "7d",

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl: "/api/auth/google/callback",

  // GitHub OAuth
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  githubCallbackUrl:
    process.env.GITHUB_CALLBACK_URL || "/api/auth/github/callback",
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET,

  // OpenAI - Multiple API keys for rotation
  openaiApiKeys: process.env.OPENAI_API_KEYS
    ? process.env.OPENAI_API_KEYS.split(",").map((key) => key.trim())
    : [process.env.OPENAI_API_KEY].filter(Boolean),

  // CORS
  corsOptions: {
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",
        "https://pipex-ai.vercel.app",
      ];

      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  },
};

// Validate required environment variables
const requiredVars = [
  "MONGODB_URI",
  "JWT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GITHUB_WEBHOOK_SECRET",
  // REMOVE "OPENAI_API_KEY" from required vars
];

// ✅ FIXED: Check if we have OpenAI keys (either multiple or single)
if (config.openaiApiKeys.length === 0) {
  console.error("❌ Missing OpenAI API keys. Please set either:");
  console.error("   - OPENAI_API_KEYS=key1,key2,key3 (multiple keys)");
  console.error("   - OR OPENAI_API_KEY=single-key (single key)");
  process.exit(1);
}

// Log OpenAI key status for debugging
console.log(`✅ Loaded ${config.openaiApiKeys.length} OpenAI API key(s)`);
console.log(`   First key: ${config.openaiApiKeys[0].substring(0, 8)}...`);

requiredVars.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`❌ Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

module.exports = config;
