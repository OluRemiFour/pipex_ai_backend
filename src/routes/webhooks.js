// src/routes/webhooks.js - CREATE THIS FILE
const express = require("express");
const crypto = require("crypto");
const PullRequest = require("../models/PullRequest");
const Issue = require("../models/Issue");
const auditService = require("../services/auditService"); // ADD THIS
const config = require("../config");

const router = express.Router();

/**
 * Verify GitHub webhook signature
 */
function verifyGitHubSignature(req, res, next) {
  const signature = req.headers["x-hub-signature-256"];

  if (!signature) {
    console.error("❌ No signature in webhook");
    return res.status(401).json({ error: "No signature" });
  }

  const payload = JSON.stringify(req.body);
  const hmac = crypto.createHmac("sha256", config.githubWebhookSecret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");

  if (signature !== digest) {
    console.error("❌ Invalid webhook signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}

/**
 * POST /api/webhooks/github
 * Handle GitHub webhook events
 */
router.post(
  "/github",
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  }),
  verifyGitHubSignature,
  async (req, res) => {
    try {
      const event = req.headers["x-github-event"];
      const payload = req.body;

      console.log(`📡 Webhook received: ${event}`);

      // Handle pull request events
      if (event === "pull_request") {
        await handlePullRequestEvent(payload);
      }

      // Handle push events (for merged PRs)
      if (event === "push") {
        await handlePushEvent(payload);
      }

      res.status(200).json({ success: true, message: "Webhook processed" });
    } catch (error) {
      console.error("❌ Webhook error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(payload) {
  const action = payload.action;
  const pr = payload.pull_request;

  console.log(`🔀 PR #${pr.number} - Action: ${action}`);

  // Find PR in database
  const dbPr = await PullRequest.findOne({ githubPrId: pr.id });

  if (!dbPr) {
    console.log("ℹ️ PR not found in database (not created by Pipex AI)");
    return;
  }

  // Update PR status based on action
  switch (action) {
    case "closed":
      dbPr.status = pr.merged ? "merged" : "closed";
      dbPr.updatedAt = new Date();

      if (pr.merged) {
        dbPr.mergedAt = new Date(pr.merged_at);
        console.log(`✅ PR #${pr.number} merged`);

        // Log PR merge
        await auditService.logPRMerge(dbPr.userId, dbPr.repositoryId, dbPr);

        // Update related issue
        if (dbPr.issueId) {
          const issue = await Issue.findByIdAndUpdate(dbPr.issueId, {
            status: "resolved",
            resolvedAt: new Date(),
          });
          console.log(`✅ Issue ${dbPr.issueId} marked as resolved`);

          // Log issue resolution
          if (issue) {
            await auditService.logIssueResolution(
              dbPr.userId,
              dbPr.repositoryId,
              issue
            );
          }
        }
      } else {
        dbPr.closedAt = new Date(pr.closed_at);
        console.log(`🚫 PR #${pr.number} closed without merging`);
      }

      await dbPr.save();
      break;

    case "opened":
    case "reopened":
      dbPr.status = "open";
      dbPr.updatedAt = new Date();
      await dbPr.save();
      console.log(`🔓 PR #${pr.number} opened/reopened`);
      break;

    case "synchronize":
      // PR was updated with new commits
      dbPr.updatedAt = new Date();
      await dbPr.save();
      console.log(`🔄 PR #${pr.number} synchronized`);
      break;

    default:
      console.log(`ℹ️ Unhandled PR action: ${action}`);
  }
}

/**
 * Handle push events
 */
async function handlePushEvent(payload) {
  const ref = payload.ref;
  const commits = payload.commits || [];

  console.log(`📤 Push to ${ref} - ${commits.length} commits`);

  // Check if this is a merge to main/master
  if (ref === "refs/heads/main" || ref === "refs/heads/master") {
    // Look for merged PRs in commit messages
    for (const commit of commits) {
      const prMatch = commit.message.match(/#(\d+)/);
      if (prMatch) {
        const prNumber = parseInt(prMatch[1]);

        const dbPr = await PullRequest.findOne({ prNumber });
        if (dbPr && dbPr.status === "open") {
          dbPr.status = "merged";
          dbPr.mergedAt = new Date(commit.timestamp);
          dbPr.updatedAt = new Date();
          await dbPr.save();

          // Update related issue
          if (dbPr.issueId) {
            await Issue.findByIdAndUpdate(dbPr.issueId, {
              status: "resolved",
              resolvedAt: new Date(),
            });
          }

          console.log(`✅ PR #${prNumber} marked as merged from push event`);
        }
      }
    }
  }
}

/**
 * GET /api/webhooks/test
 * Test endpoint to verify webhook setup
 */
router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Webhook endpoint is working",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
