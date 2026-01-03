// const express = require("express");
// const passport = require("passport");
// const GoogleStrategy = require("passport-google-oauth20").Strategy;
// const GitHubStrategy = require("passport-github2").Strategy;
// const jwt = require("jsonwebtoken"); // ADD THIS IMPORT
// const User = require("../models/User");
// const authMiddleware = require("../middleware/auth");
// const config = require("../config");

// const router = express.Router();

// // ==================== PASSPORT SETUP ====================

// // Google Strategy
// passport.use(
//   new GoogleStrategy(
//     {
//       clientID: config.googleClientId,
//       clientSecret: config.googleClientSecret,
//       callbackURL:
//         process.env.NODE_ENV === "production"
//           ? "https://pipex-ai-backend.onrender.com/api/auth/google/callback"
//           : "http://localhost:4000/api/auth/google/callback",
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         let user = await User.findOne({ googleId: profile.id });

//         if (!user) {
//           user = await User.findOne({ email: profile.emails[0].value });

//           if (user) {
//             user.googleId = profile.id;
//             user.avatar = profile.photos[0].value;
//             await user.save();
//           } else {
//             user = await User.create({
//               googleId: profile.id,
//               email: profile.emails[0].value,
//               name: profile.displayName,
//               avatar: profile.photos[0].value,
//               lastLoginAt: new Date(),
//             });
//           }
//         } else {
//           user.lastLoginAt = new Date();
//           await user.save();
//         }

//         return done(null, user);
//       } catch (error) {
//         return done(error, null);
//       }
//     }
//   )
// );

// // GitHub Strategy
// passport.use(
//   "github-connect",
//   new GitHubStrategy(
//     {
//       clientID: config.githubClientId,
//       clientSecret: config.githubClientSecret,
//       callbackURL:
//         process.env.NODE_ENV === "production"
//           ? "https://pipex-ai-backend.onrender.com/api/auth/github/callback"
//           : "http://localhost:4000/api/auth/github/callback",
//       scope: ["repo", "read:user"],
//     },
//     async (accessToken, refreshToken, profile, done) => {
//       try {
//         return done(null, {
//           accessToken,
//           refreshToken,
//           githubId: profile.id,
//           githubUsername: profile.username,
//         });
//       } catch (error) {
//         return done(error, null);
//       }
//     }
//   )
// );

// // Serialize/Deserialize
// passport.serializeUser((user, done) => {
//   done(null, user.id || user._id);
// });

// passport.deserializeUser(async (id, done) => {
//   try {
//     const user = await User.findById(id);
//     done(null, user);
//   } catch (error) {
//     done(error, null);
//   }
// });

// // ==================== MIDDLEWARE ====================

// // Token verification for GitHub routes (simplified)
// const verifyTokenForGitHub = (req, res, next) => {
//   const token = req.query.token; // Get token from query parameter

//   if (!token) {
//     return res
//       .status(401)
//       .json({ error: "No token provided. Add ?token=YOUR_JWT to URL" });
//   }

//   try {
//     const decoded = jwt.verify(token, config.jwtSecret);
//     req.userId = decoded.userId;
//     next();
//   } catch (error) {
//     console.error("Token verification failed:", error.message);
//     return res.status(401).json({ error: "Invalid or expired token" });
//   }
// };

// // ==================== ROUTES ====================

// // 1. Google OAuth
// router.get(
//   "/google",
//   passport.authenticate("google", {
//     scope: ["profile", "email"],
//     prompt: "select_account",
//   })
// );

// router.get(
//   "/google/callback",
//   passport.authenticate("google", {
//     failureRedirect: `${config.frontendUrl}/?error=auth_failed`,
//     session: false,
//   }),
//   async (req, res) => {
//     try {
//       const token = authMiddleware.generateToken(req.user._id);
//       res.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
//     } catch (error) {
//       console.error("Google callback error:", error);
//       res.redirect(`${config.frontendUrl}/?error=callback_failed`);
//     }
//   }
// );

// // 2. GitHub OAuth - SIMPLIFIED VERSION
// router.get(
//   "/github/connect",
//   verifyTokenForGitHub, // Uses query parameter token
//   async (req, res, next) => {
//     try {
//       // Store userId in session for callback
//       req.session.userId = req.userId;
//       console.log("🔗 GitHub connect for user:", req.userId);
//       next();
//     } catch (error) {
//       console.error("GitHub connect setup error:", error);
//       return res
//         .status(500)
//         .json({ error: "Failed to setup GitHub connection" });
//     }
//   },
//   passport.authenticate("github-connect", {
//     scope: ["repo", "read:user"],
//     session: false,
//   })
// );

// router.get(
//   "/github/callback",
//   passport.authenticate("github-connect", {
//     failureRedirect: `${config.frontendUrl}/dashboard?error=github_auth_failed`,
//     session: false,
//   }),
//   async (req, res) => {
//     try {
//       const { accessToken, refreshToken, githubId, githubUsername } = req.user;
//       const userId = req.session.userId;

//       if (!userId) {
//         throw new Error("User session expired. Please try again.");
//       }

//       await User.findByIdAndUpdate(userId, {
//         githubAccessToken: accessToken,
//         githubRefreshToken: refreshToken,
//         githubUserId: githubId,
//         githubUsername: githubUsername,
//         isGitHubConnected: true,
//         updatedAt: new Date(),
//       });

//       // Clear session
//       delete req.session.userId;

//       res.redirect(
//         `${config.frontendUrl}/dashboard?github_connected=true&username=${githubUsername}`
//       );
//     } catch (error) {
//       console.error("GitHub callback error:", error);
//       res.redirect(`${config.frontendUrl}/dashboard?error=github_save_failed`);
//     }
//   }
// );

// // 3. User Management
// router.get("/me", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     const user = await User.findById(req.userId).select(
//       "-githubAccessToken -githubRefreshToken"
//     );

//     if (!user) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     res.json({ user });
//   } catch (error) {
//     console.error("Get user error:", error);
//     res.status(500).json({ error: "Failed to fetch user data" });
//   }
// });

// router.get("/github/status", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     const user = await User.findById(req.userId).select(
//       "isGitHubConnected githubUsername"
//     );
//     res.json({
//       isConnected: user.isGitHubConnected,
//       githubUsername: user.githubUsername,
//     });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to check GitHub status" });
//   }
// });

// router.post(
//   "/github/disconnect",
//   authMiddleware.verifyToken,
//   async (req, res) => {
//     try {
//       await User.findByIdAndUpdate(req.userId, {
//         githubAccessToken: null,
//         githubRefreshToken: null,
//         githubUsername: null,
//         githubUserId: null,
//         isGitHubConnected: false,
//         updatedAt: new Date(),
//       });

//       res.json({ success: true, message: "GitHub disconnected successfully" });
//     } catch (error) {
//       res.status(500).json({ error: "Failed to disconnect GitHub" });
//     }
//   }
// );

// // In src/routes/auth.js - SIMPLE WORKING VERSION
// router.get(
//   "/github/connect",
//   (req, res, next) => {
//     console.log("🔐 GitHub connect request received");
//     console.log("🔐 Query params:", req.query);

//     const token = req.query.token;

//     if (!token) {
//       console.error("❌ No token provided");
//       return res
//         .status(401)
//         .json({ error: "No authentication token provided" });
//     }

//     console.log("✅ Token received, length:", token.length);

//     try {
//       // Verify the token
//       const jwt = require("jsonwebtoken");
//       const config = require("../config");

//       const decoded = jwt.verify(token, config.jwtSecret);
//       const userId = decoded.userId;

//       console.log("✅ Token valid for user:", userId);

//       // Store userId in session
//       req.session.userId = userId;
//       console.log("✅ UserId stored in session:", req.session.userId);

//       // Continue to GitHub OAuth
//       next();
//     } catch (jwtError) {
//       console.error("❌ Token verification failed:", jwtError.message);
//       return res.status(401).json({ error: "Invalid or expired token" });
//     }
//   },
//   passport.authenticate("github-connect", {
//     scope: ["repo", "read:user"],
//     session: false,
//   })
// );

// // 4. Logout
// router.post("/logout", authMiddleware.verifyToken, (req, res) => {
//   res.json({ success: true, message: "Logged out successfully" });
// });

// // 5. Debug endpoint
// router.get("/debug/config", (req, res) => {
//   res.json({
//     frontendUrl: config.frontendUrl,
//     hasGoogleClientId: !!config.googleClientId,
//     hasGitHubClientId: !!config.githubClientId,
//     nodeEnv: config.nodeEnv,
//     githubCallbackUrl:
//       process.env.NODE_ENV === "production"
//         ? "https://pipex-ai-backend.onrender.com/api/auth/github/callback"
//         : "http://localhost:4000/api/auth/github/callback",
//   });
// });

// module.exports = router;

// src/routes/auth.js - FIXED VERSION
const express = require("express");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const config = require("../config");

const router = express.Router();

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate a secure OAuth state token with userId embedded
 */
const generateStateToken = (userId) => {
  const state = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();

  return {
    plain: state,
    encoded: jwt.sign(
      {
        state: state,
        userId: userId,
        timestamp: timestamp,
      },
      config.jwtSecret,
      { expiresIn: "15m" } // Increased to 15 minutes for reliability
    ),
  };
};

/**
 * Validate state token
 */
const validateStateToken = (token, expectedState) => {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    // Check if token is expired (15 minutes)
    const tokenAge = Date.now() - decoded.timestamp;
    if (tokenAge > 15 * 60 * 1000) {
      return { valid: false, reason: "expired", age: tokenAge };
    }

    // Check if state matches
    if (expectedState !== decoded.state) {
      return { valid: false, reason: "mismatch", decoded: decoded };
    }

    return { valid: true, decoded: decoded };
  } catch (error) {
    return { valid: false, reason: "invalid", error: error.message };
  }
};

// ==================== PASSPORT SETUP ====================

// Google Strategy (keep as is)
passport.use(
  new GoogleStrategy(
    {
      clientID: config.googleClientId,
      clientSecret: config.googleClientSecret,
      callbackURL: `${
        config.nodeEnv === "production"
          ? "https://pipex-ai-backend.onrender.com"
          : "http://localhost:4000"
      }/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log("🔐 Google OAuth profile received:", profile.id);

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = await User.findOne({ email: profile.emails[0].value });

          if (user) {
            user.googleId = profile.id;
            user.avatar = profile.photos[0]?.value;
            await user.save();
            console.log(
              "✅ Linked Google account to existing user:",
              user.email
            );
          } else {
            user = await User.create({
              googleId: profile.id,
              email: profile.emails[0].value,
              name: profile.displayName,
              avatar: profile.photos[0]?.value,
              lastLoginAt: new Date(),
            });
            console.log("✅ Created new user:", user.email);
          }
        } else {
          user.lastLoginAt = new Date();
          await user.save();
          console.log("✅ Updated last login for:", user.email);
        }

        return done(null, user);
      } catch (error) {
        console.error("❌ Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id || user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// ==================== ROUTES ====================

// 1. GOOGLE OAUTH
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${config.frontendUrl}/?error=google_auth_failed`,
    session: false,
  }),
  async (req, res) => {
    try {
      console.log("✅ Google OAuth successful for user:", req.user.email);

      const token = authMiddleware.generateToken(req.user._id);
      console.log("✅ Generated JWT token");

      res.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error("❌ Google callback error:", error);
      res.redirect(`${config.frontendUrl}/?error=callback_failed`);
    }
  }
);

// 2. GITHUB OAUTH - FIXED VERSION
// Step 1: User clicks "Connect GitHub" - Extract userId from JWT token in query param
router.get("/github/connect", async (req, res) => {
  try {
    console.log("🔗 GitHub connect initiated");

    // Get token from query parameter
    const token =
      req.query.token || req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      console.error("❌ No token provided");
      return res.redirect(`${config.frontendUrl}/dashboard?error=no_token`);
    }

    // Verify and decode the token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
      console.log("✅ Token verified, userId:", decoded.userId);
    } catch (err) {
      console.error("❌ Invalid token:", err.message);
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=invalid_token`
      );
    }

    const userId = decoded.userId;

    // Generate secure state token with embedded userId
    const stateToken = generateStateToken(userId);

    // Store state in HTTP-only cookie
    res.cookie("github_oauth_state", stateToken.encoded, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: config.nodeEnv === "production" ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    });

    console.log("✅ State token created and stored in cookie");

    // Construct GitHub OAuth URL
    const githubAuthUrl = `https://github.com/login/oauth/authorize?${new URLSearchParams(
      {
        client_id: config.githubClientId,
        redirect_uri: `${
          config.nodeEnv === "production"
            ? "https://pipex-ai-backend.onrender.com"
            : "http://localhost:4000"
        }/api/auth/github/callback`,
        scope: "repo read:user user:email",
        state: stateToken.plain,
        allow_signup: "true",
      }
    ).toString()}`;

    console.log("🔗 Redirecting to GitHub OAuth");
    res.redirect(githubAuthUrl);
  } catch (error) {
    console.error("❌ GitHub connect error:", error);
    res.redirect(
      `${
        config.frontendUrl
      }/dashboard?error=github_connect_failed&message=${encodeURIComponent(
        error.message
      )}`
    );
  }
});

// Step 2: GitHub redirects back to this callback
router.get("/github/callback", async (req, res) => {
  try {
    console.log("🔄 GitHub callback received");
    console.log("📊 Query params:", req.query);

    const { code, state } = req.query;

    // Validate required parameters
    if (!code) {
      console.error("❌ No authorization code received");
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=github_no_code`
      );
    }

    if (!state) {
      console.error("❌ No state parameter received");
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=github_no_state`
      );
    }

    // Get state token from cookie
    const stateToken = req.cookies.github_oauth_state;

    if (!stateToken) {
      console.error("❌ No state token in cookies");
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=github_invalid_state&reason=no_cookie`
      );
    }

    // Validate state token
    const validation = validateStateToken(stateToken, state);

    if (!validation.valid) {
      console.error("❌ State validation failed:", validation.reason);
      res.clearCookie("github_oauth_state", { path: "/" });
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=github_invalid_state&reason=${validation.reason}`
      );
    }

    console.log("✅ State validated, userId:", validation.decoded.userId);

    const userId = validation.decoded.userId;

    // Exchange code for access token
    console.log("🔄 Exchanging code for access token...");

    const tokenResponse = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: config.githubClientId,
        client_secret: config.githubClientSecret,
        code: code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    const tokenData = tokenResponse.data;

    if (tokenData.error) {
      console.error("❌ GitHub token error:", tokenData);
      return res.redirect(
        `${
          config.frontendUrl
        }/dashboard?error=github_token_error&message=${encodeURIComponent(
          tokenData.error_description || tokenData.error
        )}`
      );
    }

    if (!tokenData.access_token) {
      console.error("❌ No access token received:", tokenData);
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=github_no_token`
      );
    }

    console.log("✅ Access token received");

    // Get GitHub user info
    console.log("🔄 Fetching GitHub user info...");

    const userResponse = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Pipex-AI-DevOps",
      },
    });

    const githubUser = userResponse.data;
    console.log("✅ GitHub user:", githubUser.login);

    // Update user in database
    console.log("🔄 Updating user in database...");
    console.log("📋 User ID:", userId);
    console.log("📋 GitHub User ID:", githubUser.id);
    console.log("📋 GitHub Username:", githubUser.login);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        githubAccessToken: tokenData.access_token,
        githubRefreshToken: tokenData.refresh_token,
        githubUserId: githubUser.id,
        githubUsername: githubUser.login,
        isGitHubConnected: true,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedUser) {
      console.error("❌ User not found:", userId);
      return res.redirect(
        `${config.frontendUrl}/dashboard?error=user_not_found`
      );
    }

    console.log("✅ User updated in database");
    console.log("✅ Updated user details:", {
      id: updatedUser._id,
      email: updatedUser.email,
      isGitHubConnected: updatedUser.isGitHubConnected,
      githubUsername: updatedUser.githubUsername,
      hasToken: !!updatedUser.githubAccessToken,
    });

    // Clear the state cookie
    res.clearCookie("github_oauth_state", { path: "/" });

    // Success - redirect to dashboard
    const redirectUrl = `${config.frontendUrl}/dashboard?github_connected=true&username=${githubUser.login}`;
    console.log("✅ Redirecting to:", redirectUrl);

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ GitHub callback error:", error);

    if (error.response) {
      console.error("📋 Error response data:", error.response.data);
      console.error("📋 Error response status:", error.response.status);
    }

    res.clearCookie("github_oauth_state", { path: "/" });

    const errorMessage = encodeURIComponent(
      error.response?.data?.message || error.message || "Unknown error"
    );

    res.redirect(
      `${config.frontendUrl}/dashboard?error=github_connection_failed&message=${errorMessage}`
    );
  }
});

// 3. USER MANAGEMENT ENDPOINTS
router.get("/me", authMiddleware.verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "-githubAccessToken -githubRefreshToken"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      user: {
        ...user.toObject(),
        hasGitHubToken: !!user.githubAccessToken,
      },
    });
  } catch (error) {
    console.error("❌ Get user error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user data",
    });
  }
});

router.get("/github/status", authMiddleware.verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "isGitHubConnected githubUsername"
    );

    res.json({
      success: true,
      isConnected: user?.isGitHubConnected || false,
      githubUsername: user?.githubUsername || null,
    });
  } catch (error) {
    console.error("❌ GitHub status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check GitHub status",
    });
  }
});

router.post(
  "/github/disconnect",
  authMiddleware.verifyToken,
  async (req, res) => {
    try {
      await User.findByIdAndUpdate(req.userId, {
        githubAccessToken: null,
        githubRefreshToken: null,
        githubUsername: null,
        githubUserId: null,
        isGitHubConnected: false,
        updatedAt: new Date(),
      });

      res.json({
        success: true,
        message: "GitHub disconnected successfully",
      });
    } catch (error) {
      console.error("❌ GitHub disconnect error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to disconnect GitHub",
      });
    }
  }
);

router.post("/logout", authMiddleware.verifyToken, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = router;
