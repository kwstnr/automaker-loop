const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Claude CLI Detector
 *
 * Authentication options:
 * 1. OAuth Token (Subscription): User runs `claude setup-token` and provides the token to the app
 * 2. API Key (Pay-per-use): User provides their Anthropic API key directly
 */
class ClaudeCliDetector {
  /**
   * Check if Claude Code CLI is installed and accessible
   * @returns {Object} { installed: boolean, path: string|null, version: string|null, method: 'cli'|'none' }
   */
  /**
   * Try to get updated PATH from shell config files
   * This helps detect CLI installations that modify shell config but haven't updated the current process PATH
   */
  static getUpdatedPathFromShellConfig() {
    const homeDir = os.homedir();
    const shell = process.env.SHELL || "/bin/bash";
    const shellName = path.basename(shell);

    const configFiles = [];
    if (shellName.includes("zsh")) {
      configFiles.push(path.join(homeDir, ".zshrc"));
      configFiles.push(path.join(homeDir, ".zshenv"));
      configFiles.push(path.join(homeDir, ".zprofile"));
    } else if (shellName.includes("bash")) {
      configFiles.push(path.join(homeDir, ".bashrc"));
      configFiles.push(path.join(homeDir, ".bash_profile"));
      configFiles.push(path.join(homeDir, ".profile"));
    }

    const commonPaths = [
      path.join(homeDir, ".local", "bin"),
      path.join(homeDir, ".cargo", "bin"),
      "/usr/local/bin",
      "/opt/homebrew/bin",
      path.join(homeDir, "bin"),
    ];

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        try {
          const content = fs.readFileSync(configFile, "utf-8");
          const pathMatches = content.match(
            /export\s+PATH=["']?([^"'\n]+)["']?/g
          );
          if (pathMatches) {
            for (const match of pathMatches) {
              const pathValue = match
                .replace(/export\s+PATH=["']?/, "")
                .replace(/["']?$/, "");
              const paths = pathValue
                .split(":")
                .filter((p) => p && !p.includes("$"));
              commonPaths.push(...paths);
            }
          }
        } catch (error) {
          // Ignore errors reading config files
        }
      }
    }

    return [...new Set(commonPaths)];
  }

  static detectClaudeInstallation() {
    try {
      // Check if 'claude' command is in PATH (Unix)
      if (process.platform !== "win32") {
        try {
          const claudePath = execSync("which claude 2>/dev/null", {
            encoding: "utf-8",
          }).trim();
          if (claudePath) {
            const version = this.getClaudeVersion(claudePath);
            return {
              installed: true,
              path: claudePath,
              version: version,
              method: "cli",
            };
          }
        } catch (error) {
          // CLI not in PATH
        }
      }

      // Check Windows path
      if (process.platform === "win32") {
        try {
          const claudePath = execSync("where claude 2>nul", {
            encoding: "utf-8",
          })
            .trim()
            .split("\n")[0];
          if (claudePath) {
            const version = this.getClaudeVersion(claudePath);
            return {
              installed: true,
              path: claudePath,
              version: version,
              method: "cli",
            };
          }
        } catch (error) {
          // Not found on Windows
        }
      }

      // Check for local installation
      const localClaudePath = path.join(
        os.homedir(),
        ".claude",
        "local",
        "claude"
      );
      if (fs.existsSync(localClaudePath)) {
        const version = this.getClaudeVersion(localClaudePath);
        return {
          installed: true,
          path: localClaudePath,
          version: version,
          method: "cli-local",
        };
      }

      // Check common installation locations
      const commonPaths = this.getUpdatedPathFromShellConfig();
      const binaryNames = ["claude", "claude-code"];

      for (const basePath of commonPaths) {
        for (const binaryName of binaryNames) {
          const claudePath = path.join(basePath, binaryName);
          if (fs.existsSync(claudePath)) {
            try {
              const version = this.getClaudeVersion(claudePath);
              return {
                installed: true,
                path: claudePath,
                version: version,
                method: "cli",
              };
            } catch (error) {
              // File exists but can't get version
            }
          }
        }
      }

      // Try to source shell config and check PATH again (Unix)
      if (process.platform !== "win32") {
        try {
          const shell = process.env.SHELL || "/bin/bash";
          const shellName = path.basename(shell);
          const homeDir = os.homedir();

          let sourceCmd = "";
          if (shellName.includes("zsh")) {
            sourceCmd = `source ${homeDir}/.zshrc 2>/dev/null && which claude`;
          } else if (shellName.includes("bash")) {
            sourceCmd = `source ${homeDir}/.bashrc 2>/dev/null && which claude`;
          }

          if (sourceCmd) {
            const claudePath = execSync(`bash -c "${sourceCmd}"`, {
              encoding: "utf-8",
              timeout: 2000,
            }).trim();
            if (claudePath && claudePath.startsWith("/")) {
              const version = this.getClaudeVersion(claudePath);
              return {
                installed: true,
                path: claudePath,
                version: version,
                method: "cli",
              };
            }
          }
        } catch (error) {
          // Failed to source shell config
        }
      }

      return {
        installed: false,
        path: null,
        version: null,
        method: "none",
      };
    } catch (error) {
      return {
        installed: false,
        path: null,
        version: null,
        method: "none",
        error: error.message,
      };
    }
  }

  /**
   * Get Claude CLI version
   * @param {string} claudePath Path to claude executable
   * @returns {string|null} Version string or null
   */
  static getClaudeVersion(claudePath) {
    try {
      const version = execSync(`"${claudePath}" --version 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return version || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get authentication status
   * Checks for:
   * 1. OAuth token stored in app's credentials (from `claude setup-token`)
   * 2. API key stored in app's credentials
   * 3. API key in environment variable
   *
   * @param {string} appCredentialsPath Path to app's credentials.json
   * @returns {Object} Authentication status
   */
  static getAuthStatus(appCredentialsPath) {
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    const envOAuthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

    let storedOAuthToken = null;
    let storedApiKey = null;

    if (appCredentialsPath && fs.existsSync(appCredentialsPath)) {
      try {
        const content = fs.readFileSync(appCredentialsPath, "utf-8");
        const credentials = JSON.parse(content);
        storedOAuthToken = credentials.anthropic_oauth_token || null;
        storedApiKey =
          credentials.anthropic || credentials.anthropic_api_key || null;
      } catch (error) {
        // Ignore credential read errors
      }
    }

    // Authentication priority (highest to lowest):
    // 1. Environment OAuth Token (CLAUDE_CODE_OAUTH_TOKEN)
    // 2. Stored OAuth Token (from credentials file)
    // 3. Stored API Key (from credentials file)
    // 4. Environment API Key (ANTHROPIC_API_KEY)
    let authenticated = false;
    let method = "none";

    if (envOAuthToken) {
      authenticated = true;
      method = "oauth_token_env";
    } else if (storedOAuthToken) {
      authenticated = true;
      method = "oauth_token";
    } else if (storedApiKey) {
      authenticated = true;
      method = "api_key";
    } else if (envApiKey) {
      authenticated = true;
      method = "api_key_env";
    }

    return {
      authenticated,
      method,
      hasStoredOAuthToken: !!storedOAuthToken,
      hasStoredApiKey: !!storedApiKey,
      hasEnvApiKey: !!envApiKey,
      hasEnvOAuthToken: !!envOAuthToken,
    };
  }
  /**
   * Get installation info (installation status only, no auth)
   * @returns {Object} Installation info with status property
   */
  static getInstallationInfo() {
    const installation = this.detectClaudeInstallation();
    return {
      status: installation.installed ? "installed" : "not_installed",
      installed: installation.installed,
      path: installation.path,
      version: installation.version,
      method: installation.method,
    };
  }

  /**
   * Get full status including installation and auth
   * @param {string} appCredentialsPath Path to app's credentials.json
   * @returns {Object} Full status
   */
  static getFullStatus(appCredentialsPath) {
    const installation = this.detectClaudeInstallation();
    const auth = this.getAuthStatus(appCredentialsPath);

    return {
      success: true,
      status: installation.installed ? "installed" : "not_installed",
      installed: installation.installed,
      path: installation.path,
      version: installation.version,
      method: installation.method,
      auth,
    };
  }

  /**
   * Get installation info and recommendations
   * @returns {Object} Installation status and recommendations
   */
  static getInstallationInfo() {
    const detection = this.detectClaudeInstallation();

    if (detection.installed) {
      return {
        status: 'installed',
        method: detection.method,
        version: detection.version,
        path: detection.path,
        recommendation: 'Claude Code CLI is ready for ultrathink'
      };
    }

    return {
      status: 'not_installed',
      recommendation: 'Install Claude Code CLI for optimal ultrathink performance',
      installCommands: this.getInstallCommands()
    };
  }

  /**
   * Get installation commands for different platforms
   * @returns {Object} Installation commands
   */
  static getInstallCommands() {
    return {
      macos: "curl -fsSL https://claude.ai/install.sh | bash",
      windows: "irm https://claude.ai/install.ps1 | iex",
      linux: "curl -fsSL https://claude.ai/install.sh | bash",
    };
  }

  /**
   * Install Claude CLI using the official script
   * @param {Function} onProgress Callback for progress updates
   * @returns {Promise<Object>} Installation result
   */
  static async installCli(onProgress) {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command, args;

      if (platform === "win32") {
        command = "powershell";
        args = ["-Command", "irm https://claude.ai/install.ps1 | iex"];
      } else {
        command = "bash";
        args = ["-c", "curl -fsSL https://claude.ai/install.sh | bash"];
      }

      console.log("[ClaudeCliDetector] Installing Claude CLI...");

      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
      });

      let output = "";
      let errorOutput = "";

      proc.stdout.on("data", (data) => {
        const text = data.toString();
        output += text;
        if (onProgress) {
          onProgress({ type: "stdout", data: text });
        }
      });

      proc.stderr.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        if (onProgress) {
          onProgress({ type: "stderr", data: text });
        }
      });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log(
            "[ClaudeCliDetector] Installation completed successfully"
          );
          resolve({
            success: true,
            output,
            message: "Claude CLI installed successfully",
          });
        } else {
          console.error(
            "[ClaudeCliDetector] Installation failed with code:",
            code
          );
          reject({
            success: false,
            error: errorOutput || `Installation failed with code ${code}`,
            output,
          });
        }
      });

      proc.on("error", (error) => {
        console.error("[ClaudeCliDetector] Installation error:", error);
        reject({
          success: false,
          error: error.message,
          output,
        });
      });
    });
  }

  /**
   * Get instructions for setup-token command
   * @returns {Object} Setup token instructions
   */
  static getSetupTokenInstructions() {
    const detection = this.detectClaudeInstallation();

    if (!detection.installed) {
      return {
        success: false,
        error: "Claude CLI is not installed. Please install it first.",
        installCommands: this.getInstallCommands(),
      };
    }

    return {
      success: true,
      command: "claude setup-token",
      instructions: [
        "1. Open your terminal",
        "2. Run: claude setup-token",
        "3. Follow the prompts to authenticate",
        "4. Copy the token that is displayed",
        "5. Paste the token in the field below",
      ],
      note: "This token is from your Claude subscription and allows you to use Claude without API charges.",
    };
  }
}

module.exports = ClaudeCliDetector;
