import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommandRaw } from "../utils/sfCommand.js";
import { permissions } from "../config/permissions.js";

const runCodeAnalyzer = async (
    workspace?: string[],
    target?: string[],
    outputFile?: string,
    ruleSelector?: string[],
    severity?: string,
    configFile?: string
) => {
    let command = "sf code-analyzer run";

    if (workspace && workspace.length > 0) {
        workspace.forEach((w) => {
            command += ` --workspace "${w}"`;
        });
    }

    if (target && target.length > 0) {
        target.forEach((t) => {
            command += ` --target "${t}"`;
        });
    }

    if (outputFile) {
        command += ` --output-file "${outputFile}"`;
    }

    if (ruleSelector && ruleSelector.length > 0) {
        ruleSelector.forEach((rs) => {
            command += ` --rule-selector "${rs}"`;
        });
    }

    if (severity) {
        command += ` --severity-threshold ${severity}`;
    }

    if (configFile) {
        command += ` --config-file "${configFile}"`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

const listCodeAnalyzerRules = async (
    workspace?: string[],
    target?: string[],
    configFile?: string,
    ruleSelector?: string[],
    view?: string
) => {
    let command = "sf code-analyzer rules";

    if (workspace && workspace.length > 0) {
        workspace.forEach((w) => {
            command += ` --workspace "${w}"`;
        });
    }

    if (target && target.length > 0) {
        target.forEach((t) => {
            command += ` --target "${t}"`;
        });
    }

    if (configFile) {
        command += ` --config-file "${configFile}"`;
    }

    if (ruleSelector && ruleSelector.length > 0) {
        ruleSelector.forEach((rs) => {
            command += ` --rule-selector "${rs}"`;
        });
    }

    if (view) {
        command += ` --view ${view}`;
    }

    const result = await executeSfCommandRaw(command);
    return result;
};

export const registerCodeAnalyzerTools = (server: McpServer) => {
    server.tool(
        "run_code_analyzer",
        'Analyze your code with a selection of rules to ensure good coding practices. You can scan your codebase with the recommended rules. Or use flags to filter the rules based on engines (such as "retire-js" or "eslint"), rule names, tags, and more. Always execute the `list_code_analyzer_rules` tool first to understnad which rules to provide into ruleSelector parameter based on the files to be scanned.',
        {
            input: z.object({
                workspace: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Set of files that make up your workspace. Typically, a workspace is a single project folder that contains all your files. But it can also consist of one or more folders, one or more files, and use glob patterns (wildcards). If you specify this flag multiple times, then your workspace is the sum of the files and folders. Some engines often need your entire code base to perform an analysis, even if you want to target only a subset of the files within your workspace, such as with the --target flag. If you don't specify the --workspace flag, then the current folder '.' is used as your workspace."
                    ),
                target: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Subset of files within your workspace to be targeted for analysis.You can specify a target as a file, a folder, or a glob pattern. If you specify this flag multiple times, then the full list of targeted files is the sum of the files and folders. Each targeted file must live within the workspace that you specified with the `–-workspace` flag. If you don't specify the `--target` flag, then all the files within your workspace (specified by the `--workspace` flag) are targeted for analysis."
                    ),
                ruleSelector: z
                    .array(z.string())
                    .describe(
                        'Selection of rules, based on engine name, severity level, rule name, tag, or a combination of criteria separated by colons. Use the `--rule-selector` flag to select the list of rules to run based on specific criteria. For example, you can select by engine, such as the rules associated with the "retire-js" or "eslint" engine. Or select by the severity of the rules, such as high or moderate. You can also select rules using tag values or rule names. Every rule has a name, which is unique within the scope of an engine. Most rules have tags, although it\'s not required. An example of a tag is "Recommended". You can combine different criteria using colons to further filter the list; the colon works as an intersection. For example, `--rule-selector eslint:Security` runs rules associated only with the "eslint" engine that have the Security tag. The flag `--rule-selector eslint:Security:3` flag runs the "eslint" rules that have the Security tag and moderate severity (3). To add multiple rule selectors together (a union), specify the `--rule-selector` flag multiple times, such as `--rule-selector eslint:Recommended --rule-selector retire-js:3`. Run `sf code-analyzer rules --rule-selector all` to see the possible values for engine name, rule name, tags, and severity levels that you can use with this flag.'
                    ),
                outputFile: z
                    .string()
                    .optional()
                    .describe(
                        "Specify a file to save the output to. This flag can be used with or without the --output-format flag. If you don't specify the output format, the output is formatted based on the file extension of the specified file. Specifying a file extension that doesn't match a supported output format results in a JSON file being created."
                    ),
                severity: z
                    .enum(["High", "Medium", "Low"])
                    .optional()
                    .describe(
                        "Throw a non-zero exit code when rule violations of the specified severity (or more severe) are found. Values are High, Medium, and Low. The default is --severity-threshold=Low"
                    ),
                configFile: z
                    .string()
                    .optional()
                    .describe(
                        "Path to the configuration file used to customize the engines and rules. Code Analyzer has an internal default configuration for its rule and engine properties. If you want to override these defaults, you can create a Code Analyzer configuration file. We recommend that you name your Code Analyzer configuration file `code-analyzer.yml` or `code-analyzer.yaml` and put it at the root of your workspace. You then don't need to use this flag when you run the `code-analyzer run` command from the root of your workspace, because it automatically looks for either file in the current folder, and if found, applies its rule overrides and engine settings. If you want to name the file something else, or put it in an alternative folder, then you must specify this flag. To help you get started, use the `code-analyzer config` command to create your first Code Analyzer configuration file. With it, you can change the severity of an existing rule, change a rule's tags, and so on. Then use this flag to specify the file so that the command takes your customizations into account."
                    ),
            }),
        },
        async ({ input }) => {
            const {
                workspace,
                target,
                outputFile,
                ruleSelector,
                severity,
                configFile,
            } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Code analysis is disabled in read-only mode",
                            }),
                        },
                    ],
                };
            }

            try {
                const result = await runCodeAnalyzer(
                    workspace,
                    target,
                    outputFile,
                    ruleSelector,
                    severity,
                    configFile
                );

                return {
                    content: [
                        {
                            type: "text",
                            text: result,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error.message ||
                                    "Failed to run code analyzer",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        }
    );

    server.tool(
        "list_code_analyzer_rules",
        "List the rules that are available to analyze your code. You can also view details about the rules, such as the engine it's associated with, tags, and description. Use this command to determine the exact set of rules to analyze your code. The `code-analyzer run` command has similar flags as this command, so once you've determined the flag values for this command that list the rules you want to run, you specify the same values to the `code-analyzer run` command.",
        {
            input: z.object({
                workspace: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Set of files that make up your workspace for rule discovery."
                    ),
                target: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Subset of files within your workspace to be targeted for analysis.You can specify a target as a file, a folder, or a glob pattern. If you specify this flag multiple times, then the full list of targeted files is the sum of the files and folders. Each targeted file must live within the workspace that you specified with the `–-workspace` flag. If you don't specify the `--target` flag, then all the files within your workspace (specified by the `--workspace` flag) are targeted for analysis."
                    ),
                configFile: z
                    .string()
                    .optional()
                    .describe(
                        "Use the specified configuration file to discover rules."
                    ),
                ruleSelector: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Filter rules by their names, tags, categories, or engines."
                    ),
                view: z
                    .enum(["detail", "table"])
                    .optional()
                    .describe(
                        "Format to display the rules in the terminal. The format 'table' is concise and shows minimal output, the format 'detail' shows all available information. Default is 'table'."
                    ),
            }),
        },
        async ({ input }) => {
            const { workspace, target, configFile, ruleSelector, view } = input;

            try {
                const result = await listCodeAnalyzerRules(
                    workspace,
                    target,
                    configFile,
                    ruleSelector,
                    view
                );
                return {
                    content: [
                        {
                            type: "text",
                            text: result,
                        },
                    ],
                };
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    error.message ||
                                    "Failed to list code analyzer rules",
                                error: error,
                            }),
                        },
                    ],
                };
            }
        }
    );
};
