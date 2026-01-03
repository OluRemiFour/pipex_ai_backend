// src/services/analysisService.js - CREATE THIS FILE
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../../.env"),
});

const axios = require("axios");
const OpenAI = require("openai");
const Issue = require("../models/Issue");
const Repository = require("../models/Repository");
const User = require("../models/User");
const auditService = require("./auditService"); // ADD THIS

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("🔑 OpenAI API Key loaded:", !!process.env.OPENAI_API_KEY);

class AnalysisService {
  constructor() {
    this.MAX_FILES_PER_BATCH = 8; // Increased from 10 to 8 for better analysis
    this.SUPPORTED_EXTENSIONS = [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".py",
      ".java",
      ".go",
      ".rb",
      ".php",
      ".cs",
      ".cpp",
      ".c",
      ".h",
      ".yml",
      ".yaml",
      ".json",
      ".md",
      ".env.example",
    ];
  }

  /**
   * Analyze a repository for issues
   */
  async analyzeRepository(repositoryId, userId) {
    try {
      console.log(`🔍 Starting analysis for repository: ${repositoryId}`);

      // Get repository and user
      const repository = await Repository.findById(repositoryId);
      const user = await User.findById(userId);

      if (!repository || !user) {
        throw new Error("Repository or user not found");
      }

      if (!user.githubAccessToken) {
        throw new Error("GitHub not connected");
      }

      // Update repository status
      repository.analysisStatus = "analyzing";
      await repository.save();

      // Step 1: Get repository files
      console.log("📁 Fetching repository files...");
      const files = await this.getRepositoryFiles(
        repository.repoOwner,
        repository.repoName,
        user.githubAccessToken
      );

      console.log(`✅ Found ${files.length} files to analyze`);

      // Step 2: Filter and prioritize files
      const filesToAnalyze = this.filterFiles(files);
      console.log(`🎯 Selected ${filesToAnalyze.length} files for analysis`);
      console.log(
        `📄 Files to analyze:`,
        filesToAnalyze.map((f) => f.path).join(", ")
      );

      if (filesToAnalyze.length === 0) {
        console.warn(
          "⚠️ No files selected for analysis - repo might only have excluded files"
        );

        // Update repository status
        repository.analysisStatus = "completed";
        repository.lastAnalyzedAt = new Date();
        await repository.save();

        return {
          success: true,
          issuesFound: 0,
          critical: 0,
          issues: [],
        };
      }

      // Step 3: Batch process files
      const allIssues = [];
      const batchSize = this.MAX_FILES_PER_BATCH;

      for (let i = 0; i < filesToAnalyze.length; i += batchSize) {
        const batch = filesToAnalyze.slice(i, i + batchSize);
        console.log(
          `🔄 Analyzing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
            filesToAnalyze.length / batchSize
          )}`
        );

        // Get file contents
        const filesWithContent = await Promise.all(
          batch.map((file) =>
            this.getFileContent(
              repository.repoOwner,
              repository.repoName,
              file.path,
              user.githubAccessToken
            )
          )
        );

        // Analyze with AI
        const batchIssues = await this.analyzeFilesWithAI(
          filesWithContent,
          repository
        );

        allIssues.push(...batchIssues);

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Step 4: Save issues to database
      console.log(`💾 Saving ${allIssues.length} issues to database...`);
      const savedIssues = await this.saveIssuesToDatabase(
        allIssues,
        repositoryId,
        userId
      );

      // Step 5: Update repository
      repository.analysisStatus = "completed";
      repository.lastAnalyzedAt = new Date();
      repository.stats.totalIssues = savedIssues.length;
      repository.stats.criticalIssues = savedIssues.filter(
        (i) => i.severity === "CRITICAL"
      ).length;
      await repository.save();

      console.log(`✅ Analysis complete! Found ${savedIssues.length} issues`);

      // Step 6: Log to audit trail
      await auditService.logAnalysis(userId, repositoryId, repository, {
        issuesFound: savedIssues.length,
        critical: repository.stats.criticalIssues,
        filesAnalyzed: filesToAnalyze.length,
      });

      return {
        success: true,
        issuesFound: savedIssues.length,
        critical: repository.stats.criticalIssues,
        issues: savedIssues,
      };
    } catch (error) {
      console.error("❌ Analysis failed:", error);

      // Update repository status
      try {
        const repository = await Repository.findById(repositoryId);
        if (repository) {
          repository.analysisStatus = "failed";
          await repository.save();
        }
      } catch (updateError) {
        console.error("Failed to update repository status:", updateError);
      }

      // Log error to audit trail
      await auditService.logError(
        userId,
        repositoryId,
        "Repository analysis",
        error
      );

      throw error;
    }
  }

  /**
   * Get all files from repository
   */
  async getRepositoryFiles(owner, repo, token, path = "") {
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

      let allFiles = [];

      for (const item of response.data) {
        if (item.type === "file") {
          allFiles.push({
            path: item.path,
            name: item.name,
            size: item.size,
            sha: item.sha,
            url: item.download_url,
          });
        } else if (item.type === "dir") {
          // Skip common directories that don't need analysis
          const skipDirs = [
            "node_modules",
            "dist",
            "build",
            ".git",
            "vendor",
            "__pycache__",
          ];
          if (!skipDirs.includes(item.name)) {
            const subFiles = await this.getRepositoryFiles(
              owner,
              repo,
              token,
              item.path
            );
            allFiles = allFiles.concat(subFiles);
          }
        }
      }

      return allFiles;
    } catch (error) {
      console.error("Error fetching repository files:", error.message);
      throw error;
    }
  }

  /**
   * Filter files to analyze
   */
  filterFiles(files) {
    return files
      .filter((file) => {
        // Check extension
        const ext = file.name.substring(file.name.lastIndexOf("."));
        if (!this.SUPPORTED_EXTENSIONS.includes(ext)) return false;

        // Skip very large files (>500KB)
        if (file.size > 500000) return false;

        return true;
      })
      .sort((a, b) => {
        // Prioritize main code files
        const priorities = {
          ".ts": 10,
          ".tsx": 10,
          ".js": 9,
          ".jsx": 9,
          ".py": 8,
          ".java": 7,
          ".go": 7,
          ".rb": 6,
          ".yml": 5,
          ".yaml": 5,
          ".json": 4,
          ".md": 3,
        };

        const extA = a.name.substring(a.name.lastIndexOf("."));
        const extB = b.name.substring(b.name.lastIndexOf("."));

        return (priorities[extB] || 0) - (priorities[extA] || 0);
      })
      .slice(0, 100); // Increased from 50 to 100 files maximum
  }

  /**
   * Get file content
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

      const content = Buffer.from(response.data.content, "base64").toString(
        "utf-8"
      );

      return {
        path,
        name: path.split("/").pop(),
        content,
        size: response.data.size,
      };
    } catch (error) {
      console.error(`Error fetching file ${path}:`, error.message);
      return null;
    }
  }

  /**
   * Analyze files with OpenAI
   */
  //   async analyzeFilesWithAI(files, repository) {
  //     const validFiles = files.filter((f) => f !== null);
  //     if (validFiles.length === 0) return [];

  //     const filesContext = validFiles.map((f) => ({
  //       path: f.path,
  //       name: f.name,
  //       content: f.content.substring(0, 4000), // Increased from 3000 to 4000 chars
  //     }));

  //     const prompt = `You are a critical code reviewer analyzing a ${
  //       repository.language || "code"
  //     } repository. You MUST find issues - no code is perfect.

  // Repository: ${repository.repoOwner}/${repository.repoName}
  // Language: ${repository.language || "Unknown"}

  // Files to analyze:
  // ${filesContext
  //   .map(
  //     (f, i) => `
  // File ${i + 1}: ${f.path}
  // \`\`\`
  // ${f.content}
  // \`\`\`
  // `
  //   )
  //   .join("\n")}

  // YOUR TASK: Find 3-8 issues per batch. Look for REAL problems:

  // **SECURITY (CRITICAL/HIGH):**
  // - Hardcoded secrets/credentials/API keys
  // - SQL injection vulnerabilities
  // - Missing input validation
  // - Insecure dependencies (check package.json)
  // - Exposed sensitive data
  // - Missing authentication/authorization
  // - XSS vulnerabilities

  // **BUGS (HIGH/MEDIUM):**
  // - Missing error handling (try-catch, .catch())
  // - Unhandled promise rejections
  // - Null/undefined reference errors
  // - Race conditions
  // - Off-by-one errors
  // - Incorrect logic
  // - Memory leaks

  // **CODE QUALITY (MEDIUM/LOW):**
  // - Complex functions (>50 lines)
  // - Duplicated code
  // - Poor naming (x, data, temp)
  // - Missing JSDoc/comments for complex logic
  // - Console.log statements in production
  // - Dead code
  // - Magic numbers

  // **PERFORMANCE (MEDIUM/LOW):**
  // - N+1 queries
  // - Blocking operations in loops
  // - Inefficient algorithms (O(n²))
  // - Missing pagination
  // - Large synchronous operations
  // - No caching

  // **CI/CD (MEDIUM/LOW):**
  // - Missing tests
  // - No error logging
  // - Missing health checks
  // - Hardcoded environment values
  // - No rate limiting

  // BE CRITICAL: Every file has issues. Look at:
  // - Variable names: Are they clear?
  // - Error handling: Is every async operation wrapped?
  // - Security: Any hardcoded values?
  // - Logic: Any edge cases missed?

  // Return JSON with "issues" array:
  // {
  //   "issues": [
  //     {
  //       "title": "Specific issue (max 80 chars)",
  //       "description": "Why this matters and what could go wrong (2-3 sentences)",
  //       "issueType": "security|performance|code-quality|bug|ci-cd",
  //       "severity": "CRITICAL|HIGH|MEDIUM|LOW",
  //       "filePath": "exact/path/from/above",
  //       "lineNumber": 25,
  //       "codeSnippet": "const x = await api();",
  //       "aiConfidence": 0.9,
  //       "aiExplanation": "Specific impact and risk",
  //       "suggestedFix": "Exact fix with code example"
  //     }
  //   ]
  // }

  // RULES:
  // - Find AT LEAST 3 issues, preferably 5-8
  // - Be specific - quote actual code
  // - Real line numbers where issues exist
  // - Actionable fixes
  // - Valid JSON only`;

  //     try {
  //       const response = await openai.chat.completions.create({
  //         model: "gpt-4o",
  //         messages: [
  //           {
  //             role: "system",
  //             content:
  //               "You are a strict senior code reviewer who finds issues in every codebase. NO CODE IS PERFECT. You must find at least 3-8 real issues per batch. Be critical but accurate. Look for security flaws, bugs, poor practices, and quality issues. Return valid JSON only.",
  //           },
  //           {
  //             role: "user",
  //             content: prompt,
  //           },
  //         ],
  //         temperature: 0.5, // Higher temperature for more thorough analysis
  //         max_tokens: 4000,
  //         response_format: { type: "json_object" },
  //       });

  //       const content = response.choices[0].message.content;

  //       console.log("🤖 Raw AI response:", content.substring(0, 500) + "...");

  //       // Parse the JSON response
  //       let parsedContent;
  //       try {
  //         parsedContent = JSON.parse(content);
  //       } catch (parseError) {
  //         console.error("❌ Failed to parse AI response:", content);
  //         console.error("Parse error:", parseError.message);
  //         return [];
  //       }

  //       // Extract issues array
  //       const issues = parsedContent.issues || [];

  //       if (issues.length === 0) {
  //         console.warn("⚠️ AI returned 0 issues - this is unusual");
  //         console.log("Full AI response:", parsedContent);
  //       } else {
  //         console.log(`🤖 AI found ${issues.length} issues in this batch`);

  //         // Validate each issue has required fields
  //         const validIssues = issues.filter((issue) => {
  //           const hasRequired =
  //             issue.title &&
  //             issue.description &&
  //             issue.issueType &&
  //             issue.severity &&
  //             issue.filePath;

  //           if (!hasRequired) {
  //             console.warn("⚠️ Skipping invalid issue:", issue);
  //           }

  //           return hasRequired;
  //         });

  //         console.log(`✅ ${validIssues.length} valid issues after validation`);
  //         return validIssues;
  //       }

  //       return issues;
  //     } catch (error) {
  //       console.error("❌ AI analysis failed:", error.message);
  //       if (error.response) {
  //         console.error("API error details:", error.response.data);
  //       }
  //       return [];
  //     }
  //   }
  async analyzeFilesWithAI(files, repository, globalIssueHash = new Set()) {
    const validFiles = files.filter(Boolean);
    if (validFiles.length === 0) return [];

    // ---------- TOKEN BUDGETING ----------
    // Target: ~6k tokens total input
    const MAX_CHARS_PER_FILE = 1200;
    const MAX_TOTAL_CHARS = 3500;

    let totalChars = 0;
    const trimmedFiles = [];

    for (const file of validFiles) {
      if (totalChars >= MAX_TOTAL_CHARS) break;

      const content = file.content.slice(0, MAX_CHARS_PER_FILE);
      totalChars += content.length;

      trimmedFiles.push({
        path: file.path,
        content,
      });
    }

    if (trimmedFiles.length === 0) return [];

    // ---------- PROMPT ----------
    const prompt = `
You are a senior security-focused code reviewer.

Repository: ${repository.repoOwner}/${repository.repoName}
Primary Language: ${repository.language || "Unknown"}

Files:
${trimmedFiles
  .map(
    (f, i) => `
[File ${i + 1}] ${f.path}
\`\`\`
${f.content}
\`\`\`
`
  )
  .join("\n")}

TASK:
Find REAL issues only. No filler.

Rules:
- Find 3–6 issues total
- Be specific, quote real code
- Use real file paths
- Use approximate line numbers
- Prefer SECURITY, BUGS, PERFORMANCE
- Do NOT invent dependencies

Return VALID JSON ONLY:

{
  "issues": [
    {
      "title": "Short precise title",
      "description": "Why this is a problem (2 sentences max)",
      "issueType": "security|bug|performance|code-quality|ci-cd",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "filePath": "path/from/above",
      "lineNumber": 42,
      "codeSnippet": "problematic code",
      "confidence": 0.0-1.0,
      "suggestedFix": "Concrete fix or example"
    }
  ]
}
`;

    // ---------- OPENAI CALL ----------
    let responseText;
    try {
      const response = await openai.responses.create({
        model: "gpt-4.1-mini", // best cost/quality for audits
        input: [
          {
            role: "system",
            content:
              "You are a strict senior engineer. You MUST find real issues. Return valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
        max_output_tokens: 2000,
      });

      responseText = response.output_text;
    } catch (err) {
      console.error("❌ OpenAI request failed:", err.message);
      throw new Error("AI analysis failed");
    }

    // ---------- PARSE & VALIDATE ----------
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      console.error("❌ Invalid JSON from AI:", responseText);
      throw new Error("AI returned invalid JSON");
    }

    if (!Array.isArray(parsed.issues) || parsed.issues.length === 0) {
      console.error("❌ AI returned no issues:", parsed);
      throw new Error("AI returned zero issues");
    }

    // ---------- NORMALIZE + DEDUP ----------
    const normalizedIssues = [];

    for (const issue of parsed.issues) {
      if (
        !issue.title ||
        !issue.filePath ||
        !issue.severity ||
        !issue.issueType
      ) {
        continue;
      }

      // Normalize confidence
      const confidence =
        typeof issue.confidence === "number"
          ? Math.min(Math.max(issue.confidence, 0.3), 0.95)
          : 0.6;

      // Dedup hash (cross-batch safe)
      const hash = `${issue.filePath}|${issue.title}`.toLowerCase();
      if (globalIssueHash.has(hash)) continue;

      globalIssueHash.add(hash);

      normalizedIssues.push({
        ...issue,
        confidence,
      });
    }

    return normalizedIssues;
  }

  /**
   * Save issues to database
   */
  async saveIssuesToDatabase(issues, repositoryId, userId) {
    const savedIssues = [];

    for (const issue of issues) {
      try {
        // Check if similar issue already exists
        const existingIssue = await Issue.findOne({
          repositoryId,
          filePath: issue.filePath,
          title: issue.title,
          status: { $ne: "resolved" },
        });

        if (existingIssue) {
          console.log(`⏭️ Skipping duplicate issue: ${issue.title}`);
          continue;
        }

        // Create new issue
        const newIssue = await Issue.create({
          repositoryId,
          userId,
          title: issue.title,
          description: issue.description,
          issueType: issue.issueType,
          severity: issue.severity,
          filePath: issue.filePath,
          lineNumber: issue.lineNumber,
          codeSnippet: issue.codeSnippet,
          aiConfidence: issue.aiConfidence,
          aiExplanation: issue.aiExplanation,
          suggestedFix: issue.suggestedFix,
          status: "detected",
        });

        savedIssues.push(newIssue);
      } catch (error) {
        console.error("Error saving issue:", error.message);
      }
    }

    return savedIssues;
  }
}

module.exports = new AnalysisService();
