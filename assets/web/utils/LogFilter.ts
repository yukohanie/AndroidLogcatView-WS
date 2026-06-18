export interface LogEntry
{
    timestamp: string;
    pid: number;
    tid: number;
    level: string;
    tag: string;
    package_name: string,
    process_name: string,
    message: string,
    starred?: boolean;
    id: string
}

export interface FilterOptions
{
    query: string;
    levels: Record<string, boolean>;
    matchCase: boolean;
    useRegex: boolean;
    starredOnly: boolean;
}

export function ParseFilterQuery(query: string)
{
    const tokens: { key?: string; value: string; isNegative: boolean }[] = [];
    const regex = /(-)?(?:(\w+):)?(?:([^"\s]+)|"([^"]*)")/g;

    let match;
    while ((match = regex.exec(query)) !== null)
    {
        const isNegative = !!match[1];
        const key = match[2];
        const value = match[3] || match[4] || "";
        tokens.push({ key: key?.toLowerCase(), value, isNegative });
    }
    return tokens;
}

export function FilterLogs(logs: LogEntry[], options: FilterOptions): LogEntry[]
{
    const { query, levels, matchCase, useRegex, starredOnly } = options;
    const filtered = logs.filter(log =>
    {
        if (starredOnly && !log.starred)
            return false;

        const levelKey = log.level.toUpperCase();
        const levelMap: Record<string, string> = {
            "V": "VERBOSE",
            "D": "DEBUG",
            "I": "INFO",
            "W": "WARN",
            "E": "ERROR",
            "F": "FATAL",
            "S": "SILENT"
        };

        const mappedLevel = levelMap[levelKey] || levelKey;
        return !(!levels[mappedLevel] || !levels[levelKey]);

    });

    const queryTrimmed = query.trim()
    if (!queryTrimmed)
        return filtered;

    const tokens = ParseFilterQuery(queryTrimmed);
    if (tokens.length === 0)
        return filtered;

    return filtered.filter(log =>
    {
        for (const token of tokens)
        {
            let isMatch = false;
            const val = token.value;
            const isNeg = token.isNegative;

            const testString = (target: string) =>
            {
                if (!target)
                    return false;

                if (useRegex)
                {
                    try
                    {
                        const flags = matchCase ? "" : "i";
                        const rx = new RegExp(val, flags);
                        return rx.test(target);
                    }
                    catch
                    {
                        return matchCase ? target.includes(val)
                                         : target.toLowerCase().includes(val.toLowerCase());
                    }
                }
                else
                {
                    return matchCase
                        ? target.includes(val)
                        : target.toLowerCase().includes(val.toLowerCase());
                }
            };

            if (token.key)
            {
                switch (token.key)
                {
                    case "tag":
                        isMatch = testString(log.tag);
                        break;
                    case "package":
                        isMatch = testString(log.package_name);
                        break;
                    case "process":
                        isMatch = testString(log.process_name);
                        break;
                    case "message":
                    case "msg":
                        isMatch = testString(log.message);
                        break;
                    case "level":
                        isMatch = log.level.toUpperCase() === val.toUpperCase() ||
                            log.level.toUpperCase().startsWith(val.toUpperCase());
                        break;
                    case "pid":
                        isMatch = log.pid.toString() === val;
                        break;
                    case "tid":
                        isMatch = log.tid.toString() === val;
                        break;
                    case "time":
                    {
                        const timePart = log.timestamp.split(" ")[1] || "";
                        if (val.startsWith(">"))
                            isMatch = timePart >= val.slice(1);
                        else if (val.startsWith("<"))
                            isMatch = timePart <= val.slice(1);
                        else if (val.includes("-"))
                        {
                            const parts = val.split("-");
                            if (parts.length === 2)
                                isMatch = timePart >= parts[0] && timePart <= parts[1];
                        }
                        else
                            isMatch = timePart.includes(val);
                        break;
                    }
                    default:
                        isMatch = testString(`${token.key}:${val}`);
                        break;
                }
            }
            else
            {
                isMatch = testString(log.message) ||
                    testString(log.tag) ||
                    testString(log.package_name) ||
                    testString(log.process_name);
            }

            if (isNeg)
            {
                if (isMatch)
                    return false;
            }
            else
            {
                if (!isMatch)
                    return false;
            }
        }
        return true;
    })
}