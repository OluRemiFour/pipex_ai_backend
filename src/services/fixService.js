const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const axios = require("axios");
const openaiService = require("./openaiService"); // Changed from direct OpenAI import
const Issue = require("../models/Issue");
const PullRequest = require("../models/PullRequest");
const Repository = require("../models/Repository");
const User = require("../models/User");
const auditService = require("./auditService");

class FixService {
  /**
   * Generate fix for an issue and create PR
   */
  async fixIssue(issueId, userId) {
    try {
      console.log(`🔧 Starting fix generation for issue: ${issueId}`);
      console.log("OpenAI Key Status:", openaiService.getAllKeyStatus());

      // Get issue details
      const issue = await Issue.findById(issueId);
      if (!issue) {
        throw new Error("Issue not found");
      }

      if (issue.status !== "detected") {
        throw new Error(
          `Issue already being processed. Status: ${issue.status}`
        );
      }

      // Get repository and user
      const repository = await Repository.findById(issue.repositoryId);
      const user = await User.findById(userId);

      if (!repository || !user || !user.githubAccessToken) {
        throw new Error("Repository or GitHub connection not found");
      }

      // Update issue status
      issue.status = "fix-generated";
      issue.fixAttempts += 1;
      await issue.save();

      // Step 1: Get current file content
      console.log("📄 Fetching current file content...");
      const fileContent = await this.getFileContent(
        repository.repoOwner,
        repository.repoName,
        issue.filePath,
        user.githubAccessToken
      );

      // Step 2: Generate fix with AI
      console.log("🤖 Generating fix with AI...");
      const fixedContent = await this.generateFixWithAI(
        fileContent,
        issue,
        repository
      );

      if (!fixedContent || fixedContent === fileContent) {
        throw new Error("AI could not generate a valid fix");
      }

      // Step 3: Create new branch
      console.log("🌿 Creating new branch...");
      const branchName = `pipex-ai/fix-${issue._id.toString().substring(0, 8)}`;
      await this.createBranch(
        repository.repoOwner,
        repository.repoName,
        branchName,
        user.githubAccessToken
      );

      // Step 4: Commit fix
      console.log("💾 Committing fix...");
      await this.commitFile(
        repository.repoOwner,
        repository.repoName,
        issue.filePath,
        fixedContent,
        branchName,
        `Fix: ${issue.title}`,
        user.githubAccessToken
      );

      // Step 5: Create Pull Request
      console.log("🔀 Creating pull request...");
      const prData = await this.createPullRequest(
        repository.repoOwner,
        repository.repoName,
        branchName,
        issue,
        user.githubAccessToken
      );

      // Step 6: Save PR to database
      const pullRequest = await PullRequest.create({
        repositoryId: repository._id,
        userId: user._id,
        issueId: issue._id,
        githubPrId: prData.id,
        prNumber: prData.number,
        title: prData.title,
        body: prData.body,
        url: prData.html_url,
        branch: branchName,
        status: "open",
        reviewStatus: "pending",
        aiGenerated: true,
        riskLevel: this.calculateRiskLevel(issue.severity),
        changesSummary: `Fixed ${issue.issueType} issue in ${issue.filePath}`,
      });

      // Update issue with PR info
      issue.status = "pr-created";
      issue.pullRequestId = pullRequest._id;
      await issue.save();

      console.log(`✅ Fix complete! PR #${prData.number} created`);

      // Log to audit trail
      await auditService.logFixGeneration(userId, repository._id, issue, {
        prNumber: prData.number,
        prUrl: prData.html_url,
        pullRequest,
      });

      await auditService.logPRCreation(
        userId,
        repository._id,
        pullRequest,
        issue
      );

      return {
        success: true,
        pullRequest,
        prNumber: prData.number,
        prUrl: prData.html_url,
      };
    } catch (error) {
      console.error("❌ Fix generation failed:", error);

      // Update issue status back to detected
      try {
        const issue = await Issue.findById(issueId);
        if (issue && issue.status === "fix-generated") {
          issue.status = "detected";
          await issue.save();
        }
      } catch (updateError) {
        console.error("Failed to update issue status:", updateError);
      }

      // Log error to audit trail
      const issue = await Issue.findById(issueId);
      if (issue) {
        await auditService.logError(
          userId,
          issue.repositoryId,
          `Fix generation for issue: ${issue.title}`,
          error
        );
      }

      throw error;
    }
  }

  /**
   * Get file content from GitHub
   */
  async getFileContent(owner, repo, path, token) {
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      return Buffer.from(response.data.content, "base64").toString("utf-8");
    } catch (error) {
      console.error(`Error fetching file ${path}:`, error.message);
      throw new Error(`Failed to fetch file: ${error.message}`);
    }
  }

  /**
   * Generate fix using OpenAI
   */
  async generateFixWithAI(originalContent, issue, repository) {
    const prompt = `You are an expert software engineer. Fix the following issue in this code file.

Repository: ${repository.repoOwner}/${repository.repoName}
Language: ${repository.language || "Unknown"}
File: ${issue.filePath}

Issue Details:
- Title: ${issue.title}
- Type: ${issue.issueType}
- Severity: ${issue.severity}
- Description: ${issue.description}
- Line Number: ${issue.lineNumber || "Unknown"}
- AI Explanation: ${issue.aiExplanation}
- Suggested Fix: ${issue.suggestedFix}

Current File Content:
\`\`\`
${originalContent}
\`\`\`

TASK: Fix the issue in the code above. Return ONLY the complete fixed file content, nothing else.

Requirements:
1. Fix ONLY the specific issue mentioned
2. Maintain all existing functionality
3. Keep the same coding style and formatting
4. Don't add comments explaining the fix
5. Ensure the fix is production-ready
6. Return the COMPLETE file with the fix applied

Return ONLY the fixed code, no explanations, no markdown formatting, just the raw code.`;

    try {
      const response = await openaiService.chatCompletion(
        [
          {
            role: "system",
            content:
              "You are an expert software engineer. Return ONLY the fixed code, no explanations.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        {
          model: "gpt-4.1-mini",
          temperature: 0.2,
          max_tokens: 3000,
        }
      );

      let fixedContent = response.choices[0].message.content.trim();

      // Remove markdown code blocks if AI added them
      fixedContent = fixedContent
        .replace(/^```[a-z]*\n/i, "")
        .replace(/\n```$/i, "");

      console.log("✅ AI generated fix successfully");
      return fixedContent;
    } catch (error) {
      console.error("❌ AI fix generation failed:", error.message);

      // Check if it's a quota error
      if (error.message.includes("quota") || error.status === 429) {
        throw new Error(
          "All OpenAI API keys have exceeded quota. Please add more keys."
        );
      }

      throw new Error(`AI fix generation failed: ${error.message}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(owner, repo, branchName, token) {
    try {
      // Get the default branch SHA
      const repoResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      const defaultBranch = repoResponse.data.default_branch;

      // Get the SHA of the default branch
      const branchResponse = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      const sha = branchResponse.data.object.sha;

      // Create new branch
      await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
          ref: `refs/heads/${branchName}`,
          sha: sha,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      console.log(`✅ Created branch: ${branchName}`);
    } catch (error) {
      if (error.response?.status === 422) {
        console.log(`ℹ️ Branch ${branchName} already exists`);
      } else {
        console.error("Error creating branch:", error.message);
        throw new Error(`Failed to create branch: ${error.message}`);
      }
    }
  }

  /**
   * Commit file to branch
   */
  async commitFile(owner, repo, path, content, branch, message, token) {
    try {
      // Get current file SHA (needed for update)
      let sha = null;
      try {
        const fileResponse = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
              "User-Agent": "Pipex-AI-DevOps",
            },
          }
        );
        sha = fileResponse.data.sha;
      } catch (error) {
        // File doesn't exist on this branch yet
        console.log("File doesn't exist on branch yet, will create new");
      }

      // Create or update file
      const commitData = {
        message: message,
        content: Buffer.from(content).toString("base64"),
        branch: branch,
      };

      if (sha) {
        commitData.sha = sha;
      }

      await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        commitData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      console.log(`✅ Committed file: ${path}`);
    } catch (error) {
      console.error("Error committing file:", error.message);
      throw new Error(`Failed to commit file: ${error.message}`);
    }
  }

  /**
   * Create Pull Request
   */
  async createPullRequest(owner, repo, branch, issue, token) {
    try {
      const title = `🤖 AI Fix: ${issue.title}`;
      const body = `## 🤖 Automated Fix by Pipex AI

### Issue Details
- **Type:** ${issue.issueType}
- **Severity:** ${issue.severity}
- **File:** ${issue.filePath}
${issue.lineNumber ? `- **Line:** ${issue.lineNumber}` : ""}

### Problem
${issue.description}

### AI Analysis
${issue.aiExplanation}

### Solution Applied
${issue.suggestedFix}

### Risk Assessment
- **Risk Level:** ${this.calculateRiskLevel(issue.severity)}
- **AI Confidence:** ${Math.round((issue.aiConfidence || 0.85) * 100)}%

---
**⚠️ Please review carefully before merging**

This fix was automatically generated by Pipex AI DevOps. While our AI is highly accurate, human review is always recommended for production code.

🔗 [View Issue Details](#)`;

      const response = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/pulls`,
        {
          title: title,
          body: body,
          head: branch,
          base: "main", // TODO: Get default branch dynamically
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Pipex-AI-DevOps",
          },
        }
      );

      console.log(`✅ Created PR #${response.data.number}`);

      return response.data;
    } catch (error) {
      console.error(
        "Error creating PR:",
        error.response?.data || error.message
      );
      throw new Error(
        `Failed to create PR: ${error.response?.data?.message || error.message}`
      );
    }
  }

  /**
   * Calculate risk level based on severity
   */
  calculateRiskLevel(severity) {
    switch (severity) {
      case "CRITICAL":
      case "HIGH":
        return "HIGH";
      case "MEDIUM":
        return "MEDIUM";
      case "LOW":
      default:
        return "LOW";
    }
  }
}

module.exports = new FixService();
