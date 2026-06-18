package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
)

func main() {
	port := 3000
	host := "0.0.0.0"
	args := os.Args

	i := 1
	for i < len(args) {
		switch args[i] {
		case "-p", "port":
			if i+1 < len(args) {
				p, err := strconv.Atoi(args[i+1])
				if err != nil || p < 0 || p > 65535 {
					_, _ = fmt.Fprintf(os.Stderr, "port must be between 0 and 65535\n")
					os.Exit(1)
				}
				port = p
				i += 2
			} else {
				_, _ = fmt.Fprintf(os.Stderr, "Missing port value.\n")
				os.Exit(1)
			}
		case "-i", "--host":
			if i+1 < len(args) {
				host = args[i+1]
				i += 2
			} else {
				_, _ = fmt.Fprintf(os.Stderr, "Missing host value.\n")
				os.Exit(1)
			}
		default:
		case "-h", "help":
			printHelp()
			os.Exit(0)
		}
	}

	adbManager := NewAdbManager()
	fmt.Println("[INFO] Starting ADB Server...")
	if err := adbManager.StartServer(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "[ERROR] Error starting ADB server: %v\n", err)
	} else {
		fmt.Println("[INFO] ADB Server started.")
	}

	addr := fmt.Sprintf("%s:%d", host, port)
	fmt.Printf("[INFO] Listening on %s\n", addr)

	router := createRouter(adbManager)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "[ERROR] Error starting ADB server: %v\n", err)
		os.Exit(1)
	}

	if err := http.Serve(listener, router); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "[ERROR] Error starting ADB server: %v\n", err)
	}
}

func printHelp() {
	fmt.Println("Android Logcat View (ALV)")
	fmt.Println("")
	fmt.Println("Usage: alv [options]")
	fmt.Println("")
	fmt.Println("Options:")
	fmt.Println("  -p, --port <port>   Port (default: 3000)")
	fmt.Println("  -i, --host <host>   Host to bind to (default: 0.0.0.0)")
	fmt.Println("  -h, --help          Show this help message")
}
