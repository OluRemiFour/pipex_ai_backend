// import express from "express";
// import fetch from "node-fetch";
// import PQueue from "p-queue";
// import dotenv from "dotenv";
// import cors from "cors";

// dotenv.config();
// const app = express();
// app.use(express.json());

// app.use(
//   cors({
//     origin: ["http://localhost:5173", "https://pipex-ai.vercel.app"],
//     methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   })
// );
// app.options("*", cors());
// app.use(express.json());

// /**
//  * Rate-limit friendly queue
//  * GitHub: 5k req/hr/user
//  */
// const queue = new PQueue({
//   interval: 1000,
//   intervalCap: 4, // 4 req/sec
// });

// /**
//  * Analyze Repo (SaaS-safe, dynamic)
//  */
// app.post("/analyze-repo", async (req, res) => {
//   const { repositoryId, repoOwner, repoName } = req.body;

//   if (!repositoryId || !repoOwner || !repoName) {
//     return res.status(400).json({ error: "Missing parameters" });
//   }

//   try {
//     const headers = {
//       //   Authorization: `Bearer ${token}`,
//       Accept: "application/vnd.github+json",
//     };

//     // 1️⃣ Fetch repo info (cheap call)
//     const repoRes = await fetch(
//       `https://api.github.com/repos/${repoOwner}/${repoName}`,
//       { headers }
//     );
//     if (!repoRes.ok) throw new Error("Repo not accessible");
//     const repo = await repoRes.json();

//     // 2️⃣ Large repo → background job
//     if (repo.size > 5000) {
//       queue.add(() => runAnalysis({ repositoryId, repoOwner, repoName }));
//       return res.json({
//         queued: true,
//         message: "Repo queued for background analysis",
//       });
//     }

//     // 3️⃣ Small repo → immediate
//     const result = await runAnalysis({ repositoryId, repoOwner, repoName });
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// /**
//  * Actual Analyzer Logic
//  */
// async function runAnalysis({ repoOwner, repoName }) {
//   const headers = {
//     // Authorization: `Bearer ${token}`,
//     Accept: "application/vnd.github+json",
//   };

//   // Fetch issues + PRs concurrently
//   const [issuesRes, pullsRes] = await Promise.all([
//     fetch(
//       `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open&per_page=100`,
//       { headers }
//     ),
//     fetch(
//       `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=open&per_page=100`,
//       { headers }
//     ),
//   ]);

//   const issues = await issuesRes.json();
//   const pulls = await pullsRes.json();

//   // Simple analyzer (expand later)
//   return {
//     success: true,
//     repo: `${repoOwner}/${repoName}`,
//     issuesFound: issues.filter((i) => !i.pull_request).length,
//     openPullRequests: pulls.length,
//   };
// }

// app.listen(4000, () => console.log("Analyzer running on :4000"));

import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import PQueue from "p-queue";
import cors from "cors";

dotenv.config();
const app = express();

// CORS configuration
app.use(
  cors({
    origin: ["http://localhost:5173", "https://pipex-ai.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// Queue for rate limiting
const queue = new PQueue({
  interval: 1000,
  intervalCap: 4, // 4 req/sec
});

// Store analysis results temporarily (in production, use Redis/MongoDB)
const analysisResults = new Map();

/**
 * POST /analyze-repo - Analyze repository
 */
app.post("/analyze-repo", async (req, res) => {
  const { repositoryId, repoOwner, repoName, repoUrl } = req.body;

  if (!repositoryId || !repoOwner || !repoName) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // For demonstration, use process.env.GITHUB_TOKEN
    const token = process.env.GITHUB_TOKEN;
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "RepoAnalyzer/1.0",
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // 1. Fetch repo info
    const repoRes = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}`,
      { headers }
    );

    if (!repoRes.ok) {
      const errorData = await repoRes.json().catch(() => ({}));
      throw new Error(errorData.message || "Repository not accessible");
    }

    const repo = await repoRes.json();

    // 2. Large repo → queue for background processing
    if (repo.size > 5000) {
      const jobId = `analysis-${Date.now()}-${repositoryId}`;

      queue.add(async () => {
        try {
          const result = await runAnalysis({ repoOwner, repoName, headers });
          // Store result for retrieval
          analysisResults.set(jobId, result);
          console.log(
            `Background analysis completed for ${repoOwner}/${repoName}`
          );
        } catch (error) {
          console.error(`Background analysis failed:`, error);
          analysisResults.set(jobId, { error: error.message });
        }
      });

      return res.json({
        success: true,
        queued: true,
        jobId,
        message: "Large repository queued for background analysis",
        estimatedTime: "2-5 minutes",
        checkStatusAt: `/api/analysis-status/${jobId}`,
      });
    }

    // 3. Small/medium repo → immediate analysis
    const result = await runAnalysis({ repoOwner, repoName, headers });

    res.json({
      success: true,
      repositoryId,
      repo: `${repoOwner}/${repoName}`,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      issuesFound: result.issuesFound,
      openPullRequests: result.openPullRequests,
      lastUpdated: repo.updated_at,
      analysisDate: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({
      error: err.message || "Internal server error",
      repositoryId,
      repo: `${repoOwner}/${repoName}`,
    });
  }
});

/**
 * GET /analysis-status/:jobId - Check background job status
 */
app.get("/analysis-status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const result = analysisResults.get(jobId);

  if (!result) {
    return res.json({
      status: "processing",
      message: "Analysis in progress",
    });
  }

  res.json({
    status: "completed",
    result,
  });
});

/**
 * GET /repos/:owner/:repo/issues - Fetch issues directly
 */
app.get("/repos/:owner/:repo/issues", async (req, res) => {
  const { owner, repo } = req.params;
  const { state = "open", per_page = "30" } = req.query;

  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
      Accept: "application/vnd.github+json",
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=${state}&per_page=${per_page}`,
      { headers }
    );

    if (!response.ok) throw new Error("Failed to fetch issues");

    const issues = await response.json();
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /repos/:owner/:repo/pulls - Fetch pull requests directly
 */
app.get("/repos/:owner/:repo/pulls", async (req, res) => {
  const { owner, repo } = req.params;
  const { state = "open", per_page = "30" } = req.query;

  try {
    const token = process.env.GITHUB_TOKEN;
    const headers = {
      Accept: "application/vnd.github+json",
    };

    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=${per_page}`,
      { headers }
    );

    if (!response.ok) throw new Error("Failed to fetch pull requests");

    const pulls = await response.json();
    res.json(pulls);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add this endpoint to your backend
app.get("/debug-repo/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  console.log(`🔍 Debugging: ${owner}/${repo}`);

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoAnalyzer/1.0",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
    console.log("✅ Using GitHub token");
  } else {
    console.log("⚠️ No GitHub token - limited to 60 requests/hour");
  }

  try {
    // Try the exact same URL your code uses
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    console.log(`🌐 Fetching: ${url}`);

    const response = await fetch(url, { headers });

    console.log(
      `📊 Response Status: ${response.status} ${response.statusText}`
    );

    // Get response headers
    const responseHeaders = Object.fromEntries(response.headers.entries());
    console.log(
      "📋 Response Headers:",
      JSON.stringify(responseHeaders, null, 2)
    );

    // Try to parse response
    let responseBody;
    try {
      responseBody = await response.json();
      console.log("📄 Response Body:", JSON.stringify(responseBody, null, 2));
    } catch (parseError) {
      const text = await response.text();
      console.log("📄 Raw Response:", text);
      responseBody = { raw: text };
    }

    // Also check if user exists
    console.log(`\n👤 Checking if user exists: ${owner}`);
    const userResponse = await fetch(`https://api.github.com/users/${owner}`, {
      headers,
    });
    console.log(
      `👤 User Status: ${userResponse.status} ${userResponse.statusText}`
    );

    res.json({
      test: {
        url,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
      },
      userCheck: {
        status: userResponse.status,
        exists: userResponse.ok,
      },
      environment: {
        hasToken: !!token,
        tokenLength: token ? token.length : 0,
      },
    });
  } catch (error) {
    console.error("💥 Error:", error.message);
    res.json({
      error: error.message,
      stack: error.stack,
    });
  }
});

// Add this endpoint to list user's repositories
app.get("/user-repos/:username", async (req, res) => {
  const { username } = req.params;
  const { limit = "20", sort = "updated" } = req.query;

  console.log(`📋 Listing repositories for user: ${username}`);

  const token = process.env.GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RepoAnalyzer/1.0",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const url = `https://api.github.com/users/${username}/repos?per_page=${limit}&sort=${sort}`;
    console.log(`🌐 Fetching: ${url}`);

    const response = await fetch(url, { headers });
    console.log(`📊 Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json({
        error: error.message,
        suggestions: [
          "User might not exist",
          "Check the username spelling",
          "Try with a different username",
        ],
      });
    }

    const repos = await response.json();

    // Extract useful information
    const repoList = repos.map((repo) => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      private: repo.private,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      updated_at: repo.updated_at,
      url: repo.html_url,
      has_issues: repo.has_issues,
      open_issues_count: repo.open_issues_count,
    }));

    // Search for similar repository names
    const searchTerm = "ai-devops";
    const similarRepos = repoList.filter(
      (repo) =>
        repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        repo.name
          .toLowerCase()
          .replace(/[-_]/g, "")
          .includes(searchTerm.toLowerCase().replace(/[-_]/g, ""))
    );

    // Get user info
    const userUrl = `https://api.github.com/users/${username}`;
    const userRes = await fetch(userUrl, { headers });
    const userInfo = await userRes.json();

    res.json({
      user: {
        login: userInfo.login,
        name: userInfo.name,
        bio: userInfo.bio,
        public_repos: userInfo.public_repos,
        total_private_repos: userInfo.total_private_repos,
        url: userInfo.html_url,
      },
      total_repositories: repos.length,
      repositories: repoList,
      search: {
        looking_for: "ai-devops",
        similar_repos: similarRepos,
        suggestions:
          similarRepos.length > 0
            ? [
                `Did you mean one of these? ${similarRepos
                  .map((r) => r.name)
                  .join(", ")}`,
              ]
            : ["No similar repositories found"],
      },
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Analysis function
 */
async function runAnalysis({ repoOwner, repoName, headers }) {
  const [issuesRes, pullsRes] = await Promise.all([
    fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=open&per_page=100`,
      { headers }
    ),
    fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/pulls?state=open&per_page=100`,
      { headers }
    ),
  ]);

  if (!issuesRes.ok || !pullsRes.ok) {
    throw new Error("Failed to fetch repository data");
  }

  const [issues, pulls] = await Promise.all([
    issuesRes.json(),
    pullsRes.json(),
  ]);

  // Filter out PRs from issues (GitHub API returns both)
  const pureIssues = issues.filter((i) => !i.pull_request);

  // Calculate additional metrics
  const avgIssueAge =
    pureIssues.length > 0
      ? pureIssues.reduce((sum, issue) => {
          const created = new Date(issue.created_at);
          const age = Date.now() - created.getTime();
          return sum + age / (1000 * 60 * 60 * 24); // Age in days
        }, 0) / pureIssues.length
      : 0;

  return {
    issuesFound: pureIssues.length,
    openPullRequests: pulls.length,
    avgIssueAge: avgIssueAge.toFixed(1),
    oldestIssue:
      pureIssues.length > 0
        ? pureIssues.reduce((oldest, current) =>
            new Date(current.created_at) < new Date(oldest.created_at)
              ? current
              : oldest
          ).created_at
        : null,
  };
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    queueSize: queue.size,
    pending: queue.pending,
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Analyzer API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
