import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
    ExecuteService,
    TestService,
    TestLevel,
    ResultFormat,
    type ExecuteAnonymousResponse,
    type ApexExecuteOptions,
    type TestResult,
    type TestRunIdResult,
} from "@salesforce/apex-node";
import { getConnection } from "../shared/connection.js";
import { permissions } from "../config/permissions.js";
import { executeSfCommand, executeSfCommandRaw } from "../utils/sfCommand.js";

const executeAnonymousApex = async (
    targetOrg: string,
    code: string
): Promise<ExecuteAnonymousResponse> => {
    if (!code || code.trim() === "") {
        throw new Error("Code cannot be empty");
    }

    if (!targetOrg || targetOrg.trim() === "") {
        throw new Error("Target org is required");
    }

    try {
        const connection = await getConnection(targetOrg);
        const executeService = new ExecuteService(connection);

        const options: ApexExecuteOptions = {
            apexCode: code,
        };

        const result = await executeService.executeAnonymous(options);

        return result;
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' to authenticate.`
            );
        }

        if (error.message?.includes("expired access/refresh token")) {
            throw new Error(
                `Authentication expired for org '${targetOrg}'. ` +
                    `Please run 'sf org login --alias ${targetOrg}' to re-authenticate.`
            );
        }

        throw new Error(`Failed to execute Apex: ${error.message}`);
    }
};

const runApexTests = async (
    targetOrg: string,
    testLevel: TestLevel,
    classNames?: string,
    testSuites?: string,
    tests?: string,
    codeCoverage: boolean = true,
    outputFormat: ResultFormat = ResultFormat.json,
    synchronous: boolean = false
): Promise<TestResult | TestRunIdResult> => {
    try {
        const connection = await getConnection(targetOrg);
        const testService = new TestService(connection);

        if (synchronous) {
            const syncConfig = await testService.buildSyncPayload(
                testLevel,
                tests,
                classNames
            );
            return await testService.runTestSynchronous(
                syncConfig,
                codeCoverage
            );
        } else {
            const asyncConfig = await testService.buildAsyncPayload(
                testLevel,
                tests,
                classNames,
                testSuites
            );
            return await testService.runTestAsynchronous(
                asyncConfig,
                codeCoverage,
                false
            );
        }
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' to authenticate.`
            );
        }
        throw new Error(`Failed to run Apex tests: ${error.message}`);
    }
};

const getTestResults = async (
    targetOrg: string,
    testRunId: string,
    codeCoverage: boolean = true
): Promise<TestResult> => {
    try {
        const connection = await getConnection(targetOrg);
        const testService = new TestService(connection);

        return await testService.reportAsyncResults(testRunId, codeCoverage);
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' to authenticate.`
            );
        }
        throw new Error(`Failed to get test results: ${error.message}`);
    }
};

const getCodeCoverage = async (
    targetOrg: string,
    type: "org-wide" | "from-tests" = "org-wide",
    testRunId?: string
): Promise<any> => {
    try {
        const connection = await getConnection(targetOrg);

        if (type === "from-tests") {
            if (!testRunId) {
                throw new Error(
                    "Test run ID is required for coverage from test results"
                );
            }
            const testService = new TestService(connection);
            const result = await testService.reportAsyncResults(
                testRunId,
                true
            );

            if (result.codecoverage) {
                const totalLines = result.codecoverage.reduce(
                    (sum, cov) =>
                        sum + cov.numLinesCovered + cov.numLinesUncovered,
                    0
                );
                const coveredLines = result.codecoverage.reduce(
                    (sum, cov) => sum + cov.numLinesCovered,
                    0
                );
                const percentage =
                    totalLines > 0
                        ? ((coveredLines / totalLines) * 100).toFixed(2)
                        : "0.00";

                return {
                    summary: {
                        totalLines,
                        coveredLines,
                        coveragePercentage: `${percentage}%`,
                    },
                    classes: result.codecoverage.map((cov) => ({
                        name: cov.name,
                        type: cov.type,
                        percentage: cov.percentage,
                        numLinesCovered: cov.numLinesCovered,
                        numLinesUncovered: cov.numLinesUncovered,
                        uncoveredLines: cov.uncoveredLines,
                    })),
                };
            } else {
                return {
                    message:
                        "No code coverage data available for this test run",
                };
            }
        } else {
            const query = "SELECT PercentCovered FROM ApexOrgWideCoverage";
            const result = await connection.query(query);

            if (result.records && result.records.length > 0) {
                const coverage = (result.records[0] as any).PercentCovered;
                return {
                    orgWideCoverage: `${coverage}%`,
                    message: `Organization-wide code coverage is ${coverage}%`,
                };
            } else {
                return { message: "Unable to retrieve org-wide coverage" };
            }
        }
    } catch (error: any) {
        if (error.name === "NoAuthInfoFound") {
            throw new Error(
                `No authenticated org found for '${targetOrg}'. ` +
                    `Please run 'sf org login' to authenticate.`
            );
        }
        throw new Error(`Failed to get code coverage: ${error.message}`);
    }
};

const generateClass = async (name: string, outputDir: string) => {
    let sfCommand = `sf apex generate class --name ${name} --json `;

    if (outputDir && outputDir.length > 0) {
        sfCommand += `--output-dir ${outputDir}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const generateTrigger = async (
    name: string,
    sObjectName: string,
    outputDir: string
) => {
    let sfCommand = `sf apex generate trigger --name ${name} --json `;

    if (sObjectName && sObjectName.length > 0) {
        sfCommand += `--sobject ${sObjectName} `;
    }

    if (outputDir && outputDir.length > 0) {
        sfCommand += `--output-dir ${outputDir}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const apexLogList = async (targetOrg: string) => {
    let sfCommand = `sf apex log list --target-org ${targetOrg} --json `;

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

const apexGetLog = async (
    targetOrg: string,
    logId: string,
    recentLogsNumber: number
) => {
    let sfCommand = `sf apex get log --target-org ${targetOrg} --json `;

    const hasLogId = logId && logId.length > 0;

    if (hasLogId) {
        sfCommand += `--log-id ${logId} `;
    }

    if (!hasLogId && recentLogsNumber !== 0) {
        sfCommand += `--number ${recentLogsNumber}`;
    }

    try {
        const result = await executeSfCommand(sfCommand);
        return result;
    } catch (error) {
        throw error;
    }
};

export const registerApexTools = (server: McpServer) => {
    server.tool(
        "execute_anonymous_apex",
        "Execute Apex code in a Salesforce Org. This command allows you to run Apex code directly against a specified Salesforce Org. The code is executed in the context of the Org, and the results are returned in JSON format. You can use this command to test Apex code snippets, run batch jobs, or perform other Apex-related tasks. You can review the debug logs of the execution to see the results of the code execution.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias to execute the code against"
                    ),
                code: z
                    .string()
                    .describe("Apex code to execute")
                    .min(1, "Code cannot be empty"),
            }),
        },
        async ({ input }) => {
            const { targetOrg, code } = input;

            // Check permissions
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                compiled: false,
                                compileProblem:
                                    "Operation not allowed: Cannot execute anonymous Apex in READ_ONLY mode",
                            }),
                        },
                    ],
                };
            }

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                compiled: false,
                                compileProblem: `Access denied: Org '${targetOrg}' is not in the allowed list`,
                            }),
                        },
                    ],
                };
            }

            const result = await executeAnonymousApex(targetOrg, code);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "run_apex_tests",
        "Run Apex tests in a Salesforce Org. This command allows you to execute unit tests with various options including test level, specific classes, suites, and code coverage collection. Tests can be run synchronously or asynchronously. Use this to validate your Apex code and ensure proper test coverage.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias to run tests against"
                    ),
                testLevel: z
                    .enum([
                        "RunLocalTests",
                        "RunAllTestsInOrg",
                        "RunSpecifiedTests",
                    ])
                    .describe(
                        "Test level - RunLocalTests (all except managed packages), RunAllTestsInOrg (all tests), or RunSpecifiedTests (specific tests only)"
                    )
                    .default("RunLocalTests"),
                classNames: z
                    .string()
                    .optional()
                    .describe(
                        "Comma-separated list of test class names to run (required for RunSpecifiedTests)"
                    ),
                testSuites: z
                    .string()
                    .optional()
                    .describe(
                        "Comma-separated list of test suite names to run"
                    ),
                tests: z
                    .string()
                    .optional()
                    .describe(
                        'JSON string specifying specific test methods to run, e.g., [{"className":"TestClass","testMethods":["testMethod1"]}]'
                    ),
                codeCoverage: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe("Whether to collect code coverage information"),
                synchronous: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "Whether to run tests synchronously (wait for completion) or asynchronously"
                    ),
            }),
        },
        async ({ input }) => {
            // Check permissions
            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message:
                                    "Operation not allowed: Cannot run Apex tests in READ_ONLY mode",
                            }),
                        },
                    ],
                };
            }

            if (!permissions.isOrgAllowed(input.targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${input.targetOrg}' is not in the allowed list`,
                            }),
                        },
                    ],
                };
            }

            const result = await runApexTests(
                input.targetOrg,
                input.testLevel as TestLevel,
                input.classNames,
                input.testSuites,
                input.tests,
                input.codeCoverage,
                ResultFormat.json,
                input.synchronous
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "get_apex_test_results",
        "Retrieve results from a previous asynchronous Apex test run. Use this command with a test run ID to get detailed test results including pass/fail status, error messages, stack traces, and optionally code coverage information.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias where the tests were run"
                    ),
                testRunId: z
                    .string()
                    .describe(
                        "The test run ID returned from a previous asynchronous test execution"
                    ),
                codeCoverage: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe(
                        "Whether to include code coverage information in the results"
                    ),
            }),
        },
        async ({ input }) => {
            // Check org permissions
            if (!permissions.isOrgAllowed(input.targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${input.targetOrg}' is not in the allowed list`,
                            }),
                        },
                    ],
                };
            }

            const result = await getTestResults(
                input.targetOrg,
                input.testRunId,
                input.codeCoverage
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "get_apex_code_coverage",
        "Get code coverage information for a Salesforce Org. This command allows you to retrieve org-wide coverage percentage or coverage details from a specific test run. Use this to monitor and ensure your code meets the 75% coverage requirement.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Target Salesforce Org Alias to get coverage from"
                    ),
                coverageType: z
                    .enum(["org-wide", "from-tests"])
                    .default("org-wide")
                    .describe(
                        "Type of coverage to retrieve: org-wide (overall org percentage) or from-tests (coverage from a specific test run)"
                    ),
                testRunId: z
                    .string()
                    .optional()
                    .describe(
                        "Test run ID (required when coverageType is 'from-tests')"
                    ),
            }),
        },
        async ({ input }) => {
            // Check org permissions
            if (!permissions.isOrgAllowed(input.targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access denied: Org '${input.targetOrg}' is not in the allowed list`,
                            }),
                        },
                    ],
                };
            }

            const result = await getCodeCoverage(
                input.targetOrg,
                input.coverageType as "org-wide" | "from-tests",
                input.testRunId
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "generate_class",
        'Generates the Apex *.cls file and associated metadata file. These files must contained in a parent directory called "classes" in your package directory. Either run this command existing directory of this name, or use the --output-dir flag to generate one or point to an existing one.',
        {
            input: z.object({
                name: z
                    .string()
                    .describe(
                        "Name of the generated Apex class. The name can be up to 40 characters and must start with a letter."
                    ),
                outputDir: z
                    .string()
                    .optional()
                    .describe(
                        "Directory for saving the created files. The location can be an absolute path or relative to the current working directory. The default is the current directory."
                    ),
            }),
        },
        async ({ input }) => {
            const { name, outputDir } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                compiled: false,
                                compileProblem:
                                    "Operation not allowed: Cannot generate Apex class in READ_ONLY mode",
                            }),
                        },
                    ],
                };
            }

            const result = await generateClass(name, outputDir || "");
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "generate_trigger",
        'Generates the Apex trigger *.trigger file and associated metadata file. These files must be contained in a parent directory called "triggers" in your package directory. Either run this command from an existing directory of this name, or use the --output-dir flag to generate one or point to an existing one. If you don\'t specify the --sobject flag, the .trigger file contains the generic placeholder SOBJECT; replace it with the Salesforce object you want to generate a trigger for. If you don\'t specify --event, "before insert" is used.',
        {
            input: z.object({
                name: z
                    .string()
                    .describe(
                        "Name of the generated Apex trigger. The name can be up to 40 characters and must start with a letter."
                    ),
                sObjectName: z
                    .string()
                    .optional()
                    .describe("Salesforce object to generate a trigger on."),
                outputDir: z
                    .string()
                    .optional()
                    .describe(
                        "Directory for saving the created files. The location can be an absolute path or relative to the current working directory. The default is the current directory."
                    ),
            }),
        },
        async ({ input }) => {
            const { name, sObjectName, outputDir } = input;

            if (permissions.isReadOnly()) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                compiled: false,
                                compileProblem:
                                    "Operation not allowed: Cannot generate Apex trigger in READ_ONLY mode",
                            }),
                        },
                    ],
                };
            }

            const result = await generateTrigger(
                name,
                sObjectName || "",
                outputDir || ""
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "apex_log_list",
        "Fetch the list of apex debug logs returning the logs with their IDs.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
            }),
        },
        async ({ input }) => {
            const { targetOrg } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await apexLogList(targetOrg);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );

    server.tool(
        "apex_get_log",
        "Fetch the specified log or given number of most recent logs from the org.",
        {
            input: z.object({
                targetOrg: z
                    .string()
                    .describe(
                        "Username or alias of the target org. Not required if the 'target-org' configuration variable is already set."
                    ),
                logId: z
                    .string()
                    .optional()
                    .describe(
                        "ID of the specific log to display. Execute the apex_get_logs tool before to get the ids."
                    ),
                recentLogsNumber: z
                    .number()
                    .optional()
                    .describe("Number of the most recent logs to display."),
            }),
        },
        async ({ input }) => {
            const { targetOrg, logId, recentLogsNumber } = input;

            if (!permissions.isOrgAllowed(targetOrg)) {
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                success: false,
                                message: `Access to org '${targetOrg}' is not allowed`,
                            }),
                        },
                    ],
                };
            }

            const result = await apexGetLog(
                targetOrg,
                logId || "",
                recentLogsNumber || 0
            );
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(result),
                    },
                ],
            };
        }
    );
};
