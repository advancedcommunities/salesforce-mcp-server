import type {
    ServerNotification,
    ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";

export type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export function createProgressReporter(extra: ToolExtra, total: number) {
    const progressToken = extra._meta?.progressToken;
    let current = 0;

    return (message: string) => {
        if (!progressToken) return;
        current++;
        extra
            .sendNotification({
                method: "notifications/progress",
                params: { progressToken, progress: current, total, message },
            })
            .catch(() => {});
    };
}
