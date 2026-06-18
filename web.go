package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"path"
	"strings"

	"github.com/gorilla/websocket"
)

//go:embed all:assets/web/out
var embeddedAssets embed.FS
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func createRouter(adb *AdbManager) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/", staticHandler)
	mux.HandleFunc("GET /api/devices", getDevicesHandler(adb))
	mux.HandleFunc("GET /api/packages", getPackagesHandler(adb))
	mux.HandleFunc("POST /api/adb/restart", restartAdbHandler(adb))
	mux.HandleFunc("POST /api/adb/kill", killAdbHandler(adb))
	mux.HandleFunc("GET /ws/logcat", wsHandler(adb))
	return mux
}

func getDevicesHandler(adb *AdbManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		devices, err := adb.ListDevices()
		if err != nil {
			fmt.Printf("[ERROR] ListDevices: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if devices == nil {
			devices = make([]string, 0)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(devices)
	}
}

func getPackagesHandler(adb *AdbManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceId := r.URL.Query().Get("device")
		if deviceId == "" {
			http.Error(w, "Missing device id", http.StatusBadRequest)
			return
		}

		pkgs, err := adb.ListPackages(deviceId)
		if err != nil {
			fmt.Printf("[ERROR] ListPackages: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		if pkgs == nil {
			pkgs = make([]string, 0)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(pkgs)
	}
}

func restartAdbHandler(adb *AdbManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := adb.KillServer(); err != nil {
			fmt.Printf("[ERROR] KillServer: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = adb.StartServer()
		w.WriteHeader(http.StatusOK)
	}
}

func killAdbHandler(adb *AdbManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := adb.KillServer(); err != nil {
			fmt.Printf("[ERROR] KillServer: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func wsHandler(adb *AdbManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		deviceId := r.URL.Query().Get("device")
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			fmt.Printf("[ERROR] Upgrade: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		defer func(conn *websocket.Conn) {
			_ = conn.Close()
		}(conn)
		logChan, errChan, err := adb.StreamLogcat(deviceId)
		if err != nil {
			errPayload, _ := json.Marshal(map[string]string{"error": err.Error()})
			_ = conn.WriteMessage(websocket.TextMessage, errPayload)
			return
		}

		clientDisconnect := make(chan struct{})
		go func() {
			for {
				if _, _, err := conn.ReadMessage(); err != nil {
					close(clientDisconnect)
					return
				}
			}
		}()

		for {
			select {
			case entry, ok := <-logChan:
				if !ok {
					return
				}
				jsonMsg, err := json.Marshal(entry)
				if err != nil {
					continue
				}
				if err := conn.WriteMessage(websocket.TextMessage, jsonMsg); err != nil {
					return
				}
			case <-errChan:
				return
			case <-clientDisconnect:
				return
			}
		}
	}
}

func staticHandler(w http.ResponseWriter, r *http.Request) {
	cleanPath := path.Clean(r.URL.Path)
	if cleanPath == "/" {
		cleanPath = "index.html"
	} else {
		cleanPath = strings.TrimPrefix(cleanPath, "/")
	}

	fullPath := path.Join("assets/web/out", cleanPath)
	data, err := embeddedAssets.ReadFile(fullPath)

	if err != nil && path.Ext(cleanPath) == "" {
		htmlPath := fullPath + ".html"
		if htmlData, htmlErr := embeddedAssets.ReadFile(htmlPath); htmlErr == nil {
			data = htmlData
			cleanPath = cleanPath + ".html"
			err = nil
		}
	}

	if err != nil {
		cleanPath = "index.html"
		data, err = embeddedAssets.ReadFile("assets/web/out/index.html")
	}

	if err != nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	mimeType := mime.TypeByExtension(path.Ext(cleanPath))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	w.Header().Set("Content-Type", mimeType)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
