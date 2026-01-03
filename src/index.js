require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const passport = require("passport");
const session = require("express-session");
const config = require("./config");
const cookieParser = require("cookie-parser");
const express = require("express");

// Import routes
const authRoutes = require("./routes/auth");
const repositoriesRoutes = require("./routes/repositories");
const issuesRoutes = require("./routes/issues"); // ADD THIS
const pullRequestsRoutes = require("./routes/pullRequests"); // ADD THIS
const webhooksRoutes = require("./routes/webhooks"); // ADD THIS
const auditRoutes = require("./routes/audit"); // ADD THIS

const app = express();
app.use(cookieParser());
app.use(cors(config.corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(passport.initialize());
// ==================== MIDDLEWARE ====================

// Security headers
app.use(helmet());

// CORS
app.use(cors(config.corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use("/api/", limiter);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Session for OAuth (minimal, just for GitHub flow)
app.use(
  session({
    secret: config.jwtSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: config.nodeEnv === "production",
      maxAge: 30 * 60 * 1000, // 30 minutes
    },
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// ==================== DATABASE CONNECTION ====================

mongoose
  .connect(config.mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connected to MongoDB");
  })
  .catch((error) => {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  });

// ==================== ROUTES ====================

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    service: "Piper-AI Backend",
  });
});

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/repositories", repositoriesRoutes); // ADD THIS LINE
app.use("/api/issues", issuesRoutes); // ADD THIS
app.use("/api/pull-requests", pullRequestsRoutes); // ADD THIS
app.use("/api/webhooks", webhooksRoutes); // ADD THIS
app.use("/api/audit", auditRoutes); // ADD THIS

// TODO: Add other routes here
// app.use('/api/repositories', require('./routes/repositories'));
// app.use('/api/analysis', require('./routes/analysis'));
// app.use('/api/webhooks', require('./routes/webhooks'));

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(err.status || 500).json({
    error:
      config.nodeEnv === "production" ? "Internal server error" : err.message,
  });
});

// ==================== START SERVER ====================

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Frontend URL: ${config.frontendUrl}`);
});
