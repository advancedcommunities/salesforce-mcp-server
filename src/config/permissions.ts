import { logger } from "../utils/logger.js";

interface PermissionConfig {
    readOnly: boolean;
    allowedOrgs: string[] | "ALL";
    useClientBrowser: boolean;
}

class PermissionsManager {
    private config: PermissionConfig;

    constructor() {
        const allowedOrgsEnv = process.env.ALLOWED_ORGS || "ALL";

        this.config = {
            readOnly: process.env.READ_ONLY === "true",
            allowedOrgs:
                allowedOrgsEnv === "ALL"
                    ? "ALL"
                    : allowedOrgsEnv.split(",").map((org) => org.trim()),
            useClientBrowser: process.env.USE_CLIENT_BROWSER === "true",
        };
    }

    isReadOnly(): boolean {
        return this.config.readOnly;
    }

    isOrgAllowed(targetOrg: string): boolean {
        const allowed =
            this.config.allowedOrgs === "ALL" ||
            this.config.allowedOrgs.includes(targetOrg);
        if (!allowed) {
            logger.warning(
                "permissions",
                `Access denied for org '${targetOrg}'`,
            );
        }
        return allowed;
    }

    getAllowedOrgs(): string[] | "ALL" {
        return this.config.allowedOrgs;
    }

    /**
     * When enabled, tools that would launch the operating system browser
     * instead return a ready-to-open URL for the MCP client's built-in browser.
     */
    usesClientBrowser(): boolean {
        return this.config.useClientBrowser;
    }
}

export const permissions = new PermissionsManager();
