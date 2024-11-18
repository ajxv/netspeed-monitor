'use strict';

import GObject from 'gi://GObject';
import St from 'gi://St';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const REFRESH_INTERVAL = 3;
const IGNORED_INTERFACES = ['lo', 'vir', 'vbox', 'docker', 'br-'];

const NetworkSpeedIndicator = GObject.registerClass(
  class NetworkSpeedIndicator extends St.Label {
    _init() {
      super._init({
        style_class: 'network-speed-label',
        y_align: Clutter.ActorAlign.CENTER,
        text: '↓ 0 B/s ↑ 0 B/s'
      });

      this._lastRxBytes = 0;
      this._lastTxBytes = 0;
      this._timeoutId = null;
    }

    _formatSpeed(bytes) {
      const suffixes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      let index = 0;
      let speed = bytes;
      
      while (speed >= 1024 && index < suffixes.length - 1) {
        speed /= 1024;
        index++;
      }
      
      return `${speed.toFixed(1)} ${suffixes[index]}`;
    }

    _shouldSkipInterface(interfaceName) {
      return IGNORED_INTERFACES.some(prefix => interfaceName.startsWith(prefix));
    }

    _updateSpeed() {
      try {
        const [success, output] = GLib.spawn_command_line_sync('cat /proc/net/dev');
        if (!success) return GLib.SOURCE_CONTINUE;

        const lines = new TextDecoder().decode(output).split('\n');
        let totalRx = 0;
        let totalTx = 0;

        // Skip first two lines (headers)
        for (const line of lines.slice(2)) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const [iface, data] = trimmed.split(':');
          if (!data || this._shouldSkipInterface(iface)) continue;

          const [rx, , , , , , , , tx] = data.trim().split(/\s+/).map(n => parseInt(n, 10));
          totalRx += rx;
          totalTx += tx;
        }

        // Initialize last values if needed
        if (!this._lastRxBytes) this._lastRxBytes = totalRx;
        if (!this._lastTxBytes) this._lastTxBytes = totalTx;

        // Calculate speeds
        const rxSpeed = this._formatSpeed((totalRx - this._lastRxBytes) / REFRESH_INTERVAL);
        const txSpeed = this._formatSpeed((totalTx - this._lastTxBytes) / REFRESH_INTERVAL);

        // Update display
        this.text = `↓ ${rxSpeed} ↑ ${txSpeed}`;
        
        // Store current values for next update
        this._lastRxBytes = totalRx;
        this._lastTxBytes = totalTx;
      } catch (e) {
        console.error(`NetworkSpeed: ${e}`);
      }

      return GLib.SOURCE_CONTINUE;
    }

    startUpdate() {
      this._updateSpeed();
      this._timeoutId = GLib.timeout_add_seconds(
        GLib.PRIORITY_DEFAULT,
        REFRESH_INTERVAL,
        this._updateSpeed.bind(this)
      );
    }

    stopUpdate() {
      if (this._timeoutId) {
        GLib.source_remove(this._timeoutId);
        this._timeoutId = null;
      }
    }
  }
);

export default class NetworkSpeedExtension extends Extension {
    enable() {
        this._indicator = new NetworkSpeedIndicator();
        Main.panel._rightBox.insert_child_at_index(this._indicator, 0);
        this._indicator.startUpdate();
    }

    disable() {
        if (this._indicator) {
            this._indicator.stopUpdate();
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}