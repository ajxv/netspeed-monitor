'use strict';

// Import required GNOME Shell libraries
import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Configuration constants
const UPDATE_INTERVAL_SECONDS = 3;
const NETWORK_INTERFACES_TO_IGNORE = ['lo', 'vir', 'vbox', 'docker', 'br-'];

/**
 * NetworkSpeedIndicator class - Displays network upload and download speeds
 * in the GNOME Shell panel
 */
const NetworkSpeedIndicator = GObject.registerClass(
  class NetworkSpeedIndicator extends St.Label {
    _init() {
      // Initialize the label with default styling and text
      super._init({
        style_class: 'network-speed-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '↓ 0 B/s ↑ 0 B/s'
      });

      // Initialize state variables
      this._previousRxBytes = 0;
      this._previousTxBytes = 0;
      this._updateTimer = null;
    }

    /**
     * Converts bytes per second to human-readable format
     * @param {number} bytes - Bytes per second to format
     * @returns {string} Formatted speed string
     */
    _formatSpeedValue(bytes) {
      const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      let unitIndex = 0;
      let speed = bytes;
      
      // Convert to appropriate unit
      while (speed >= 1024 && unitIndex < units.length - 1) {
        speed /= 1024;
        unitIndex++;
      }
      
      return `${speed.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Checks if a network interface should be excluded from calculations
     * @param {string} interfaceName - Name of the network interface
     * @returns {boolean} True if interface should be ignored
     */
    _isIgnoredInterface(interfaceName) {
      return NETWORK_INTERFACES_TO_IGNORE.some(prefix => 
        interfaceName.startsWith(prefix)
      );
    }

    /**
     * Updates the network speed display
     * @returns {boolean} Always returns true to keep the update timer running
     */
    _updateSpeed() {
      try {
        // Read network statistics from /proc/net/dev
        const [success, output] = GLib.spawn_command_line_sync('cat /proc/net/dev');
        if (!success) return GLib.SOURCE_CONTINUE;

        // Parse network statistics
        const lines = new TextDecoder().decode(output).split('\n');
        let totalRxBytes = 0;
        let totalTxBytes = 0;

        // Process each interface's data (skip header lines)
        for (const line of lines.slice(2)) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const [iface, data] = trimmed.split(':');
          if (!data || this._isIgnoredInterface(iface)) continue;

          // Extract rx and tx bytes from statistics
          const [rxBytes, , , , , , , , txBytes] = data.trim()
            .split(/\s+/)
            .map(n => parseInt(n, 10));
            
          totalRxBytes += rxBytes;
          totalTxBytes += txBytes;
        }

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
      } catch (error) {
        console.error('NetworkSpeed:', error);
      }

      return GLib.SOURCE_CONTINUE;
    }

    /**
     * Starts periodic updates of the network speed display
     */
    startUpdate() {
      this._updateSpeed();
      this._updateTimer = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        UPDATE_INTERVAL_SECONDS,
        this._updateSpeed.bind(this)
      );
    }

    /**
     * Stops periodic updates of the network speed display
     */
    stopUpdate() {
      if (this._updateTimer) {
        GLib.source_remove(this._updateTimer);
        this._updateTimer = null;
      }
    }
  }
);

/**
 * Main extension class that handles initialization and cleanup
 */
export default class NetworkSpeedExtension extends Extension {
    enable() {
      // Create and add the indicator to the panel
      this._indicator = new NetworkSpeedIndicator();
      Main.panel._rightBox.insert_child_at_index(this._indicator, 0);
      this._indicator.startUpdate();
    }

    disable() {
      // Clean up when the extension is disabled
      if (this._indicator) {
        this._indicator.stopUpdate();
        this._indicator.destroy();
        this._indicator = null;
      }
    }
}