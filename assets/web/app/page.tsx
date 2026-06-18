"use client";

import React, {useCallback, useEffect, useRef, useState} from "react";
import {AnimatePresence} from "framer-motion";
import {
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    Pin,
    PinOff,
    Plus,
    RefreshCw,
    RotateCw,
    Settings,
    SquareTerminal,
    X
} from "lucide-react";
import {LogEntry} from "../utils/LogFilter";
import {LogViewer} from "../components/LogView";
import {AppSettings, defaultSettings, SettingsPanel} from "../components/SettingsPanel";

interface PaneCell
{
    id: string;
    title: string;
    isPinned: boolean;
    isFloating: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
}

type SnapZoneId =
    | "left-half"
    | "right-half"
    | "top-half"
    | "bottom-half"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "maximize";

interface SnapZone
{
    id: SnapZoneId;
    trigger: [number, number, number, number];
    result: [number, number, number, number];
    label: string;
}

const SNAP_ZONES: SnapZone[] = [
    {id: "maximize", trigger: [0.05, 0, 0.90, 0.08], result: [0, 0, 1, 1], label: "⬜ Maximize"},
    {id: "left-half", trigger: [0, 0.08, 0.08, 0.84], result: [0, 0, 0.5, 1], label: "◧ Left half"},
    {id: "right-half", trigger: [0.92, 0.08, 0.08, 0.84], result: [0.5, 0, 0.5, 1], label: "◨ Right half"},
    {id: "top-half", trigger: [0.08, 0, 0.84, 0.08], result: [0, 0, 1, 0.5], label: "⬒ Top half"},
    {id: "bottom-half", trigger: [0.08, 0.92, 0.84, 0.08], result: [0, 0.5, 1, 0.5], label: "⬓ Bottom half"},
    {id: "top-left", trigger: [0, 0, 0.12, 0.12], result: [0, 0, 0.5, 0.5], label: "↖ Top-left"},
    {id: "top-right", trigger: [0.88, 0, 0.12, 0.12], result: [0.5, 0, 0.5, 0.5], label: "↗ Top-right"},
    {id: "bottom-left", trigger: [0, 0.88, 0.12, 0.12], result: [0, 0.5, 0.5, 0.5], label: "↙ Bottom-left"},
    {id: "bottom-right", trigger: [0.88, 0.88, 0.12, 0.12], result: [0.5, 0.5, 0.5, 0.5], label: "↘ Bottom-right"},
];

function getActiveSnapZone(
    localX: number, localY: number,
    ww: number, wh: number
): SnapZone | null
{
    for (const zone of SNAP_ZONES)
    {
        const [tx, ty, tw, th] = zone.trigger;
        if (
            localX >= tx * ww && localX <= (tx + tw) * ww &&
            localY >= ty * wh && localY <= (ty + th) * wh
        ) return zone;
    }
    return null;
}

export default function DashboardPage()
{
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [devices, setDevices] = useState<string[]>([]);
    const [selectedDevice, setSelectedDevice] = useState<string>("");
    const [deviceConnected, setDeviceConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [devicePackages, setDevicePackages] = useState<string[]>([]);

    const [settings, setSettings] = useState<AppSettings>(defaultSettings);
    const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);

    const [panes, setPanes] = useState<PaneCell[]>
    ([
        {id: "pane-1", title: "Tab 1", isPinned: false, isFloating: false, x: 150, y: 150, width: 600, height: 400}
    ]);
    const [activePaneId, setActivePaneId] = useState<string | null>("pane-1");
    const [floatingPanesOrder, setFloatingPanesOrder] = useState<string[]>(["pane-1"]);
    const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

    const [editingPaneId, setEditingPaneId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");

    const [activeDragPaneId, setActiveDragPaneId] = useState<string | null>(null);
    const [hoveredSnapZone, setHoveredSnapZone] = useState<SnapZone | null>(null);
    const dragStartOffsetRef = useRef({x: 0, y: 0});
    const draggedPosRef = useRef({x: 0, y: 0, width: 0, height: 0});
    const workspaceRef = useRef<HTMLDivElement>(null);

    const incomingLogsRef = useRef<LogEntry[]>([]);
    const socketRef = useRef<WebSocket | null>(null);

    const isPausedRef = useRef(isPaused);
    useEffect(() =>
    {
        isPausedRef.current = isPaused;
    }, [isPaused]);

    useEffect(() =>
    {
        const saved = localStorage.getItem("adb_logcat_settings");
        if (saved)
        {
            try
            {
                setSettings(JSON.parse(saved));
            }
            catch (e)
            {
            }
        }
    }, []);

    useEffect(() =>
    {
        const root = document.documentElement;
        if (settings.theme === "auto")
        {
            root.removeAttribute("data-theme");
        }
        else
        {
            root.setAttribute("data-theme", settings.theme);
        }
        localStorage.setItem("adb_logcat_settings", JSON.stringify(settings));
    }, [settings]);

    useEffect(() =>
    {
        let active = true;
        const fetchDevices = async () =>
        {
            try
            {
                const res = await fetch("/api/devices");
                if (!res.ok) throw new Error("Failed to fetch devices");
                const data = await res.json();
                if (active)
                {
                    setDevices(data);
                    if (data.length > 0 && !selectedDevice)
                    {
                        setSelectedDevice(data[0]);
                    }
                }
            }
            catch (e)
            {
                console.error(e);
            }
        };

        fetchDevices();
        const interval = setInterval(fetchDevices, 5000);

        return () =>
        {
            active = false;
            clearInterval(interval);
        };
    }, [selectedDevice, refreshKey]);

    useEffect(() =>
    {
        if (!selectedDevice)
        {
            setDevicePackages([]);
            return;
        }
        const fetchPackages = async () =>
        {
            try
            {
                const res = await fetch(`/api/packages?device=${encodeURIComponent(selectedDevice)}`);
                if (res.ok)
                {
                    const data = await res.json();
                    setDevicePackages(data);
                }
            }
            catch (e)
            {
                console.error("Failed to fetch packages:", e);
            }
        };
        fetchPackages();
    }, [selectedDevice]);

    useEffect(() =>
    {
        const interval = setInterval(() =>
        {
            if (incomingLogsRef.current.length === 0) return;
            const batch = incomingLogsRef.current;
            incomingLogsRef.current = [];

            setLogs(prev =>
            {
                const nextLogs = [...prev, ...batch];
                if (nextLogs.length > settings.bufferLimit)
                {
                    return nextLogs.slice(nextLogs.length - settings.bufferLimit);
                }
                return nextLogs;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [settings.bufferLimit]);

    useEffect(() =>
    {
        if (!selectedDevice)
        {
            setDeviceConnected(false);
            setLogs([]);
            return;
        }

        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        const wsUrl = `${protocol}//${host}/ws/logcat?device=${encodeURIComponent(selectedDevice)}`;

        console.log(`Connecting to WebSocket: ${wsUrl}`);
        const ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onopen = () =>
        {
            console.log("WebSocket connection established");
            setDeviceConnected(true);
            setLogs([]);
            incomingLogsRef.current = [];
        };

        ws.onmessage = (event) =>
        {
            try
            {
                const logEntry: LogEntry = JSON.parse(event.data);
                logEntry.starred = false;
                if (!logEntry.id)
                {
                    logEntry.id = `${Date.now()}-${Math.random()}`;
                }

                if (!isPausedRef.current)
                {
                    incomingLogsRef.current.push(logEntry);
                }
            }
            catch (e)
            {
                console.error("Error parsing WebSocket log line:", e);
            }
        };

        ws.onclose = () =>
        {
            console.log("WebSocket connection closed");
            setDeviceConnected(false);
        };

        ws.onerror = (err) =>
        {
            console.error("WebSocket error:", err);
            setDeviceConnected(false);
        };

        return () =>
        {
            ws.close();
            socketRef.current = null;
        };
    }, [selectedDevice]);

    const getStatusDotColor = () =>
    {
        if (deviceConnected) return "#16A34A";
        if (selectedDevice) return "#CA8A04";
        return "#DC2626";
    };

    const handleFloatingDragStart = (e: React.MouseEvent, id: string) =>
    {
        e.preventDefault();
        setActiveDragPaneId(id);
        handleFocusFloatingPane(id);
        const targetPane = panes.find(p => p.id === id);
        if (targetPane)
        {
            const wsRect = workspaceRef.current?.getBoundingClientRect();
            const wsX = wsRect ? e.clientX - wsRect.left : 0;
            const wsY = wsRect ? e.clientY - wsRect.top : 0;
            dragStartOffsetRef.current = {x: wsX - targetPane.x, y: wsY - targetPane.y};
            draggedPosRef.current = {
                x: targetPane.x,
                y: targetPane.y,
                width: targetPane.width,
                height: targetPane.height
            };
        }
    };

    useEffect(() =>
    {
        if (!activeDragPaneId) return;

        const handleMouseMove = (e: MouseEvent) =>
        {
            const wsRect = workspaceRef.current?.getBoundingClientRect();
            if (!wsRect) return;
            const localX = e.clientX - wsRect.left;
            const localY = e.clientY - wsRect.top;
            const ww = wsRect.width;
            const wh = wsRect.height;

            const zone = getActiveSnapZone(localX, localY, ww, wh);
            setHoveredSnapZone(zone);

            if (zone) return;

            const offset = dragStartOffsetRef.current;
            let newX = localX - offset.x;
            let newY = localY - offset.y;
            const MIN_VISIBLE = 80;
            const winW = draggedPosRef.current.width || 600;
            newX = Math.max(-winW + MIN_VISIBLE, Math.min(ww - MIN_VISIBLE, newX));
            newY = Math.max(0, Math.min(wh - MIN_VISIBLE, newY));

            draggedPosRef.current = {...draggedPosRef.current, x: newX, y: newY};

            const el = document.getElementById(`floating-window-${activeDragPaneId}`);
            if (el)
            {
                el.style.left = `${newX}px`;
                el.style.top = `${newY}px`;
            }
        };

        const handleMouseUp = () =>
        {
            const wsRect = workspaceRef.current?.getBoundingClientRect();

            if (hoveredSnapZone && wsRect)
            {
                const [rx, ry, rw, rh] = hoveredSnapZone.result;
                const snappedX = rx * wsRect.width;
                const snappedY = ry * wsRect.height;
                const snappedW = rw * wsRect.width;
                const snappedH = rh * wsRect.height;

                setPanes(prev => prev.map(p =>
                {
                    if (p.id !== activeDragPaneId) return p;
                    return {...p, x: snappedX, y: snappedY, width: snappedW, height: snappedH};
                }));

                const el = document.getElementById(`floating-window-${activeDragPaneId}`);
                if (el)
                {
                    el.style.left = `${snappedX}px`;
                    el.style.top = `${snappedY}px`;
                    el.style.width = `${snappedW}px`;
                    el.style.height = `${snappedH}px`;
                }
            }
            else
            {
                setPanes(prev => prev.map(p =>
                {
                    if (p.id !== activeDragPaneId) return p;
                    return {...p, x: draggedPosRef.current.x, y: draggedPosRef.current.y};
                }));
            }
            setHoveredSnapZone(null);
            setActiveDragPaneId(null);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () =>
        {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [activeDragPaneId, hoveredSnapZone]);

    const tabContainerRef = useRef<HTMLDivElement>(null);

    const scrollTabs = (direction: "left" | "right") =>
    {
        if (tabContainerRef.current)
        {
            const amt = 150;
            tabContainerRef.current.scrollLeft += direction === "left" ? -amt : amt;
        }
    };

    const handleTabWheel = (e: React.WheelEvent) =>
    {
        if (tabContainerRef.current)
        {
            e.preventDefault();
            tabContainerRef.current.scrollLeft += e.deltaY;
        }
    };

    const handleDragStart = (id: string) =>
    {
        setDraggedTabId(id);
    };

    const handleDragOver = (e: React.DragEvent) =>
    {
        e.preventDefault();
    };

    const handleDrop = (targetId: string) =>
    {
        if (!draggedTabId || draggedTabId === targetId) return;
        setPanes(prev =>
        {
            const fromIdx = prev.findIndex(p => p.id === draggedTabId);
            const toIdx = prev.findIndex(p => p.id === targetId);
            const copy = [...prev];
            const [moved] = copy.splice(fromIdx, 1);
            copy.splice(toIdx, 0, moved);
            return copy;
        });
        setDraggedTabId(null);
    };

    const handleAddTab = useCallback(() =>
    {
        setPanes(prev =>
        {
            let defaultTabCount = 0;
            prev.forEach(p =>
            {
                if (/^Tab \d+$/.test(p.title))
                {
                    defaultTabCount++;
                }
            });
            const nextNum = defaultTabCount + 1;
            const nextPaneId = `pane-${Date.now()}`;
            const newPane: PaneCell = {
                id: nextPaneId,
                title: `Tab ${nextNum}`,
                isPinned: false,
                isFloating: false,
                x: 150,
                y: 150,
                width: 600,
                height: 400
            };

            setTimeout(() =>
            {
                setActivePaneId(nextPaneId);
                setFloatingPanesOrder(prevOrder => [...prevOrder, nextPaneId]);
            }, 0);

            return [...prev, newPane];
        });
    }, []);

    const handleClosePane = useCallback((id: string) =>
    {
        setPanes(prev =>
        {
            const remaining = prev.filter(p => p.id !== id);
            let defaultTabCount = 0;
            const renamed = remaining.map((p) =>
            {
                if (/^Tab \d+$/.test(p.title))
                {
                    defaultTabCount++;
                    return {...p, title: `Tab ${defaultTabCount}`};
                }
                return p;
            });

            setActivePaneId(current =>
            {
                if (current === id)
                {
                    return renamed.length > 0 ? renamed[renamed.length - 1].id : null;
                }
                return current;
            });
            return renamed;
        });
        setFloatingPanesOrder(prev => prev.filter(pId => pId !== id));
    }, []);

    const handleTogglePin = (e: React.MouseEvent, id: string) =>
    {
        e.stopPropagation();
        setPanes(prev => prev.map(p =>
        {
            if (p.id === id)
            {
                return {...p, isPinned: !p.isPinned};
            }
            return p;
        }));
    };

    const handleFocusFloatingPane = useCallback((id: string) =>
    {
        setFloatingPanesOrder(prev => [...prev.filter(pId => pId !== id), id]);
        setActivePaneId(id);
    }, []);

    const handleSplit = useCallback((_direction: "vertical" | "horizontal") =>
    {
        setPanes(prev =>
        {
            let defaultTabCount = 0;
            prev.forEach(p =>
            {
                if (/^Tab \d+$/.test(p.title))
                {
                    defaultTabCount++;
                }
            });
            const nextNum = defaultTabCount + 1;
            const nextPaneId = `pane-${Date.now()}`;
            const newPane: PaneCell = {
                id: nextPaneId,
                title: `Tab ${nextNum}`,
                isPinned: false,
                isFloating: false,
                x: 150,
                y: 150,
                width: 600,
                height: 400
            };

            setTimeout(() =>
            {
                setActivePaneId(nextPaneId);
                setFloatingPanesOrder(prevOrder => [...prevOrder, nextPaneId]);
            }, 0);

            return [...prev, newPane];
        });
    }, []);

    const handleDetachPane = useCallback((id: string) =>
    {
        setPanes(prev => prev.map(p =>
        {
            if (p.id === id)
            {
                return {
                    ...p,
                    isFloating: true,
                    x: 150 + (floatingPanesOrder.length % 5) * 30,
                    y: 150 + (floatingPanesOrder.length % 5) * 30,
                };
            }
            return p;
        }));
        handleFocusFloatingPane(id);
    }, [floatingPanesOrder.length, handleFocusFloatingPane]);

    const handleDockPane = useCallback((id: string) =>
    {
        setPanes(prev => prev.map(p =>
        {
            if (p.id === id)
            {
                return {...p, isFloating: false};
            }
            return p;
        }));
        setActivePaneId(id);
    }, []);

    const handleStartRename = (id: string, currentTitle: string) =>
    {
        setEditingPaneId(id);
        setEditTitle(currentTitle);
    };

    const handleRenameSubmit = (id: string) =>
    {
        if (editTitle.trim())
        {
            setPanes(prev => prev.map(p =>
            {
                if (p.id === id)
                {
                    return {...p, title: editTitle.trim()};
                }
                return p;
            }));
        }
        setEditingPaneId(null);
    };

    const handleTogglePlayPause = () =>
    {
        setIsPaused(prev => !prev);
    };

    const handleToggleStar = (id: string) =>
    {
        setLogs(prev => prev.map(l =>
        {
            if (l.id === id)
            {
                return {...l, starred: !l.starred};
            }
            return l;
        }));
    };

    const handleClearLogs = () =>
    {
        setLogs([]);
        incomingLogsRef.current = [];
    };

    const handleRestartAdb = async () =>
    {
        try
        {
            await fetch("/api/adb/restart", {method: "POST"});
            setRefreshKey(prev => prev + 1);
        }
        catch (e)
        {
            alert("Failed to restart ADB server");
        }
    };

    const getWorkspaceStyle = (panesCount: number): React.CSSProperties =>
    {
        if (panesCount <= 1) return {gridTemplateColumns: "1fr"};
        if (panesCount === 2) return {gridTemplateColumns: "1fr 1fr"};
        if (panesCount === 3) return {gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr"};
        return {
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr"
        };
    };

    const pinnedPanes = panes.filter(p => p.isPinned);
    const unpinnedPanes = panes.filter(p => !p.isPinned);
    const sortedPanes = [...pinnedPanes, ...unpinnedPanes];

    const gridPanes = sortedPanes.filter(p => !p.isFloating);
    const floatingPanesList = sortedPanes.filter(p => p.isFloating);

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            width: "100vw",
            backgroundColor: "var(--bg-primary)"
        }}>

            <div style={{
                height: "40px",
                borderBottom: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 12px",
                flexShrink: 0,
                zIndex: 60,
            }}>
                <div style={{display: "flex", alignItems: "center", gap: "8px"}}>
                    <div style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: getStatusDotColor(),
                        transition: "background-color 0.3s",
                        flexShrink: 0,
                    }}/>
                    <span style={{fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap"}}>Device</span>
                    <select
                        className="select-flat"
                        value={selectedDevice}
                        onChange={(e) => setSelectedDevice(e.target.value)}
                        style={{
                            height: "28px",
                            padding: "0 6px",
                            fontSize: "12px",
                            minWidth: "140px",
                            maxWidth: "180px"
                        }}
                    >
                        <option value="">-- Select Device --</option>
                        {devices.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                    <button
                        className="btn-flat icon-btn"
                        onClick={() => setRefreshKey(prev => prev + 1)}
                        title="Refresh Devices List"
                    >
                        <RefreshCw size={13}/>
                    </button>
                </div>

                <div style={{display: "flex", alignItems: "center", gap: "6px"}}>
                    <button
                        className="btn-flat icon-btn"
                        onClick={handleRestartAdb}
                        title="Restart ADB Server"
                    >
                        <RotateCw size={14}/>
                    </button>

                    <button
                        className="btn-flat icon-btn"
                        onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                        title="Toggle Settings"
                        style={{backgroundColor: showSettingsDrawer ? "var(--bg-tertiary)" : "transparent"}}
                    >
                        <Settings size={16}/>
                    </button>
                </div>
            </div>
            <div style={{
                height: "36px",
                borderBottom: "1px solid var(--border-color)",
                backgroundColor: "var(--bg-secondary)",
                display: "flex",
                alignItems: "flex-end",
                padding: "0 12px",
                flexShrink: 0,
                zIndex: 50,
            }}>
                <div className="tab-manager-container" style={{margin: 0, width: "100%"}}>
                    <button className="tab-scroll-btn" onClick={() => scrollTabs("left")} title="Scroll Left"
                            style={{marginBottom: "2px"}}>
                        <ChevronLeft size={14}/>
                    </button>
                    <div
                        ref={tabContainerRef}
                        className="tabs-scroll-viewport"
                        onWheel={handleTabWheel}
                    >
                        {sortedPanes.map((pane, _paneIdx) =>
                        {
                            const prevPane = _paneIdx > 0 ? sortedPanes[_paneIdx - 1] : null;
                            const showSeparator = prevPane && prevPane.isPinned && !pane.isPinned;
                            const isActive = pane.id === activePaneId;
                            const isPinned = pane.isPinned;
                            return (
                                <React.Fragment key={pane.id}>
                                    {showSeparator && (
                                        <div style={{
                                            width: "1px",
                                            alignSelf: "center",
                                            height: "18px",
                                            backgroundColor: "var(--border-color)",
                                            margin: "0 2px",
                                            flexShrink: 0
                                        }}/>
                                    )}
                                    <div
                                        draggable
                                        onDragStart={() => handleDragStart(pane.id)}
                                        onDragOver={handleDragOver}
                                        onDrop={() => handleDrop(pane.id)}
                                        onClick={() =>
                                        {
                                            if (pane.isFloating)
                                            {
                                                handleFocusFloatingPane(pane.id);
                                            }
                                            else
                                            {
                                                setActivePaneId(pane.id);
                                            }
                                        }}
                                        className={`tab-item ${isActive ? "active" : ""} ${isPinned ? "pinned" : ""}`}
                                    >
                                        <button
                                            onClick={(e) => handleTogglePin(e, pane.id)}
                                            className={`tab-pin-btn ${isPinned ? "pinned" : ""}`}
                                            title={isPinned ? "Unpin Tab" : "Pin Tab"}
                                        >
                                            {isPinned ? <Pin size={10} fill="currentColor"/> : <PinOff size={10}/>}
                                        </button>

                                        {editingPaneId === pane.id ? (
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onBlur={() => handleRenameSubmit(pane.id)}
                                                onKeyDown={(e) =>
                                                {
                                                    if (e.key === "Enter") handleRenameSubmit(pane.id);
                                                    if (e.key === "Escape") setEditingPaneId(null);
                                                }}
                                                autoFocus
                                                style={{
                                                    border: "none",
                                                    background: "none",
                                                    outline: "none",
                                                    fontSize: "12px",
                                                    fontWeight: 600,
                                                    width: "80px",
                                                    color: "var(--text-primary)"
                                                }}
                                            />
                                        ) : (
                                            <span
                                                onDoubleClick={() => handleStartRename(pane.id, pane.title)}
                                                title="Double-click to rename"
                                                style={{
                                                    fontStyle: pane.isFloating ? "italic" : "normal",
                                                    fontSize: "12px",
                                                    maxWidth: "120px",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                      {pane.title}
                    </span>
                                        )}

                                        <button
                                            onClick={(e) =>
                                            {
                                                e.stopPropagation();
                                                handleClosePane(pane.id);
                                            }}
                                            className="tab-close-btn"
                                            title="Close Tab"
                                        >
                                            <X size={9}/>
                                        </button>
                                    </div>
                                </React.Fragment>
                            );
                        })}

                        <button
                            onClick={handleAddTab}
                            className="tab-add-btn"
                            title="New Tab"
                        >
                            <Plus size={14}/>
                        </button>
                    </div>
                    <button className="tab-scroll-btn" onClick={() => scrollTabs("right")} title="Scroll Right"
                            style={{marginBottom: "2px"}}>
                        <ChevronRight size={14}/>
                    </button>
                </div>
            </div>
            <div ref={workspaceRef} style={{flexGrow: 1, display: "flex", overflow: "hidden", position: "relative"}}>
                {panes.length === 0 ? (
                    <div style={{
                        display: "flex",
                        flexDirection: "column",
                        height: "100%",
                        width: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "24px",
                        color: "var(--text-secondary)",
                        backgroundColor: "var(--bg-primary)",
                        padding: "24px",
                        textAlign: "center"
                    }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "96px",
                            height: "96px",
                            borderRadius: "50%",
                            backgroundColor: "var(--bg-secondary)",
                            border: "1px solid var(--border-color)",
                            color: "var(--accent-color)",
                        }}>
                            <SquareTerminal size={48} style={{strokeWidth: 1.5}}/>
                        </div>
                        <div style={{display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px"}}>
              <span style={{fontSize: "16px", fontWeight: 600, color: "var(--text-primary)"}}>
                No Active Workspace
              </span>
                            <span style={{fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.5}}>
                All tabs and split views are closed. Open a new tab to start streaming and filtering Android logs.
              </span>
                        </div>
                        <button
                            className="btn-flat btn-primary"
                            onClick={handleAddTab}
                            style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "center",
                                padding: "8px 16px",
                                borderRadius: "6px",
                                height: "38px"
                            }}
                        >
                            <Plus size={16}/> Open New Tab
                        </button>
                    </div>
                ) : (
                    <div className="workspace-grid" style={getWorkspaceStyle(gridPanes.length)}>
                        {gridPanes.map((pane) => (
                            <div
                                key={pane.id}
                                onClick={() => setActivePaneId(pane.id)}
                                style={{
                                    height: "100%",
                                    width: "100%",
                                    minHeight: 0,
                                    minWidth: 0,
                                    overflow: "hidden",
                                    boxShadow: (activePaneId === pane.id) ? "inset 0 0 0 1px var(--border-color)" : "none",
                                    zIndex: (activePaneId === pane.id) ? 2 : 1,
                                }}
                            >
                                <LogViewer
                                    logs={logs}
                                    onToggleStar={handleToggleStar}
                                    onClearLogs={handleClearLogs}
                                    settings={settings}
                                    onSplit={() => handleSplit(gridPanes.length > 1 ? "vertical" : "horizontal")}
                                    onCloseSplit={() => handleClosePane(pane.id)}
                                    showCloseSplit={true}
                                    deviceConnected={deviceConnected}
                                    onTogglePause={handleTogglePlayPause}
                                    isPaused={isPaused}
                                    onDetach={() => handleDetachPane(pane.id)}
                                    showDetach={true}
                                    devicePackages={devicePackages}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {activeDragPaneId && hoveredSnapZone && (() =>
                {
                    const wsRect = workspaceRef.current?.getBoundingClientRect();
                    if (!wsRect) return null;
                    const [rx, ry, rw, rh] = hoveredSnapZone.result;
                    return (
                        <div
                            style={{
                                position: "absolute",
                                left: rx * wsRect.width,
                                top: ry * wsRect.height,
                                width: rw * wsRect.width,
                                height: rh * wsRect.height,
                                border: "2px dashed var(--accent-color)",
                                backgroundColor: "rgba(99,102,241,0.08)",
                                pointerEvents: "none",
                                zIndex: 9000,
                                transition: "all 0.12s ease",
                            }}
                        />
                    );
                })()}

                {floatingPanesList.map((pane) =>
                {
                    const zIndex = 200 + floatingPanesOrder.indexOf(pane.id);
                    const isActive = pane.id === activePaneId;

                    return (
                        <div
                            key={pane.id}
                            id={`floating-window-${pane.id}`}
                            onClick={() => handleFocusFloatingPane(pane.id)}
                            className="floating-window"
                            style={{
                                left: `${pane.x}px`,
                                top: `${pane.y}px`,
                                width: `${pane.width}px`,
                                height: `${pane.height}px`,
                                zIndex,
                                border: isActive ? "2px solid var(--accent-color)" : "1px solid var(--border-color)",
                            }}
                        >
                            <div
                                className="floating-header"
                                onMouseDown={(e) => handleFloatingDragStart(e, pane.id)}
                                style={{
                                    backgroundColor: isActive ? "var(--bg-tertiary)" : "var(--bg-secondary)",
                                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                                }}
                            >
                                <span style={{fontSize: "12px", fontWeight: 600}}>{pane.title}</span>
                                <div style={{display: "flex", gap: "4px"}}>
                                    <button
                                        onClick={(e) =>
                                        {
                                            e.stopPropagation();
                                            handleDockPane(pane.id);
                                        }}
                                        className="btn-flat icon-btn"
                                        title="Dock Window to Grid"
                                    >
                                        <LayoutGrid size={12}/>
                                    </button>
                                    <button
                                        onClick={(e) =>
                                        {
                                            e.stopPropagation();
                                            handleClosePane(pane.id);
                                        }}
                                        className="btn-flat icon-btn btn-danger"
                                        title="Close Window"
                                    >
                                        <X size={12}/>
                                    </button>
                                </div>
                            </div>
                            <div style={{flexGrow: 1, overflow: "hidden", display: "flex"}}>
                                <LogViewer
                                    logs={logs}
                                    onToggleStar={handleToggleStar}
                                    onClearLogs={handleClearLogs}
                                    settings={settings}
                                    onSplit={() => handleSplit("horizontal")}
                                    onCloseSplit={() => handleClosePane(pane.id)}
                                    showCloseSplit={false}
                                    deviceConnected={deviceConnected}
                                    onTogglePause={handleTogglePlayPause}
                                    isPaused={isPaused}
                                    showDetach={false}
                                    devicePackages={devicePackages}
                                />
                            </div>
                        </div>
                    );
                })}

                <AnimatePresence>
                    {showSettingsDrawer && (
                        <SettingsPanel
                            settings={settings}
                            onUpdateSettings={(updated) => setSettings(prev => ({...prev, ...updated}))}
                            onClose={() => setShowSettingsDrawer(false)}
                        />
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
