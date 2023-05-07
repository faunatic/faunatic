import deepmerge from "ts-deepmerge";


type LogSeverity = "debug" | "info" | "warn" | "error";
type LogData = {
    severity: LogSeverity;
    message: string;
    ts: string;
    meta: any;
};
type LogMonitorEvent = {
    action: string;
    start: number;
    end: number;
    duration: number;
};


class MonitorCTX {
    public start: number;
    public end: number | null = null;

    constructor (public action: string, public meta = {}) {
        this.start = Date.now();
    }

    finished () {
        this.end = Date.now();
    }

    serialize (): LogMonitorEvent {
        return {
            action: this.action,
            end: this.end!,
            start: this.start!,
            duration: this.end! - this.start!
        };
    }
}


class LogCTX {
    public logs: LogData[] = [];
    public monitors: MonitorCTX[] = [];
    public onFinished: null | (() => any) = null;
    public consoleLog = false;

    constructor (public action: string, public meta = {}) {
    }

    finish () {
        this.onFinished?.();
    }

    addLog (severity: LogSeverity, message: string, meta = {}) {
        const ts = new Date().toISOString();
        const finalMeta = deepmerge.withOptions({ mergeArrays: false }, this.meta, meta);

        this.logs.push({
            severity,
            message,
            meta: finalMeta,
            ts
        });

        if (this.consoleLog) {
            console.log(`[${ severity }] (${ this.action }), ${ ts }: ${ message } - ${ JSON.stringify(finalMeta) }`);
        }
    }

    monitor (action: string, meta = {}) {
        const newMonitor = new MonitorCTX(action, meta);
        this.monitors.push(newMonitor);

        return newMonitor;
    }

    debug (message: string, meta = {}) {
        return this.addLog("debug", message, meta);
    }

    info (message: string, meta = {}) {
        return this.addLog("info", message, meta);
    }

    warn (message: string, meta = {}) {
        return this.addLog("warn", message, meta);
    }

    error (message: string, meta = {}) {
        return this.addLog("error", message, meta);
    }
}


export {
    LogCTX,
    MonitorCTX,
    LogData,
    LogSeverity,
    LogMonitorEvent
};
