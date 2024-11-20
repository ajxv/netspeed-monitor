'use strict';

// Import necessary GObject and GNOME Shell modules
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Constants for the update interval and network interfaces to ignore
const UPDATE_INTERVAL_SECONDS = 3;
const NETWORK_INTERFACES_TO_IGNORE = ['lo', 'vir', 'vbox', 'docker', 'br-'];
const PROC_NET_DEV_PATH = '/proc/net/dev';

// Define the NetworkSpeedIndicator class, extending St.Label
const NetworkSpeedIndicator = GObject.registerClass(
  class NetworkSpeedIndicator extends St.Label {
    // Constructor to initialize the label and set initial values
    _init() {
      super._init({
        style_class: 'network-speed-label', // CSS class for styling
        y_align: Clutter.ActorAlign.CENTER, // Vertically center the label
        text: '↓ 0 B/s ↑ 0 B/s' // Initial text
      });

      this._previousRxBytes = 0; // Previous received bytes
      this._previousTxBytes = 0; // Previous transmitted bytes
      this._updateTimer = null; // Timer for periodic updates

      // Create a Gio.File instance for asynchronous file operations
      this._netDevFile = Gio.File.new_for_path(PROC_NET_DEV_PATH);
    }

    // Method to destroy the indicator and stop updates
    destroy() {
      this.stopUpdate(); // Stop the periodic updates
      super.destroy(); // Call the parent class destroy method
    }

    // Method to format the speed value for display
    _formatSpeedValue(bytes) {
      const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']; // Units of measurement
      let unitIndex = 0; // Index for the units array
      let speed = bytes; // Speed value in bytes

      // Convert bytes to higher units if applicable
      while (speed >= 1024 && unitIndex < units.length - 1) {
        speed /= 1024;
        unitIndex++;
      }

      // Return the formatted speed value
      return `${speed.toFixed(1)} ${units[unitIndex]}`;
    }

    // Method to check if the network interface should be ignored
    _isIgnoredInterface(interfaceName) {
      return NETWORK_INTERFACES_TO_IGNORE.some(prefix =>
        interfaceName.startsWith(prefix)
      );
    }

    // Method to read network statistics asynchronously
    async _readNetworkStats() {
      return new Promise((resolve, reject) => {
        this._netDevFile.load_contents_async(null, (file, result) => {
          try {
            const [success, contents] = file.load_contents_finish(result);
            if (!success) throw new Error('Failed to read network stats');

            const lines = new TextDecoder().decode(contents).split('\n');
            let totalRxBytes = 0;
            let totalTxBytes = 0;

            for (const line of lines.slice(2)) {
              const trimmed = line.trim();
              if (!trimmed) continue;

              const [iface, data] = trimmed.split(':');
              if (!data || this._isIgnoredInterface(iface)) continue;

              const [rxBytes, , , , , , , , txBytes] = data.trim()
                .split(/\s+/)
                .map(n => parseInt(n, 10));

              totalRxBytes += rxBytes;
              totalTxBytes += txBytes;
            }

            resolve({ totalRxBytes, totalTxBytes });
          } catch (error) {
            console.error('NetworkSpeed: Error reading stats:', error);
            reject(null);
          }
        });
      });
    }

    // Method to update the network speed display
    async _updateSpeed() {
      const stats = await this._readNetworkStats();
      if (!stats) return GLib.SOURCE_CONTINUE;

      const { totalRxBytes, totalTxBytes } = stats;

      // Initialize previous values if first run
      this._previousRxBytes ||= totalRxBytes;
      this._previousTxBytes ||= totalTxBytes;

      // Calculate current speeds
      const downloadSpeed = this._formatSpeedValue(
        (totalRxBytes - this._previousRxBytes) / UPDATE_INTERVAL_SECONDS
      );
      const uploadSpeed = this._formatSpeedValue(
        (totalTxBytes - this._previousTxBytes) / UPDATE_INTERVAL_SECONDS
      );

      // Update the display
      this.text = `↓ ${downloadSpeed} ↑ ${uploadSpeed}`;

      // Store current values for next update
      this._previousRxBytes = totalRxBytes;
      this._previousTxBytes = totalTxBytes;

      return GLib.SOURCE_CONTINUE;
    }

    // Method to start periodic updates of network speed
    startUpdate() {
      // Initial update
      this._updateSpeed();

      // Schedule periodic updates
      this._updateTimer = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        UPDATE_INTERVAL_SECONDS,
        () => {
          this._updateSpeed();
          return GLib.SOURCE_CONTINUE;
        }
      );
    }

    // Method to stop periodic updates of network speed
    stopUpdate() {
      if (this._updateTimer) {
        GLib.source_remove(this._updateTimer);
        this._updateTimer = null;
      }
    }
  }
);

// Define the NetworkSpeedExtension class, extending Extension
export default class NetworkSpeedExtension extends Extension {
  // Method to enable the extension
  enable() {
    this._indicator = new NetworkSpeedIndicator(); // Create a new indicator
    Main.panel._rightBox.insert_child_at_index(this._indicator, 0); // Add the indicator to the panel
    this._indicator.startUpdate(); // Start updating the indicator
  }

  // Method to disable the extension
  disable() {
    if (this._indicator) {
      this._indicator.destroy(); // Destroy the indicator
      this._indicator = null; // Clear the reference
    }
  }
}