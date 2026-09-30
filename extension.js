'use strict';

// Import necessary GObject and GNOME Shell modules
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Constants for update interval, ignored interfaces, and long press duration
const UPDATE_INTERVAL_SECONDS = 3;
const LONG_PRESS_DURATION_MS = 1000; // 1 second
const NETWORK_INTERFACES_TO_IGNORE = ['vir', 'vbox', 'docker', 'veth', 'br-'];
const LOOPBACK_INTERFACE = 'lo';
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
      this._previousSampleUs = null; // Monotonic time of previous sample
      this._downloadBps = 0; // Last computed speeds in bytes per second
      this._uploadBps = 0;
      this._cancellable = new Gio.Cancellable();

      // Create a Gio.File instance for reading network stats from /proc/net/dev
      this._netDevFile = Gio.File.new_for_path(PROC_NET_DEV_PATH);

      // Long-press detection via plain press/release events, since
      // Clutter.ClickAction was removed and LongPressGesture is not on all versions.
      this._signalIds = [
        this.connect('button-press-event', () => {
          this._cancelLongPress();
          this._longPressTimeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            LONG_PRESS_DURATION_MS,
            () => {
              this._longPressTimeout = null;
              this._toggleUnits();
              return GLib.SOURCE_REMOVE;
            }
          );
          return Clutter.EVENT_PROPAGATE;
        }),
        this.connect('button-release-event', () => {
          this._cancelLongPress();
          return Clutter.EVENT_PROPAGATE;
        }),
        this.connect('leave-event', () => {
          this._cancelLongPress();
          return Clutter.EVENT_PROPAGATE;
        }),
      ];
    }

    _toggleUnits() {
      const currentVal = this._settings.get_boolean('use-bits');
      this._settings.set_boolean('use-bits', !currentVal);
      this._renderSpeed();
    }

    _cancelLongPress() {
      if (this._longPressTimeout) {
        GLib.source_remove(this._longPressTimeout);
        this._longPressTimeout = null;
      }
    }

    destroy() {
      // Clean up signals, timers and periodic updates, then remove from UI
      this._signalIds?.forEach(id => this.disconnect(id));
      this._signalIds = null;
      this._cancelLongPress();
      this.stopUpdate();
      this._cancellable.cancel();
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
      return interfaceName === LOOPBACK_INTERFACE ||
        NETWORK_INTERFACES_TO_IGNORE.some(prefix => interfaceName.startsWith(prefix));
    }

    // Method to read network statistics asynchronously; resolves null on failure
    _readNetworkStats() {
      // Read and sum RX/TX bytes from /proc/net/dev for all interfaces except ignored
      return new Promise(resolve => {
        this._netDevFile.load_contents_async(this._cancellable, (file, result) => {
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
              if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;
              totalRxBytes += rxBytes;
              totalTxBytes += txBytes;
            }
            resolve({ totalRxBytes, totalTxBytes });
          } catch (error) {
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
              console.error('NetworkSpeed: Error reading stats:', error);
            resolve(null);
          }
        });
      });
    }

    _renderSpeed() {
      this.text = `↓ ${this._formatSpeedValue(this._downloadBps)} ↑ ${this._formatSpeedValue(this._uploadBps)}`;
    }

    async _updateSpeed() {
      // Calculate and update the displayed network speed
      if (this._updating) return; // skip if the previous read is still in flight
      this._updating = true;
      let stats;
      try {
        stats = await this._readNetworkStats();
      } finally {
        this._updating = false;
      }
      if (!stats || this._cancellable.is_cancelled()) return;

      const { totalRxBytes, totalTxBytes } = stats;
      const nowUs = GLib.get_monotonic_time();

      // On first run there is nothing to compare against yet
      if (this._previousSampleUs !== null) {
        const elapsedSeconds = (nowUs - this._previousSampleUs) / 1e6;
        if (elapsedSeconds > 0) {
          // Clamp at zero: counters drop when an interface disappears
          this._downloadBps = Math.max(0, totalRxBytes - this._previousRxBytes) / elapsedSeconds;
          this._uploadBps = Math.max(0, totalTxBytes - this._previousTxBytes) / elapsedSeconds;
        }
      }

      // Store current values for next update
      this._previousRxBytes = totalRxBytes;
      this._previousTxBytes = totalTxBytes;
      this._previousSampleUs = nowUs;

      this._renderSpeed();
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
    }
    this._settings = null;
  }
}
