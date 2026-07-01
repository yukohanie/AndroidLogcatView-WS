package main

import (
	"bufio"
	"bytes"
	"context"
	"embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed all:assets/adb
var adbAssets embed.FS

type LogEntry struct {
	Timestamp   string `json:"timestamp"`
	Pid         uint32 `json:"pid"`
	Tid         uint32 `json:"tid"`
	Level       string `json:"level"`
	Tag         string `json:"tag"`
	PackageName string `json:"package_name"`
	ProcessName string `json:"process_name"`
	Message     string `json:"message"`
}

type ProcessInfo struct {
	ProcessName string
	PackageName string
}

type AdbManager struct {
	adbPath string
	pidMap  map[uint32]ProcessInfo
	mu      sync.RWMutex
}

func NewAdbManager() *AdbManager {
	return &AdbManager{
		adbPath: extractAdb(),
		pidMap:  make(map[uint32]ProcessInfo),
	}
}

func safeWrite(path string, data []byte) {
	if info, err := os.Stat(path); err == nil {
		if info.Size() == int64(len(data)) {
			return
		}
	}

	if err := os.WriteFile(path, data, 0775); err != nil {
		if _, statErr := os.Stat(path); statErr != nil {
			panic(err)
		}
	}
}

func extractAdb() string {
	tmpDir := filepath.Join(os.TempDir(), "adb_tmp")
	_ = os.MkdirAll(tmpDir, 0775)

	var targetExe string
	switch runtime.GOOS {
	case "windows":
		targetExe = filepath.Join(tmpDir, "adb.exe")
		adbExe, _ := adbAssets.ReadFile("assets/adb/windows/adb.exe")
		dll1, _ := adbAssets.ReadFile("assets/adb/windows/AdbWinApi.dll")
		dll2, _ := adbAssets.ReadFile("assets/adb/windows/AdbWinUsbApi.dll")
		safeWrite(targetExe, adbExe)
		safeWrite(filepath.Join(tmpDir, "AdbWinApi.dll"), dll1)
		safeWrite(filepath.Join(tmpDir, "AdbWinUsbApi.dll"), dll2)
	case "linux":
		targetExe = filepath.Join(tmpDir, "adb")
		binData, _ := adbAssets.ReadFile("assets/adb/linux/adb")
		safeWrite(targetExe, binData)
	case "darwin":
		targetExe = filepath.Join(tmpDir, "adb")
		binData, _ := adbAssets.ReadFile("assets/adb/macos/adb")
		safeWrite(targetExe, binData)
	default:
		panic("Unsupported operating system target")
	}
	return targetExe
}

func (a *AdbManager) RunCmd(args []string) (string, error) {
	cmd := exec.Command(a.adbPath, args...)
	cmd.Env = append(os.Environ(), "ANDROID_ADB_SERVER_PORT=5037")

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%s", stderr.String())
		}
		return "", err
	}
	return stdout.String(), nil
}

func (a *AdbManager) KillPortOwner() {
	if runtime.GOOS != "windows" {
		return
	}
	out, err := exec.Command("cmd", "/C", "netstat -ano | findstr :5037").Output()
	if err != nil || len(out) == 0 {
		return
	}
	lines := strings.Split(string(out), "\n")
	seen := make(map[string]bool)
	for _, line := range lines {
		parts := strings.Fields(line)
		if len(parts) < 5 {
			continue
		}
		pid := parts[4]
		if pid == "0" || seen[pid] {
			continue
		}
		seen[pid] = true
		_ = exec.Command("taskkill", "/PID", pid, "/F").Run()
	}
}

func (a *AdbManager) ListDevices() ([]string, error) {
	out, err := a.RunCmd([]string{"devices"})
	if err != nil {
		return nil, err
	}

	var devices []string
	lines := strings.Split(out, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "List of devices") {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) >= 2 && parts[1] == "device" {
			devices = append(devices, parts[0])
		}
	}
	return devices, nil
}

func (a *AdbManager) KillServer() error {
	_, err := a.RunCmd([]string{"kill-server"})
	return err
}

func (a *AdbManager) StartServer() error {
	a.KillPortOwner()
	time.Sleep(300 * time.Millisecond)

	_, err := a.RunCmd([]string{"kill-server"})
	if err != nil {
		return err
	}
	time.Sleep(300 * time.Millisecond)

	_, err = a.RunCmd([]string{"start-server"})
	if err != nil {
		return err
	}
	time.Sleep(800 * time.Millisecond)
	return nil
}

func (a *AdbManager) UpdatePidMap(deviceId string) {
	out, err := a.RunCmd([]string{"-s", deviceId, "shell", "ps", "-A"})
	if err != nil {
		out, err = a.RunCmd([]string{"-s", deviceId, "shell", "ps"})
		if err != nil {
			return
		}
	}

	localMap := make(map[uint32]ProcessInfo)
	lines := strings.Split(out, "\n")
	if len(lines) <= 1 {
		return
	}

	for _, line := range lines[1:] {
		parts := strings.Fields(line)
		if len(parts) >= 9 {
			pval, err := strconv.ParseUint(parts[1], 10, 32)
			if err != nil {
				continue
			}
			pid := uint32(pval)
			procName := parts[len(parts)-1]
			pkgName := strings.Split(procName, ":")[0]
			localMap[pid] = ProcessInfo{
				ProcessName: procName,
				PackageName: pkgName,
			}
		}
	}

	if len(localMap) > 0 {
		a.mu.Lock()
		a.pidMap = localMap
		a.mu.Unlock()
	}
}

func (a *AdbManager) ListPackages(deviceId string) ([]string, error) {
	out, err := a.RunCmd([]string{"-s", deviceId, "shell", "pm", "list", "packages"})
	if err != nil {
		return nil, err
	}

	var packages []string
	lines := strings.Split(out, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "package:") {
			pkg := strings.TrimPrefix(line, "package:")
			packages = append(packages, pkg)
		}
	}
	sort.Strings(packages)
	return packages, nil
}

func (a *AdbManager) StreamLogcat(ctx context.Context, deviceId string) (<-chan LogEntry, <-chan error, error) {
	deviceId = strings.TrimSpace(deviceId)
	if deviceId == "" {
		return nil, nil, fmt.Errorf("missing device id")
	}

	cmd := exec.CommandContext(ctx, a.adbPath, "-s", deviceId, "logcat", "-v", "threadtime")
	cmd.Env = append(os.Environ(), "ANDROID_ADB_SERVER_PORT=5037")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, nil, err
	}

	logChan := make(chan LogEntry, 100)
	errChan := make(chan error, 4)

	var streamWg sync.WaitGroup
	var errMu sync.Mutex
	errChanClosed := false
	sendErr := func(err error) {
		if err == nil || err == context.Canceled {
			return
		}
		errMu.Lock()
		defer errMu.Unlock()
		if errChanClosed {
			return
		}
		select {
		case errChan <- err:
		default:
		}
	}

	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()

		a.UpdatePidMap(deviceId)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				a.UpdatePidMap(deviceId)
			}
		}
	}()

	streamWg.Add(1)

	go func() {
		defer streamWg.Done()
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			msg := strings.TrimSpace(scanner.Text())
			if msg != "" {
				sendErr(fmt.Errorf("adb logcat stderr: %s", msg))
			}
		}
		sendErr(scanner.Err())
	}()

	streamWg.Add(1)

	go func() {
		defer streamWg.Done()
		defer close(logChan)
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		var lastEntry *LogEntry

		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			a.mu.RLock()
			entry := a.parseLine(line, a.pidMap, lastEntry)
			a.mu.RUnlock()

			if entry != nil {
				lastEntry = entry
				select {
				case logChan <- *entry:
				case <-ctx.Done():
					return
				}
			}
		}

		sendErr(scanner.Err())
	}()

	go func() {
		streamWg.Wait()
		if err := cmd.Wait(); err != nil && ctx.Err() == nil {
			sendErr(err)
		}
		errMu.Lock()
		errChanClosed = true
		close(errChan)
		errMu.Unlock()
	}()

	return logChan, errChan, nil
}

func (a *AdbManager) parseLine(line string, pidMap map[uint32]ProcessInfo, lastEntry *LogEntry) *LogEntry {
	if len(line) < 19 {
		return a.makeContinuation(line, lastEntry)
	}
	hasTs := line[2] == '-' && line[5] == ' ' && line[8] == ':' && line[11] == ':' && line[14] == '.'
	if !hasTs {
		return a.makeContinuation(line, lastEntry)
	}

	datePart := line[0:5]
	timePart := line[6:18]
	year := time.Now().Format("2006")
	timestamp := fmt.Sprintf("%s-%s-%s %s", year, datePart[0:2], datePart[3:5], timePart)
	remainder := line[18:]

	var parts []string
	var current strings.Builder

	for _, r := range remainder {
		if r == ' ' {
			if current.Len() > 0 {
				parts = append(parts, current.String())
				current.Reset()
			}
			if len(parts) >= 3 {
				break
			}
		} else {
			current.WriteRune(r)
		}
	}

	if len(parts) < 3 {
		return a.makeContinuation(line, lastEntry)
	}

	pval, _ := strconv.ParseUint(parts[0], 10, 32)
	tval, _ := strconv.ParseUint(parts[1], 10, 32)
	pid := uint32(pval)
	tid := uint32(tval)
	level := parts[2]
	parsedHeadingLength := strings.Index(remainder, level) + len(level)
	tagAndMsg := strings.TrimSpace(remainder[parsedHeadingLength:])

	var tag, message string
	colonIdx := strings.Index(tagAndMsg, ":")
	if colonIdx != -1 {
		tag = strings.TrimSpace(tagAndMsg[:colonIdx])
		message = tagAndMsg[colonIdx+1:]
		if len(message) > 0 && message[0] == ' ' {
			message = message[1:]
		}
	} else {
		spaceParts := strings.SplitN(tagAndMsg, " ", 2)
		tag = strings.TrimSpace(spaceParts[0])
		if len(spaceParts) > 1 {
			message = spaceParts[1]
		}
	}

	procName, pkgName := "unk", "unk"
	if info, exists := pidMap[pid]; exists {
		procName = info.ProcessName
		pkgName = info.PackageName
	}

	return &LogEntry{
		Timestamp:   timestamp,
		Pid:         pid,
		Tid:         tid,
		Level:       level,
		Tag:         tag,
		PackageName: pkgName,
		ProcessName: procName,
		Message:     message,
	}
}

func (a *AdbManager) makeContinuation(line string, lastEntry *LogEntry) *LogEntry {
	if lastEntry == nil {
		return nil
	}
	return &LogEntry{
		Timestamp:   lastEntry.Timestamp,
		Pid:         lastEntry.Pid,
		Tid:         lastEntry.Tid,
		Level:       lastEntry.Level,
		Tag:         lastEntry.Tag,
		PackageName: lastEntry.PackageName,
		ProcessName: lastEntry.ProcessName,
		Message:     line,
	}
}
