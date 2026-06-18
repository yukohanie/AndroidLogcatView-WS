import React from "react";
import {motion} from "framer-motion";
import {RotateCcw, X} from "lucide-react";

export interface AppSettings
{
    showTimestamp: boolean;
    formatTimestamp: "full" | "short";
    showPidTid: boolean;
    showTag: boolean;
    tagWidth: number;
    showPackage: boolean;
    showProcess: boolean;
    showRepeatedTags: boolean;
    colorizeRow: boolean;
    bufferLimit: number;
    theme: "light" | "dark" | "auto";
}

interface SettingsPanelProps
{
    settings: AppSettings;
    onUpdateSettings: (settings: Partial<AppSettings>) => void;
    onClose: () => void;
}

export const defaultSettings: AppSettings = {
    showTimestamp: true,
    formatTimestamp: "full",
    showPidTid: true,
    showTag: true,
    tagWidth: 140,
    showPackage: false,
    showProcess: false,
    showRepeatedTags: true,
    colorizeRow: false,
    bufferLimit: 5000,
    theme: "auto",
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings,  onUpdateSettings,  onClose }) =>
{
    const ResetToDefault = () =>
    {
        onUpdateSettings(defaultSettings);
    };

    return (
        <motion.div
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: "tween", duration: 0.2 }}
            className="settings-drawer"
            style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "320px",
                overflowY: "auto",
                padding: "16px",
                gap: "16px"
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-color)", paddingBottom: "12px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600 }}>Settings</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button className="btn-flat" onClick={ResetToDefault} title="Reset Settings" style={{ padding: "4px 8px" }}>
                        <RotateCcw size={16}/>
                    </button>

                    <button className="btn-flat" onClick={onClose} title="Close Settings" style={{ padding: "4px 8px" }}>
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>Theme</span>
                <select
                    className="select-flat"
                    value={settings.theme}
                    onChange={(e) => onUpdateSettings({ theme: e.target.value as AppSettings["theme"] })}
                >
                    <option value="auto">System Default (Auto)</option>
                    <option value="light">Light Mode</option>
                    <option value="dark">Dark Mode</option>
                </select>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>Visible Columns</span>
                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showTimestamp}
                            onChange={(e) => onUpdateSettings({ showTimestamp: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Timestamp</span>
                </label>

                {settings.showTimestamp && (
                    <div style={{ paddingLeft: "44px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="segmented-control" style={{ width: "100%" }}>
                            <button
                                className={`segmented-btn ${settings.formatTimestamp === "full" ? "active" : ""}`}
                                onClick={() => onUpdateSettings({ formatTimestamp: "full" })}
                            >
                                Date & Time
                            </button>

                            <button
                                className={`segmented-btn ${settings.formatTimestamp === "short" ? "active" : ""}`}
                                onClick={() => onUpdateSettings({ formatTimestamp: "short" })}
                            >
                                Time Only
                            </button>
                        </div>
                    </div>
                )}

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showPidTid}
                            onChange={(e) => onUpdateSettings({ showPidTid: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>PID / TID</span>
                </label>

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showTag}
                            onChange={(e) => onUpdateSettings({ showTag: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Tag</span>
                </label>

                {settings.showTag && (
                    <div style={{ paddingLeft: "44px", display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Tag Column Width ({settings.tagWidth}px)</span>
                        <input
                            type="range"
                            min="80"
                            max="300"
                            step="10"
                            value={settings.tagWidth}
                            onChange={(e) => onUpdateSettings({ tagWidth: parseInt(e.target.value) })}
                            style={{ width: "100%", accentColor: "var(--accent-color)" }}
                        />
                    </div>
                )}

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showPackage}
                            onChange={(e) => onUpdateSettings({ showPackage: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Package Name</span>
                </label>

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showProcess}
                            onChange={(e) => onUpdateSettings({ showProcess: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Process Name</span>
                </label>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>Viewer Options</span>

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.showRepeatedTags}
                            onChange={(e) => onUpdateSettings({ showRepeatedTags: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Show Repeated Tags</span>
                </label>

                <label className="switch-container">
                    <span className="switch">
                        <input
                            type="checkbox"
                            checked={settings.colorizeRow}
                            onChange={(e) => onUpdateSettings({ colorizeRow: e.target.checked })}
                        />
                        <span className="slider"></span>
                    </span>
                    <span style={{ fontSize: "14px" }}>Colorize Entire Log Row</span>
                </label>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border-color)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "bold", color: "var(--text-secondary)", textTransform: "uppercase" }}>Log Buffer Size Limit</span>
                <select
                    className="select-flat"
                    value={settings.bufferLimit}
                    onChange={(e) => onUpdateSettings({ bufferLimit: parseInt(e.target.value) })}
                >
                    <option value="100">100 lines</option>
                    <option value="200">200 lines</option>
                    <option value="500">500 lines</option>
                    <option value="1000">1,000 lines</option>
                    <option value="5000">5,000 lines</option>
                    <option value="10000">10,000 lines</option>
                    <option value="20000">20,000 lines</option>
                    <option value="50000">50,000 lines</option>
                    <option value="100000">100,000 lines</option>
                </select>
            </div>
        </motion.div>
    );
};