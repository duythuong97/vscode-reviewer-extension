import { logDebug } from "./helper";
import { debugOutputChannel } from "./extension";
export class GitHelper {
  static async getCurrentBranch(repoPath: string): Promise<string | null> {
    try {
      const { execSync } = require("child_process");
      const result = execSync("git branch --show-current", {
        cwd: repoPath,
        encoding: "utf8",
      });
      return result.trim();
    } catch (error) {
      logDebug(debugOutputChannel, "Error getting current branch", error);
      return null;
    }
  }

  // Helper function to check if a branch exists
  static async branchExists(
    repoPath: string,
    branchName: string
  ): Promise<boolean> {
    try {
      const { execSync } = require("child_process");
      execSync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
        cwd: repoPath,
      });
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  // Helper function to get changed files
  static async getChangedFiles(
    repoPath: string,
    baseBranch: string
  ): Promise<Array<{ name: string; path: string }>> {
    try {
      const { execSync } = require("child_process");
      const result = execSync(`git diff --name-only ${baseBranch}`, {
        cwd: repoPath,
        encoding: "utf8",
      });

      const files = result
        .trim()
        .split("\n")
        .filter((file: string) => file.trim() !== "");
      return files.map((file: string) => ({
        name: file.split("/").pop() || file,
        path: file,
      }));
    } catch (error) {
      logDebug(debugOutputChannel, "Error getting changed files", error);
      throw new Error("Failed to get changed files from git");
    }
  }
}
