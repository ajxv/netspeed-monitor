
# Network Speed Monitor (GNOME Extension)

[![Install on GNOME Extensions](https://img.shields.io/badge/Install%20on-GNOME%20Extensions-brightgreen?logo=gnome&style=flat-square)](https://extensions.gnome.org/extension/7565/network-speed-monitor/)

This extension shows your current network download and upload speeds in the GNOME top bar. It helps you keep track of your network usage in real time.

![extension in action](screenshots/screenshot1.png)

## Features

- Shows real-time download (↓) and upload (↑) speeds
- Supports multiple network interfaces
- Excludes virtual interfaces (lo, vir, vbox, docker, veth, br-)
- Toggle between bits and bytes display (long-press the indicator)

## Manual Installation

1. Clone this repository:
   ```sh
   git clone https://github.com/ajxv/netspeed-monitor.git
   cd netspeed-monitor
   ```
2. Build and install the extension:
   ```sh
   gnome-extensions pack --force .
   gnome-extensions install --force netspeed-monitor@ajxv.shell-extension.zip
   ```
   `pack` also compiles the GSettings schema. The same zip can be uploaded to extensions.gnome.org.
3. Restart GNOME Shell:
   - Press `Alt+F2`, type `r`, and press `Enter` (on X11), or log out and log in again.
4. Enable the extension:
   ```sh
   gnome-extensions enable netspeed-monitor@ajxv
   ```

## Contributing & Issues

- To contribute, fork this repo and open a pull request with your changes.
- For bug reports or feature requests, please open an issue on the [GitHub Issues page](https://github.com/ajxv/netspeed-monitor/issues).

## License

MIT License. See the LICENSE file for details.

