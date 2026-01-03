// const mongoose = require("mongoose");

// const RepositorySchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "User",
//     required: true,
//   },
//   githubRepoId: {
//     type: Number,
//     required: true,
//   },
//   name: {
//     type: String,
//     required: true,
//   },
//   owner: {
//     type: String,
//     required: true,
//   },
//   fullName: {
//     type: String,
//     required: true,
//   },
//   url: {
//     type: String,
//     required: true,
//   },
//   isPrivate: Boolean,
//   description: String,
//   language: String,
//   stars: Number,
//   forks: Number,
//   openIssues: Number,

//   // DevOps Analysis Fields
//   lastAnalyzedAt: Date,
//   analysisStatus: {
//     type: String,
//     enum: ["pending", "analyzing", "completed", "failed"],
//     default: "pending",
//   },
//   issuesCount: {
//     type: Number,
//     default: 0,
//   },

//   // Monitoring
//   isActive: {
//     type: Boolean,
//     default: true,
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now,
//   },
//   updatedAt: {
//     type: Date,
//     default: Date.now,
//   },
// });

// // Compound index for fast queries
// RepositorySchema.index({ userId: 1, fullName: 1 }, { unique: true });

// module.exports = mongoose.model("Repository", RepositorySchema);

// src/models/Repository.js - CREATE THIS NEW FILE
const mongoose = require("mongoose");

const repositorySchema = new mongoose.Schema(
  {
    // User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Repository basic info
    repoName: {
      type: String,
      required: true,
    },
    repoOwner: {
      type: String,
      required: true,
    },
    repoUrl: {
      type: String,
      required: true,
    },

    // Platform info
    platform: {
      type: String,
      enum: ["github", "gitlab", "bitbucket"],
      default: "github",
    },
    githubId: {
      type: Number,
      index: true,
    },

    // Repository details
    language: {
      type: String,
    },
    framework: {
      type: String,
    },
    description: {
      type: String,
    },
    defaultBranch: {
      type: String,
      default: "main",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },

    // Monitoring status
    isActive: {
      type: Boolean,
      default: true,
    },

    // Analysis tracking
    lastAnalyzedAt: {
      type: Date,
    },
    analysisStatus: {
      type: String,
      enum: ["pending", "analyzing", "completed", "failed"],
      default: "pending",
    },

    // Stats (optional, for future use)
    stats: {
      totalIssues: { type: Number, default: 0 },
      criticalIssues: { type: Number, default: 0 },
      openPRs: { type: Number, default: 0 },
      lastCommitAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
repositorySchema.index({ userId: 1, githubId: 1 }, { unique: true });
repositorySchema.index({ userId: 1, isActive: 1 });
repositorySchema.index({ userId: 1, repoOwner: 1, repoName: 1 });

const Repository = mongoose.model("Repository", repositorySchema);

module.exports = Repository;
