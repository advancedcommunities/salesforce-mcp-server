import { logger } from "../utils/logger.js";

interface PermissionConfig {
    readOnly: boolean;
    allowedOrgs: string[] | "ALL";
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
}

export const permissions = new PermissionsManager();
