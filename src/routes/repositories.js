// const express = require("express");
// const User = require("../models/User");
// const Repository = require("../models/Repository");
// const GitHubService = require("../services/github");
// const authMiddleware = require("../middleware/auth");

// const router = express.Router();

// // Get user's GitHub repositories
// router.get("/", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     // Get user with GitHub token
//     const user = await User.findById(req.userId).select("githubAccessToken");

//     if (!user || !user.githubAccessToken) {
//       return res.status(400).json({
//         error:
//           "GitHub not connected. Please connect your GitHub account first.",
//       });
//     }

//     // Initialize GitHub service
//     const githubService = new GitHubService(user.githubAccessToken);

//     // Fetch repositories from GitHub
//     const githubRepos = await githubService.listRepositories({
//       visibility: "all",
//       per_page: 50,
//     });

//     // Transform GitHub repos to our format
//     const repositories = githubRepos.map((repo) => ({
//       githubRepoId: repo.id,
//       name: repo.name,
//       owner: repo.owner.login,
//       fullName: repo.full_name,
//       url: repo.html_url,
//       isPrivate: repo.private,
//       description: repo.description || "",
//       language: repo.language,
//       stars: repo.stargazers_count,
//       forks: repo.forks_count,
//       openIssues: repo.open_issues_count,
//       defaultBranch: repo.default_branch,
//       createdAt: repo.created_at,
//       updatedAt: repo.updated_at,
//     }));

//     // Save/update in database
//     for (const repoData of repositories) {
//       await Repository.findOneAndUpdate(
//         {
//           userId: req.userId,
//           fullName: repoData.fullName,
//         },
//         {
//           ...repoData,
//           userId: req.userId,
//         },
//         {
//           upsert: true,
//           new: true,
//         }
//       );
//     }

//     // Return user's repositories from our database
//     const userRepos = await Repository.find({ userId: req.userId }).sort({
//       updatedAt: -1,
//     });

//     res.json({
//       success: true,
//       repositories: userRepos,
//       count: userRepos.length,
//     });
//   } catch (error) {
//     console.error("Fetch repositories error:", error);
//     res.status(500).json({
//       error: error.message || "Failed to fetch repositories",
//     });
//   }
// });

// // Get single repository
// router.get("/:repoId", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     const repository = await Repository.findOne({
//       _id: req.params.repoId,
//       userId: req.userId,
//     });

//     if (!repository) {
//       return res.status(404).json({ error: "Repository not found" });
//     }

//     res.json({ repository });
//   } catch (error) {
//     console.error("Get repository error:", error);
//     res.status(500).json({ error: "Failed to fetch repository" });
//   }
// });

// // Sync single repository from GitHub
// router.post(
//   "/:owner/:repo/sync",
//   authMiddleware.verifyToken,
//   async (req, res) => {
//     try {
//       const { owner, repo } = req.params;

//       // Get user with GitHub token
//       const user = await User.findById(req.userId).select("githubAccessToken");

//       if (!user || !user.githubAccessToken) {
//         return res.status(400).json({
//           error: "GitHub not connected",
//         });
//       }

//       // Initialize GitHub service
//       const githubService = new GitHubService(user.githubAccessToken);

//       // Fetch repository from GitHub
//       const githubRepo = await githubService.getRepository(owner, repo);

//       // Save to database
//       const repositoryData = {
//         githubRepoId: githubRepo.id,
//         name: githubRepo.name,
//         owner: githubRepo.owner.login,
//         fullName: githubRepo.full_name,
//         url: githubRepo.html_url,
//         isPrivate: githubRepo.private,
//         description: githubRepo.description || "",
//         language: githubRepo.language,
//         stars: githubRepo.stargazers_count,
//         forks: githubRepo.forks_count,
//         openIssues: githubRepo.open_issues_count,
//         defaultBranch: githubRepo.default_branch,
//       };

//       const repository = await Repository.findOneAndUpdate(
//         {
//           userId: req.userId,
//           fullName: repositoryData.fullName,
//         },
//         {
//           ...repositoryData,
//           userId: req.userId,
//         },
//         {
//           upsert: true,
//           new: true,
//         }
//       );

//       res.json({
//         success: true,
//         message: "Repository synced successfully",
//         repository,
//       });
//     } catch (error) {
//       console.error("Sync repository error:", error);
//       res.status(500).json({
//         error: error.message || "Failed to sync repository",
//       });
//     }
//   }
// );

// // Update repository settings
// router.patch("/:repoId", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     const { isActive } = req.body;

//     const repository = await Repository.findOneAndUpdate(
//       {
//         _id: req.params.repoId,
//         userId: req.userId,
//       },
//       {
//         isActive,
//         updatedAt: new Date(),
//       },
//       { new: true }
//     );

//     if (!repository) {
//       return res.status(404).json({ error: "Repository not found" });
//     }

//     res.json({
//       success: true,
//       message: "Repository updated successfully",
//       repository,
//     });
//   } catch (error) {
//     console.error("Update repository error:", error);
//     res.status(500).json({ error: "Failed to update repository" });
//   }
// });

// // Delete repository from monitoring
// router.delete("/:repoId", authMiddleware.verifyToken, async (req, res) => {
//   try {
//     const repository = await Repository.findOneAndDelete({
//       _id: req.params.repoId,
//       userId: req.userId,
//     });

//     if (!repository) {
//       return res.status(404).json({ error: "Repository not found" });
//     }

//     res.json({
//       success: true,
//       message: "Repository removed from monitoring",
//     });
//   } catch (error) {
//     console.error("Delete repository error:", error);
//     res.status(500).json({ error: "Failed to delete repository" });
//   }
// });

// module.exports = router;

// src/routes/repositories.js - CREATE THIS NEW FILE
const express = require("express");
const axios = require("axios");
const User = require("../models/User");
const Repository = require("../models/Repository"); // You'll need to create this model
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// ==================== REPOSITORY ROUTES ====================

/**
 * GET /api/repositories
 * Get all repositories for the authenticated user
 */
router.get("/", authMiddleware.verifyToken, async (req, res) => {
  try {
    console.log("📋 Fetching repositories for user:", req.userId);

    // Get user to check GitHub connection
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if GitHub is connected
    if (!user.isGitHubConnected || !user.githubAccessToken) {
      console.log("ℹ️ GitHub not connected for user");
      return res.json({
        success: true,
        repositories: [],
        message: "GitHub not connected",
      });
    }

    // Fetch repositories from database
    const repositories = await Repository.find({ userId: req.userId }).sort({
      createdAt: -1,
    });

    console.log(`✅ Found ${repositories.length} repositories in database`);

    // If no repositories in DB, sync from GitHub
    if (repositories.length === 0) {
      console.log("🔄 No repositories in DB, syncing from GitHub...");

      try {
        // Fetch repos from GitHub
        const githubRepos = await axios.get(
          "https://api.github.com/user/repos",
          {
            headers: {
              Authorization: `Bearer ${user.githubAccessToken}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "Pipex-AI-DevOps",
            },
            params: {
              sort: "updated",
              per_page: 100,
            },
          }
        );

        console.log(`✅ Fetched ${githubRepos.data.length} repos from GitHub`);

        // Save repos to database
        const savedRepos = [];
        for (const repo of githubRepos.data) {
          const newRepo = await Repository.create({
            userId: req.userId,
            repoName: repo.name,
            repoOwner: repo.owner.login,
            repoUrl: repo.html_url,
            platform: "github",
            language: repo.language,
            isActive: true,
            githubId: repo.id,
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
            description: repo.description,
          });
          savedRepos.push(newRepo);
        }

        console.log(`✅ Saved ${savedRepos.length} repos to database`);

        return res.json({
          success: true,
          repositories: savedRepos,
          synced: true,
        });
      } catch (githubError) {
        console.error(
          "❌ GitHub API error:",
          githubError.response?.data || githubError.message
        );

        // Return empty array if GitHub sync fails
        return res.json({
          success: true,
          repositories: [],
          error: "Failed to sync from GitHub",
        });
      }
    }

    res.json({
      success: true,
      repositories,
    });
  } catch (error) {
    console.error("❌ Get repositories error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch repositories",
      details: error.message,
    });
  }
});

/**
 * POST /api/repositories/sync
 * Sync all repositories from GitHub
 */
router.post("/sync", authMiddleware.verifyToken, async (req, res) => {
  try {
    console.log("🔄 Syncing repositories for user:", req.userId);

    const user = await User.findById(req.userId);

    if (!user || !user.isGitHubConnected || !user.githubAccessToken) {
      return res.status(400).json({
        success: false,
        error: "GitHub not connected",
      });
    }

    // Fetch repos from GitHub
    const githubRepos = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${user.githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "Pipex-AI-DevOps",
      },
      params: {
        sort: "updated",
        per_page: 100,
      },
    });

    console.log(`✅ Fetched ${githubRepos.data.length} repos from GitHub`);

    const syncedRepos = [];
    const errors = [];

    for (const repo of githubRepos.data) {
      try {
        // Check if repo already exists
        let existingRepo = await Repository.findOne({
          userId: req.userId,
          githubId: repo.id,
        });

        if (existingRepo) {
          // Update existing repo
          existingRepo.repoName = repo.name;
          existingRepo.repoOwner = repo.owner.login;
          existingRepo.repoUrl = repo.html_url;
          existingRepo.language = repo.language;
          existingRepo.defaultBranch = repo.default_branch;
          existingRepo.description = repo.description;
          existingRepo.isPrivate = repo.private;
          existingRepo.updatedAt = new Date();
          await existingRepo.save();
          syncedRepos.push(existingRepo);
        } else {
          // Create new repo
          const newRepo = await Repository.create({
            userId: req.userId,
            repoName: repo.name,
            repoOwner: repo.owner.login,
            repoUrl: repo.html_url,
            platform: "github",
            language: repo.language,
            isActive: true,
            githubId: repo.id,
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
            description: repo.description,
          });
          syncedRepos.push(newRepo);
        }
      } catch (repoError) {
        console.error(`❌ Error syncing repo ${repo.name}:`, repoError);
        errors.push({ repo: repo.name, error: repoError.message });
      }
    }

    console.log(`✅ Synced ${syncedRepos.length} repositories`);

    res.json({
      success: true,
      repositories: syncedRepos,
      synced: syncedRepos.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("❌ Sync repositories error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to sync repositories",
      details: error.response?.data?.message || error.message,
    });
  }
});

/**
 * POST /api/repositories/:owner/:repo/sync
 * Sync a single repository
 */
router.post(
  "/:owner/:repo/sync",
  authMiddleware.verifyToken,
  async (req, res) => {
    try {
      const { owner, repo } = req.params;
      console.log(`🔄 Syncing repository: ${owner}/${repo}`);

      const user = await User.findById(req.userId);

      if (!user || !user.isGitHubConnected || !user.githubAccessToken) {
        return res.status(400).json({
          success: false,
          error: "GitHub not connected",
        });
      }

      // Fetch specific repo from GitHub
      const githubRepo = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${user.githubAccessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      const repoData = githubRepo.data;

      // Update or create repo in database
      let repository = await Repository.findOne({
        userId: req.userId,
        githubId: repoData.id,
      });

      if (repository) {
        repository.repoName = repoData.name;
        repository.repoOwner = repoData.owner.login;
        repository.repoUrl = repoData.html_url;
        repository.language = repoData.language;
        repository.defaultBranch = repoData.default_branch;
        repository.description = repoData.description;
        repository.isPrivate = repoData.private;
        repository.updatedAt = new Date();
        await repository.save();
      } else {
        repository = await Repository.create({
          userId: req.userId,
          repoName: repoData.name,
          repoOwner: repoData.owner.login,
          repoUrl: repoData.html_url,
          platform: "github",
          language: repoData.language,
          isActive: true,
          githubId: repoData.id,
          defaultBranch: repoData.default_branch,
          isPrivate: repoData.private,
          description: repoData.description,
        });
      }

      console.log(`✅ Synced repository: ${owner}/${repo}`);

      res.json({
        success: true,
        repository,
      });
    } catch (error) {
      console.error("❌ Sync repository error:", error);
      res.status(500).json({
        success: false,
        error: "Failed to sync repository",
        details: error.response?.data?.message || error.message,
      });
    }
  }
);

/**
 * PATCH /api/repositories/:id
 * Update repository settings
 */
router.patch("/:id", authMiddleware.verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log(`🔄 Updating repository ${id}:`, updates);

    // Find repository and verify ownership
    const repository = await Repository.findOne({
      _id: id,
      userId: req.userId,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: "Repository not found",
      });
    }

    // Update allowed fields
    const allowedUpdates = ["isActive", "framework", "description"];
    allowedUpdates.forEach((field) => {
      if (updates[field] !== undefined) {
        repository[field] = updates[field];
      }
    });

    repository.updatedAt = new Date();
    await repository.save();

    console.log(`✅ Updated repository: ${repository.repoName}`);

    res.json({
      success: true,
      repository,
    });
  } catch (error) {
    console.error("❌ Update repository error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update repository",
      details: error.message,
    });
  }
});

/**
 * DELETE /api/repositories/:id
 * Delete a repository from tracking
 */
router.delete("/:id", authMiddleware.verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`🗑️ Deleting repository ${id}`);

    const repository = await Repository.findOneAndDelete({
      _id: id,
      userId: req.userId,
    });

    if (!repository) {
      return res.status(404).json({
        success: false,
        error: "Repository not found",
      });
    }

    console.log(`✅ Deleted repository: ${repository.repoName}`);

    res.json({
      success: true,
      message: "Repository deleted successfully",
    });
  } catch (error) {
    console.error("❌ Delete repository error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete repository",
      details: error.message,
    });
  }
});

module.exports = router;
