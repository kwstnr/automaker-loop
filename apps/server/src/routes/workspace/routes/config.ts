/**
 * GET /config endpoint - Get workspace configuration status
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { addAllowedPath, getAllowedRootDirectory } from "../../../lib/security.js";
import { getErrorMessage, logError } from "../common.js";

export function createConfigHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const allowedRootDirectory = getAllowedRootDirectory();

      if (!allowedRootDirectory) {
        res.json({
          success: true,
          configured: false,
        });
        return;
      }

      // Check if the directory exists
      try {
        const resolvedWorkspaceDir = path.resolve(allowedRootDirectory);
        const stats = await fs.stat(resolvedWorkspaceDir);
        if (!stats.isDirectory()) {
          res.json({
            success: true,
            configured: false,
            error: "ALLOWED_ROOT_DIRECTORY is not a valid directory",
          });
          return;
        }

        // Add workspace dir to allowed paths
        addAllowedPath(resolvedWorkspaceDir);

        res.json({
          success: true,
          configured: true,
          workspaceDir: resolvedWorkspaceDir,
        });
      } catch {
        res.json({
          success: true,
          configured: false,
          error: "ALLOWED_ROOT_DIRECTORY path does not exist",
        });
      }
    } catch (error) {
      logError(error, "Get workspace config failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
