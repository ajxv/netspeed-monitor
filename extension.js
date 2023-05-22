const { St, Clutter } = imports.gi;
const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;

const refreshInterval = 3;

let textDisplay;
let lastTotalRxBytes = 0;
let lastTotalTxBytes = 0;

function init() {
  textDisplay = new St.Label({
    style_class: 'network-speed-label',
    "y_align": Clutter.ActorAlign.CENTER,
    text: '↓ 0 ↑ 0',
  });
}

function enable() {
  Main.panel._rightBox.insert_child_at_index(textDisplay, 0);

  updateNetworkSpeed();
}

function disable() {
  Main.panel._rightBox.remove_child(textDisplay);
}

function updateNetworkSpeed() {
  let [success, output] = GLib.spawn_command_line_sync('cat /proc/net/dev');
  if (success) {
    let lines = ByteArray.toString(output).split('\n');

    let totalRxBytes = 0;
    let totalTxBytes = 0;

    for (let i = 2; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.length === 0) continue;

      let parts = line.split(':');
      if (parts.length !== 2) continue;

      let interfaceName = parts[0].trim();
      if (
        interfaceName.startsWith('lo') || // Skip loopback interface
        interfaceName.startsWith('vir') || // Skip virtual interfaces
        interfaceName.startsWith('vbox') // Skip VirtualBox interfaces (adjust as needed)
      ) {
        continue;
      }

      let data = parts[1].trim().split(/\s+/);
      let rxBytes = parseInt(data[0]);
      let txBytes = parseInt(data[8]);

      totalRxBytes += rxBytes;
      totalTxBytes += txBytes;

    }

    if (lastTotalRxBytes == 0) {
      lastTotalRxBytes = totalRxBytes;
    }
    if (lastTotalTxBytes == 0) {
      lastTotalTxBytes = totalTxBytes;
    }

    let rxSpeed = formatNetworkSpeed((totalRxBytes - lastTotalRxBytes) / refreshInterval);
    let txSpeed = formatNetworkSpeed((totalTxBytes - lastTotalTxBytes) / refreshInterval);

    textDisplay.text = `↓ ${rxSpeed}  ↑ ${txSpeed}`;

    lastTotalRxBytes = totalRxBytes;
    lastTotalTxBytes = totalTxBytes;

  }

  // Update every 'refreshInterval' seconds (adjust the interval as needed)
  GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, refreshInterval, updateNetworkSpeed);
}

function formatNetworkSpeed(bytes) {
  const suffixes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let index = 0;

  while (bytes >= 1024 && index < suffixes.length - 1) {
    bytes /= 1024;
    index++;
  }

  return `${bytes.toFixed(2)} ${suffixes[index]}`;
}
