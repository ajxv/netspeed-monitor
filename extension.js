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
    _init(settings) {
      super._init({
        style_class: 'panel-button',
        y_align: Clutter.ActorAlign.CENTER,
        reactive: true, // react to mouse clicks
      });

      this._settings = settings;
      this._previousRxBytes = 0; // Previous received bytes
      this._previousTxBytes = 0; // Previous transmitted bytes

      // Create a Gio.File instance for reading network stats from /proc/net/dev
      this._netDevFile = Gio.File.new_for_path(PROC_NET_DEV_PATH);

      // Add long-press action to toggle bits/bytes display
      this._clickAction = new Clutter.ClickAction();
      this._clickAction.long_press_duration = 1000; // 1 second hold
      this._clickAction.connect('long-press', (action, actor, state) => {
        // Only toggle when long-press is activated
        if (state === Clutter.LongPressState.ACTIVATE) {
          const currentVal = this._settings.get_boolean('use-bits');
          this._settings.set_boolean('use-bits', !currentVal);
          this._updateSpeed();
        }
        return true;
      });
      this.add_action(this._clickAction);
    }

    destroy() {
      // Clean up periodic updates and remove from UI
      this.stopUpdate();
      super.destroy();
    }

    _formatSpeedValue(bytesPerSecond) {
      // Convert speed to human-readable format (bits/bytes, K/M/G units)
      const useBits = this._settings.get_boolean('use-bits');
      let speed = useBits ? bytesPerSecond * 8 : bytesPerSecond;
      const divider = useBits ? 1000 : 1024;
      const units = useBits ? ['bps', 'Kbps', 'Mbps', 'Gbps'] : ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      let unitIndex = 0;
      while (speed >= divider && unitIndex < units.length - 1) {
        speed /= divider;
        unitIndex++;
      }
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
      // Read and sum RX/TX bytes from /proc/net/dev for all interfaces except ignored
      return new Promise((resolve, reject) => {
        this._netDevFile.load_contents_async(null, (file, result) => {
          try {
            const [success, contents] = file.load_contents_finish(result);
            if (!success) throw new Error('Failed to read network stats');

            // decode files binary data to readable text
            const lines = new TextDecoder().decode(contents).split('\n');
            let totalRxBytes = 0;
            let totalTxBytes = 0;
            // Skip headers, sum RX/TX for all non-ignored interfaces
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

    async _updateSpeed() {
      // Calculate and update the displayed network speed
      const stats = await this._readNetworkStats();
      if (!stats) return GLib.SOURCE_CONTINUE;

      const { totalRxBytes, totalTxBytes } = stats;
      // On first run, initialize previous values
      this._previousRxBytes ||= totalRxBytes;
      this._previousTxBytes ||= totalTxBytes;
      // Calculate download/upload speeds
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
    this._settings = this.getSettings();
    this._indicator = new NetworkSpeedIndicator(this._settings); // Create a new indicator
    Main.panel._rightBox.insert_child_at_index(this._indicator, 0); // Add the indicator to the panel
    this._indicator.startUpdate(); // Start updating the indicator
  }

  // Method to disable the extension
  disable() {
    if (this._indicator) {
      this._indicator.destroy(); // Destroy the indicator
      this._indicator = null; // Clear the reference
      this._settings = null;
    }
  }
}