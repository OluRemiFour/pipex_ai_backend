// const mongoose = require("mongoose");

// const UserSchema = new mongoose.Schema({
//   // Google OAuth fields
//   googleId: {
//     type: String,
//     unique: true,
//     sparse: true,
//   },
//   email: {
//     type: String,
//     required: true,
//     unique: true,
//     lowercase: true,
//   },
//   name: {
//     type: String,
//     required: true,
//   },
//   avatar: {
//     type: String,
//   },

//   // GitHub Integration
//   githubAccessToken: {
//     type: String,
//     select: false, // Don't return in queries by default
//   },
//   githubRefreshToken: {
//     type: String,
//     select: false,
//   },
//   githubUsername: String,
//   githubUserId: String,

//   // App State
//   isGitHubConnected: {
//     type: Boolean,
//     default: false,
//   },
//   onboardingCompleted: {
//     type: Boolean,
//     default: false,
//   },

//   // Timestamps
//   lastLoginAt: Date,
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// // Update timestamp on save
// UserSchema.pre("save", function (next) {
//   this.updatedAt = Date.now();
//   next();
// });

// module.exports = mongoose.model("User", UserSchema);

// Make sure your User model (src/models/User.js) has these fields:

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Google OAuth
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },

    // Basic info
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    avatar: {
      type: String,
    },

    // GitHub OAuth - MAKE SURE THESE EXIST
    githubId: {
      type: String,
      sparse: true,
      index: true,
    },
    githubUserId: {
      type: Number,
      sparse: true,
    },
    githubUsername: {
      type: String,
      sparse: true,
    },
    githubAccessToken: {
      type: String,
    },
    githubRefreshToken: {
      type: String,
    },
    isGitHubConnected: {
      type: Boolean,
      default: false,
    },

    // Timestamps
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ githubUserId: 1 });

const User = mongoose.model("User", userSchema);

module.exports = User;
