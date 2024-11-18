# Network Speed Monitor

Network Speed Monitor is a GNOME extension that displays the current network speed on the top bar of your Ubuntu desktop. It provides a real-time view of your download and upload speeds, helping you monitor your network usage efficiently.

## Features

- Real-time network speed monitoring
- Easy-to-read display on the top bar
- Customizable refresh interval
- Supports multiple network interfaces

## Installation

To install the Network Speed Monitor extension:

1. **Download the extension:**
   - Clone the repository to your local machine:
     ```sh
     git clone https://github.com/ajxv/netspeed-monitor.git
     ```

2. **Install the extension:**
   - Copy the extension files to the GNOME extensions directory:
     ```sh
     cp -r netspeed-monitor ~/.local/share/gnome-shell/extensions/netspeed-monitor@ajxv/
     ```

3. **Enable the extension:**
   - Open GNOME Tweaks and navigate to the Extensions tab, then enable the Network Speed Monitor extension.
   - Alternatively, you can enable the extension using the command line:
     ```sh
     gnome-extensions enable netspeed-monitor@ajxv
     ```

4. **Restart GNOME Shell:**
   - Press `Alt + F2`, type `r`, and press `Enter` to restart GNOME Shell.

## Usage

Once installed and enabled, the Network Speed Monitor extension will display the current download (↓) and upload (↑) speeds on the top bar of your Ubuntu desktop. The speeds are updated every few seconds based on the configured refresh interval.

## ScreenShot
![alt text](screenshots/screenshot1.png)

## Technical Details: Network Speed Calculations

### Data Source
The extension reads network statistics from `/proc/net/dev`, a Linux kernel interface that provides cumulative network traffic statistics. This file contains rows for each network interface with various counters including bytes received (RX) and transmitted (TX).

### Speed Calculation Process
1. **Data Collection**
   - The system reads `/proc/net/dev` every 3 seconds
   - Interface statistics are aggregated, excluding virtual interfaces (lo, vir, vbox, docker, br-)
   - Two primary values are tracked:
     - Total bytes received (RX)
     - Total bytes transmitted (TX)

2. **Speed Calculation Formula**
   ```sh
   - Speed = (Current Bytes - Previous Bytes) / Interval Time
   - RX Speed = (Current RX Bytes - Previous RX Bytes) / 3 seconds
   - TX Speed = (Current TX Bytes - Previous TX Bytes) / 3 seconds
   ```

3. **Unit Conversion**
   The raw byte values are converted to human-readable formats using the following scale:
   - B/s  (Bytes/second)      : < 1024 B/s
   - KB/s (Kilobytes/second)  : < 1024 KB/s
   - MB/s (Megabytes/second)  : < 1024 MB/s
   - GB/s (Gigabytes/second)  : ≥ 1024 MB/s

### Implementation Details
- Update Interval: 3 seconds (configurable via `UPDATE_INTERVAL_SECONDS`)
- Interface Filtering: Uses prefix matching to exclude virtual interfaces
- Error Handling: Continues operation even if a single reading fails
- Memory Usage: Maintains only previous reading state (2 integers)
- Display Format: "↓ {download_speed} ↑ {upload_speed}"

### Resource Usage
- CPU Impact: Minimal (reads one file every 3 seconds)
- Memory Footprint: Constant (independent of network activity)
- I/O Operations: One file read per update interval

## Contributing

Contributions are welcome to the Network Speed Monitor extension! To contribute, follow these steps:

1. **Fork the repository.**
2. **Clone your fork:**

    ```sh
    git clone https://github.com/YOUR-USERNAME/netspeed-monitor.git
    ```

3. **Create a new branch:**
    
    ```sh
    git checkout -b my-feature-branch
    ```

4. **Make your changes.**
5. **Test your changes.**
6. **Commit your changes:**

    ```sh
    git add .
    git commit -m "Description of your changes"
    ```

7. **Push your changes:**

    ```sh
    git push origin my-feature-branch
    ```

8. **Create a pull request.**

## License

This project is licensed under the [MIT License](LICENSE).

