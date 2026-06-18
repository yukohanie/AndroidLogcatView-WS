import React, {useEffect, useMemo, useRef, useState} from "react";
import {
    AlertCircle,
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    Bookmark,
    Columns,
    Download,
    ExternalLink,
    History,
    Info,
    Pause,
    Play,
    Search,
    Star,
    Trash2,
    X
} from "lucide-react"
import {FilterLogs, FilterOptions, LogEntry} from "../utils/LogFilter"
import {AppSettings} from "./SettingsPanel"

interface LogViewerProps
{
    logs: LogEntry[];
    onToggleStar: (id: string) => void;
    onClearLogs: () => void;
    settings: AppSettings;
    onSplit: (direction: "vertical" | "horizontal") => void;
    onCloseSplit: () => void;
    showCloseSplit: boolean;
    deviceConnected: boolean;
    onTogglePause: () => void;
    isPaused: boolean;
    onDetach?: () => void;
    showDetach?: boolean;
    devicePackages?: string[];
}

export const LogViewer: React.FC<LogViewerProps> = ({logs, onToggleStar, onClearLogs, settings, onSplit, onCloseSplit, showCloseSplit, deviceConnected, onTogglePause, isPaused, onDetach, showDetach = false, devicePackages = [] }) =>
{
    const [filterQuery, setFilterQuery] = useState("");
    const [matchCase, setMatchCase] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [starredOnly, setStarredOnly] = useState(false);
    const [activeLevels, setActiveLevels] = useState<Record<string, boolean>>
    ({
        VERBOSE: true,
        DEBUG: true,
        INFO: true,
        WARN: true,
        ERROR: true,
        FATAL: true,
    });

    const [viewMode, setViewMode] = useState<"standard" | "compact">("standard");
    const [autoScroll, setAutoScroll] = useState(true);
    const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

    const [findQuery, setFindQuery] = useState("");
    const [showFindBar, setShowFindBar] = useState(false);
    const [findMatches, setFindMatches] = useState<number[]>([]);
    const [findActiveIndex, setFindActiveIndex] = useState(-1);

    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [activeSuggestionIdx, setActiveSuggestionIdx] = useState(0);
    const filterInputRef = useRef<HTMLInputElement>(null);

    const [queryHistory, setQueryHistory] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const logListRef = useRef<HTMLDivElement>(null);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [viewportHeight, setViewportHeight] = useState(0);
    const ROW_HEIGHT = viewMode === "compact" ? 15 : 19;
    const OVERSCAN = 15;

    useEffect(() =>
    {
        const saved = localStorage.getItem("adb_logcat_history");
        if (saved)
        {
            try
            {
                setQueryHistory(JSON.parse(saved));
            }
            catch (e) { console.log(e) }
        }
    }, []);

    const filterOptions: FilterOptions = useMemo(() =>
    ({
        query: filterQuery,
        levels: activeLevels,
        matchCase,
        useRegex,
        starredOnly,
    }), [filterQuery, activeLevels, matchCase, useRegex, starredOnly]);

    const filteredLogs = useMemo(() =>
    {
        return FilterLogs(logs, filterOptions);
    }, [logs, filterOptions]);

    const autocompleteSource = useMemo(() =>
    {
        const tags = new Set<string>();
        const pkgs = new Set<string>();
        logs.forEach(l =>
        {
            if (l.tag) tags.add(l.tag);
            if (l.package_name && l.package_name !== "unknown") pkgs.add(l.package_name);
        });
        devicePackages.forEach(p => pkgs.add(p));
        return {
            tags: Array.from(tags).slice(0, 20),
            packages: Array.from(pkgs).slice(0, 30),
        };
    }, [logs, devicePackages]);

    useEffect(() =>
    {
        if (autoScroll && logListRef.current)
        {
            logListRef.current.scrollTop = logListRef.current.scrollHeight;
        }
    }, [filteredLogs, autoScroll]);

    useEffect(() =>
    {
        const el = logListRef.current;
        if (!el)
            return;

        const handleScroll = () => setScrollOffset(el.scrollTop);
        const handleResize = () => setViewportHeight(el.clientHeight);
        handleResize();

        el.addEventListener("scroll", handleScroll, { passive: true });
        const ro = new ResizeObserver(handleResize);
        ro.observe(el);

        return () =>
        {
            el.removeEventListener("scroll", handleScroll);
            ro.disconnect();
        };
    }, []);

    const totalRows = filteredLogs.length;
    const startIndex = Math.max(0, Math.floor(scrollOffset / ROW_HEIGHT) - OVERSCAN);
    const endIndex = Math.min(totalRows, Math.ceil((scrollOffset + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
    const visibleLogs = filteredLogs.slice(startIndex, endIndex);
    const totalHeight = totalRows * ROW_HEIGHT;

    useEffect(() =>
    {
        if (autoScroll && logListRef.current && filteredLogs.length > 0)
        {
            requestAnimationFrame(() =>
            {
                if (logListRef.current)
                {
                    logListRef.current.scrollTop = logListRef.current.scrollHeight;
                }
            });
        }
    }, []);

    useEffect(() =>
    {
        if (!findQuery)
        {
            setFindMatches([]);
            setFindActiveIndex(-1);
            return;
        }

        const matches: number[] = [];
        filteredLogs.forEach((log, idx) =>
        {
            const matchText = `${log.tag} ${log.message} ${log.package_name}`;
            const isMatch = matchCase
                ? matchText.includes(findQuery)
                : matchText.toLowerCase().includes(findQuery.toLowerCase());
            if (isMatch)
                matches.push(idx);
        });

        setFindMatches(matches);
        setFindActiveIndex(matches.length > 0 ? 0 : -1);
    }, [findQuery, filteredLogs, matchCase]);

    useEffect(() =>
    {
        if (findActiveIndex >= 0 && findMatches[findActiveIndex] !== undefined)
        {
            const matchRowIdx = findMatches[findActiveIndex];
            const container = logListRef.current;
            if (container)
            {
                const rowElement = container.children[matchRowIdx] as HTMLElement;
                if (rowElement)
                {
                    rowElement.scrollIntoView({ block: "center", behavior: "smooth" });
                    setSelectedLogId(filteredLogs[matchRowIdx].id);
                }
            }
        }
    }, [findActiveIndex, findMatches, filteredLogs]);

    useEffect(() =>
    {
        const handleKeyDown = (e: KeyboardEvent) =>
        {
            if ((e.ctrlKey || e.metaKey) && e.key === "f")
            {
                e.preventDefault();
                setShowFindBar(true);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const saveQueryToHistory = (q: string) =>
    {
        const trimmed = q.trim();
        if (!trimmed || queryHistory.includes(trimmed)) return;

        const nextHistory = [trimmed, ...queryHistory.slice(0, 9)];

        setQueryHistory(nextHistory);
        localStorage.setItem("adb_logcat_history", JSON.stringify(nextHistory));
    };

    const deleteHistoryItem = (e: React.MouseEvent, q: string) =>
    {
        e.stopPropagation();
        const nextHistory = queryHistory.filter(item => item !== q);

        setQueryHistory(nextHistory);
        localStorage.setItem("adb_logcat_history", JSON.stringify(nextHistory));
    };

    const toggleLevel = (lvl: string) =>
    {
        setActiveLevels(prev =>
        ({
            ...prev,
            [lvl]: !prev[lvl]
        }));
    };

    const updateSuggestions = (val: string) =>
    {
        const words = val.split(/\s+/);
        const lastWord = words[words.length - 1];
        if (!lastWord)
        {
            setSuggestions(["tag:", "package:", "level:", "pid:", "tid:", "process:"]);
            setShowSuggestions(true);
            setActiveSuggestionIdx(0);
            return;
        }

        let nextSuggestions: string[] = [];
        const prefixes = ["tag:", "package:", "level:", "pid:", "tid:", "process:"];

        if (!lastWord.includes(":"))
            nextSuggestions = prefixes.filter(p => p.startsWith(lastWord.toLowerCase()));
        else
        {
            const [prefix, queryVal] = lastWord.split(":");
            const lowerQuery = queryVal.toLowerCase();
            if (prefix === "tag")
            {
                nextSuggestions = autocompleteSource.tags
                    .filter(t => t.toLowerCase().includes(lowerQuery))
                    .map(t => `tag:${t}`);
            }
            else if (prefix === "package")
            {
                nextSuggestions = autocompleteSource.packages
                    .filter(p => p.toLowerCase().includes(lowerQuery))
                    .map(p => `package:${p}`);
            }
            else if (prefix === "level")
            {
                nextSuggestions = ["VERBOSE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]
                    .filter(l => l.toLowerCase().startsWith(lowerQuery))
                    .map(l => `level:${l}`);
            }
        }
        if (nextSuggestions.length > 0)
        {
            setSuggestions(nextSuggestions);
            setShowSuggestions(true);
            setActiveSuggestionIdx(0);
        }
        else setShowSuggestions(false);
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    {
        const val = e.target.value;
        setFilterQuery(val);
        updateSuggestions(val);
    };

    const handleSuggestionSelect = (suggestion: string) =>
    {
        const words = filterQuery.split(/\s+/);
        words[words.length - 1] = suggestion;

        const nextQuery = words.join(" ") + " ";
        setFilterQuery(nextQuery);
        setShowSuggestions(false);

        filterInputRef.current?.focus();
    };

    const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) =>
    {
        if (e.ctrlKey && e.key === " ")
        {
            e.preventDefault();
            updateSuggestions(filterQuery);
            return;
        }

        if (showSuggestions)
        {
            if (e.key === "ArrowDown")
            {
                e.preventDefault();
                setActiveSuggestionIdx(prev => (prev + 1) % suggestions.length);
            }
            else if (e.key === "ArrowUp")
            {
                e.preventDefault();
                setActiveSuggestionIdx(prev => (prev - 1 + suggestions.length) % suggestions.length);
            }
            else if (e.key === "Enter" || e.key === "Tab")
            {
                e.preventDefault();
                handleSuggestionSelect(suggestions[activeSuggestionIdx]);
            }
            else if (e.key === "Escape")
            {
                setShowSuggestions(false);
            }
        }
        else if (e.key === "Enter")
        {
            saveQueryToHistory(filterQuery);
            setShowHistory(false);
        }
    };

    const findNext = () =>
    {
        if (findMatches.length === 0) return;
        setFindActiveIndex(prev => (prev + 1) % findMatches.length);
    };

    const findPrev = () =>
    {
        if (findMatches.length === 0) return;
        setFindActiveIndex(prev => (prev - 1 + findMatches.length) % findMatches.length);
    };

    const handleExport = () =>
    {
        const text = filteredLogs.map(l =>
        {
            const time = l.timestamp;
            const pidTid = `${l.pid}-${l.tid}`.padEnd(11);
            const tag = l.tag.padEnd(20);
            const pkg = l.package_name.padEnd(30);
            const proc = l.process_name.padEnd(30);
            return `${time} ${pidTid} ${tag} ${pkg} ${proc} ${l.level.padEnd(2)} ${l.message}`;
        }).join("\n");

        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `logcat_${new Date().toISOString().slice(0,19).replace(/[:]/g,"-")}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`panel ${viewMode === "compact" ? "compact-view" : ""}`}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border-color)", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", backgroundColor: "var(--bg-secondary)" }}>
                <div style={{ position: "relative", flexGrow: 1, display: "flex", minWidth: "250px" }}>
                    <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }}>
                        <Search size={16} />
                    </div>

                    <input
                        ref={filterInputRef}
                        type="text"
                        className="input-flat"
                        placeholder='Filter logs (e.g. tag:ActivityManager level:E -message:ignored)...'
                        value={filterQuery}
                        onChange={handleFilterChange}
                        onKeyDown={handleFilterKeyDown}
                        onFocus={() => {if (queryHistory.length > 0) setShowHistory(true);}}
                        onBlur={() =>
                        {
                            setTimeout(() =>
                            {
                                setShowSuggestions(false);
                                setShowHistory(false);
                            }, 200);
                        }}
                        style={{ paddingLeft: "32px", paddingRight: "32px", width: "100%", height: "36px", fontSize: "13px" }}
                    />
                    {filterQuery && (
                        <button
                            onClick={() => setFilterQuery("")}
                            style={{ position: "absolute", right: "32px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                        >
                            <X size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        title="Search History"
                        style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                    >
                        <History size={16} />
                    </button>

                    {showSuggestions && (
                        <div className="autocomplete-box">
                            {suggestions.map((suggestion, idx) => (
                                <div
                                    key={idx}
                                    className={`autocomplete-item ${idx === activeSuggestionIdx ? "active" : ""}`}
                                    onMouseDown={() => handleSuggestionSelect(suggestion)}
                                >
                                    <span style={{ fontWeight: 600 }}>{suggestion.split(":")[0]}:</span>
                                    <span style={{ color: "var(--text-secondary)" }}>{suggestion.split(":")[1]}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {showHistory && queryHistory.length > 0 && (
                        <div className="autocomplete-box">
                            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-color)", fontSize: "11px", fontWeight: "bold", color: "var(--text-secondary)" }}>Recent Queries</div>
                            {queryHistory.map((q, idx) => (
                                <div
                                    key={idx}
                                    className="autocomplete-item"
                                    onMouseDown={() => setFilterQuery(q)}
                                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                >
                                    <span>{q}</span>
                                    <button
                                        onMouseDown={(e) => deleteHistoryItem(e, q)}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="level-pills-container">
                    {["VERBOSE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"].map((lvl) =>
                    {
                        const isActive = activeLevels[lvl];
                        const lowerLvl = lvl[0].toLowerCase();
                        return (
                            <button
                                key={lvl}
                                onClick={() => toggleLevel(lvl)}
                                className={`level-pill ${isActive ? `active ${lowerLvl}` : ""}`}
                                title={lvl}
                            >
                                {lvl[0]}
                            </button>
                        );
                    })}
                </div>

                <div style={{ display: "flex", gap: "6px" }}>
                    <button
                        onClick={() => setMatchCase(!matchCase)}
                        className="btn-flat"
                        style={{ height: "36px", backgroundColor: matchCase ? "var(--bg-tertiary)" : "transparent" }}
                        title="Match Case"
                    >
                        Cc
                    </button>
                    <button
                        onClick={() => setUseRegex(!useRegex)}
                        className="btn-flat"
                        style={{ height: "36px", backgroundColor: useRegex ? "var(--bg-tertiary)" : "transparent" }}
                        title="Use Regular Expression"
                    >
                        .*
                    </button>
                    <button
                        onClick={() => setStarredOnly(!starredOnly)}
                        className="btn-flat"
                        style={{ height: "36px", backgroundColor: starredOnly ? "var(--bg-tertiary)" : "transparent" }}
                        title="Show Starred Logs Only"
                    >
                        <Star size={16} fill={starredOnly ? "var(--log-w-color)" : "none"} color={starredOnly ? "var(--log-w-color)" : "currentColor"} />
                    </button>
                </div>
            </div>

            <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", backgroundColor: "var(--bg-primary)" }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                        onClick={onTogglePause}
                        className={`btn-flat ${isPaused ? "" : "btn-primary"}`}
                        title={isPaused ? "Resume Streaming" : "Pause Streaming"}
                        disabled={!deviceConnected}
                    >
                        {isPaused ? <Play size={16} /> : <Pause size={16} />}
                        <span style={{ fontSize: "13px" }}>{isPaused ? "Play" : "Pause"}</span>
                    </button>

                    <button onClick={onClearLogs} className="btn-flat" title="Clear Buffer">
                        <Trash2 size={16} />
                        <span style={{ fontSize: "13px" }}>Clear</span>
                    </button>

                    <span style={{ width: "1px", height: "18px", backgroundColor: "var(--border-color)" }}></span>

                    <label className="switch-container">
                        <span className="switch">
                            <input
                                type="checkbox"
                                checked={autoScroll}
                                onChange={(e) => setAutoScroll(e.target.checked)}
                            />
                            <span className="slider"></span>
                        </span>
                        <span style={{ fontSize: "13px" }}>Auto Scroll</span>
                    </label>

                    <button onClick={() => { setAutoScroll(false); if(logListRef.current) logListRef.current.scrollTop = 0; }} className="btn-flat" title="Jump to Top" style={{ padding: "4px 8px" }}>
                        <ArrowUp size={16} />
                    </button>

                    <button onClick={() => { if(logListRef.current) logListRef.current.scrollTop = logListRef.current.scrollHeight; }} className="btn-flat" title="Jump to Bottom" style={{ padding: "4px 8px" }}>
                        <ArrowDown size={16} />
                    </button>
                </div>

                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                        className="select-flat"
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value as "standard" | "compact")}
                        style={{ padding: "4px 8px", height: "30px", fontSize: "12px" }}
                    >
                        <option value="standard">Standard View</option>
                        <option value="compact">Compact View</option>
                    </select>

                    <button onClick={handleExport} className="btn-flat" title="Export Log File" style={{ padding: "4px 8px" }}>
                        <Download size={16} />
                    </button>

                    <span style={{ width: "1px", height: "18px", backgroundColor: "var(--border-color)" }}></span>

                    <button onClick={() => onSplit("horizontal")} className="btn-flat" title="Split Horizontally" style={{ padding: "4px 8px" }}>
                        <Columns size={16} />
                    </button>

                    <button onClick={() => onSplit("vertical")} className="btn-flat" title="Split Vertically" style={{ padding: "4px 8px" }}>
                        <Columns size={16} style={{ transform: "rotate(90deg)" }} />
                    </button>

                    {showDetach && onDetach && (
                        <button onClick={onDetach} className="btn-flat" title="Detach/Float Window" style={{ padding: "4px 8px" }}>
                            <ExternalLink size={16} />
                        </button>
                    )}

                    {showCloseSplit && (
                        <button onClick={onCloseSplit} className="btn-flat" title="Close Split Window" style={{ padding: "4px 8px", backgroundColor: "#fecaca", borderColor: "#fca5a5", color: "#b91c1c" }}>
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {showFindBar && (
                <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border-color)", display: "flex", gap: "8px", alignItems: "center", backgroundColor: "var(--bg-tertiary)" }}>
                    <div style={{ position: "relative", width: "250px", display: "flex" }}>
                        <input
                            type="text"
                            className="input-flat"
                            placeholder="Find in logs..."
                            value={findQuery}
                            onChange={(e) => setFindQuery(e.target.value)}
                            style={{ width: "100%", height: "28px", paddingRight: "24px", fontSize: "12px" }}
                            autoFocus
                        />
                        {findQuery && (
                            <button
                                onClick={() => setFindQuery("")}
                                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        {findMatches.length > 0 ? `${findActiveIndex + 1} of ${findMatches.length}` : "No results"}
                    </span>
                    <button onClick={findPrev} disabled={findMatches.length === 0} className="btn-flat" style={{ padding: "2px 6px", fontSize: "11px" }}>Prev</button>
                    <button onClick={findNext} disabled={findMatches.length === 0} className="btn-flat" style={{ padding: "2px 6px", fontSize: "11px" }}>Next</button>
                    <button onClick={() => { setShowFindBar(false); setFindQuery(""); }} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>
                        <X size={16} />
                    </button>
                </div>
            )}

            <div
                ref={logListRef}
                style={{ flexGrow: 1, overflowY: "auto", overflowX: "auto", backgroundColor: "var(--bg-primary)", contain: "strict" }}
            >
                {filteredLogs.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--text-tertiary)", gap: "8px" }}>
                        <Bookmark size={36} style={{ strokeWidth: 1 }} />
                        <span style={{ fontSize: "14px" }}>
                            {logs.length === 0
                                ? (deviceConnected ? "Waiting for logcat stream..." : "No device selected. Please select a device.")
                                : "No logs match the current filters."}
                        </span>
                    </div>
                ) : (
                    <div style={{ height: totalHeight, position: "relative" }}>
                        <div style={{ position: "absolute", top: startIndex * ROW_HEIGHT, left: 0, right: 0 }}>
                            {visibleLogs.map((log, i) =>
                            {
                                const globalIndex = startIndex + i;
                                const isSelected = selectedLogId === log.id;
                                const isTagRepeated = !settings.showRepeatedTags &&
                                    globalIndex > 0 &&
                                    filteredLogs[globalIndex - 1].tag === log.tag;

                                return (
                                    <LogRow
                                        key={log.id}
                                        log={log}
                                        isSelected={isSelected}
                                        isTagRepeated={isTagRepeated}
                                        settings={settings}
                                        onToggleStar={onToggleStar}
                                        onSelect={setSelectedLogId}
                                        getLevelIcon={getLevelIcon}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            <div style={{ padding: "4px 12px", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-secondary)", backgroundColor: "var(--bg-secondary)" }}>
                <span>Filtered: {filteredLogs.length} / {logs.length} logs</span>
                <span>Buffer limit: {settings.bufferLimit} lines</span>
            </div>
        </div>
    )
}

const getLevelIcon = (level: string) =>
{
    switch (level.toUpperCase())
    {
        case "WARN": return <AlertTriangle size={14} className="level-w" />;
        case "ERROR": return <AlertCircle size={14} className="level-e" />;
        case "FATAL": return <AlertCircle size={14} className="level-f" style={{ strokeWidth: 3 }} />;
        default: return <Info size={14} className="level-i" />;
    }
};

interface LogRowProps
{
    log: LogEntry;
    isSelected: boolean;
    isTagRepeated: boolean;
    settings: AppSettings;
    onToggleStar: (id: string) => void;
    onSelect: (id: string) => void;
    getLevelIcon: (level: string) => React.ReactNode;
}

const LogRow: React.FC<LogRowProps> = React.memo(({ log,  isSelected,  isTagRepeated,  settings,  onToggleStar,  onSelect,  getLevelIcon }) =>
{
    const levelClass = `level-${log.level.toLowerCase()}`;
    const rowStyle: React.CSSProperties = settings.colorizeRow?
    {
        backgroundColor: `var(--log-${log.level.toLowerCase()}-bg)`
    } : {};

    return (
        <div
            onClick={() => onSelect(log.id)}
            className={`log-row ${isSelected ? "selected" : ""}`}
            style={rowStyle}
        >
            <div
                className="log-col col-star"
                onClick={(e) =>
                {
                    e.stopPropagation();
                    onToggleStar(log.id);
                }}
            >
                <Star
                    size={13}
                    fill={log.starred ? "var(--log-w-color)" : "none"}
                    color={log.starred ? "var(--log-w-color)" : "var(--text-tertiary)"}
                    style={{ cursor: "pointer" }}
                />
            </div>

            {settings.showTimestamp && (
                <div className="log-col col-time">
                    {settings.formatTimestamp === "short" ? log.timestamp.split(" ")[1] : log.timestamp}
                </div>
            )}

            {settings.showPidTid && (
                <div className="log-col col-pid-tid">
                    {log.pid}-{log.tid}
                </div>
            )}

            <div className={`log-col col-level ${levelClass}`}>
                {log.level[0]}
            </div>

            {settings.showTag && (
                <div
                    className="log-col col-tag"
                    style={{ width: `${settings.tagWidth}px`, opacity: isTagRepeated ? 0.3 : 1 }}
                    title={log.tag}
                >
                    {isTagRepeated ? "" : log.tag}
                </div>
            )}

            {settings.showPackage && (
                <div className="log-col col-package" title={log.package_name}>
                    {log.package_name}
                </div>
            )}

            {settings.showProcess && (
                <div className="log-col col-process" title={log.process_name}>
                    {log.process_name}
                </div>
            )}

            <div className={`log-col col-message ${levelClass}`}>
                {getLevelIcon(log.level)}
                <span style={{ marginLeft: "6px" }}>{log.message}</span>
            </div>
        </div>
    );
});

LogRow.displayName = "LogRow";
