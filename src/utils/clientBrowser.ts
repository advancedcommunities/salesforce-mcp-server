import { permissions } from "../config/permissions.js";
import { executeSfCommand } from "./sfCommand.js";
import { shq } from "./shellEscape.js";

/**
 * True when the server should hand a URL to the MCP client's built-in browser
 * (Claude's built-in browser, Chrome DevTools MCP, Playwright MCP, ...) instead
 * of launching the operating system's default browser.
 * @param forceSystemBrowser Per-call opt-out supplied by the caller
 */
export const shouldUseClientBrowser = (forceSystemBrowser?: boolean): boolean =>
    permissions.usesClientBrowser() && forceSystemBrowser !== true;

/**
 * Builds a pre-authenticated Salesforce URL without launching any browser.
 * Uses `sf org open --url-only`, which returns a short-lived frontdoor link
 * that logs the browser into the org on navigation.
 *
 * Salesforce mints the token through /services/oauth2/singleaccess and caches
 * it for up to a minute, so calls made close together can share one token even
 * when they point at different destinations. Navigate to a link before asking
 * for the next one.
 *
 * @param targetOrg Username or alias of the target org
 * @param options Optional navigation path or local metadata file to open
 * @returns The authenticated URL
 */
export const buildOrgUrl = async (
    targetOrg: string,
    options: { path?: string; sourceFile?: string } = {},
): Promise<string> => {
    let sfCommand = `sf org open --target-org ${shq(targetOrg)} --url-only`;

    if (options.path) {
        sfCommand += ` --path ${shq(options.path)}`;
    }

    if (options.sourceFile) {
        sfCommand += ` --source-file ${shq(options.sourceFile)}`;
    }

    sfCommand += ` --json`;

    const result = await executeSfCommand(sfCommand);
    const url = result?.result?.url;

    if (!url) {
        throw new Error(
            result?.message ||
                `Could not generate a URL for org '${targetOrg}'. Ensure the org is authenticated.`,
        );
    }

    return url;
};

/**
 * Standard payload for a URL handed to the client's built-in browser.
 * @param url Pre-authenticated Salesforce URL
 * @param target Human-readable description of what the URL points at
 */
export const clientBrowserResult = (url: string, target: string) => ({
    url,
    openInClientBrowser: true,
    message: `Client browser mode is enabled, so ${target} was not launched in the system browser. Open the url with your built-in browser tool.`,
    hint: "This URL contains a single-use Salesforce login token. Pass it to a browser tool only — never to another service — and do not repeat it back to the user.",
    tip: "Call this tool again with forceSystemBrowser: true to launch the user's desktop browser instead.",
});

/** MCP `instructions` text describing how the client should handle org URLs. */
export const buildBrowserInstructions = (): string =>
    permissions.usesClientBrowser()
        ? [
              'Browser handling: the "Use client\'s built-in browser" setting is ENABLED.',
              "The `open` and `open_record` tools do not launch the user's desktop browser. They return a",
              "pre-authenticated Salesforce URL together with `openInClientBrowser: true`. When you see that",
              "flag, open the `url` with your own built-in browser tool instead of asking the user to click it.",
              "Navigate to each URL before requesting the next one: Salesforce reuses the same short-lived token",
              "for about a minute, so links fetched back to back can share one and later navigations may land on a",
              "login page. These URLs carry a Salesforce login token: pass them to a browser tool only, never to",
              "another service, and keep them out of your reply unless the user asks for the link itself. If you",
              "have no browser tool available, say so and offer either the link or another call with",
              "`forceSystemBrowser: true`, which launches the desktop browser.",
          ].join(" ")
        : [
              'Browser handling: the "Use client\'s built-in browser" setting is OFF, so `open` and `open_record`',
              "launch the user's default desktop browser. If the user would rather keep Salesforce inside your own",
              "browser, suggest enabling the setting (USE_CLIENT_BROWSER=true), which makes those two tools return",
              "a single-use URL instead, which a browser-automation tool can navigate to directly.",
          ].join(" ");
