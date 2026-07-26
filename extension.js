import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TimezoneOverrideExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._desktopSettings = null;
    }

    enable() {
        this._settings = this.getSettings();
        this._desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (!dateMenu?._clock || !dateMenu._clockDisplay) return;

        dateMenu._clock.connectObject('notify::clock', this._updateClock.bind(this), this);
        this._settings.connectObject('changed::timezone', this._updateClock.bind(this), this);

        ['clock-format', 'clock-show-weekday', 'clock-show-date', 'clock-show-seconds'].forEach(key => {
            this._desktopSettings.connectObject(`changed::${key}`, this._updateClock.bind(this), this);
        });

        this._updateClock();
    }

    _updateClock() {
        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (!dateMenu?._clock || !dateMenu._clockDisplay || !this._settings || !this._desktopSettings) return;

        try {
            const tzName = this._settings.get_string('timezone') || 'UTC';
            let tz = GLib.TimeZone.new_identifier(tzName) || GLib.TimeZone.new_utc();
            const now = GLib.DateTime.new_now(tz);

            const is12Hour = this._desktopSettings.get_string('clock-format') === '12h';
            const showWeekday = this._desktopSettings.get_boolean('clock-show-weekday');
            const showDate = this._desktopSettings.get_boolean('clock-show-date');
            const showSeconds = this._desktopSettings.get_boolean('clock-show-seconds');

            const format = is12Hour ? 1 : 0;
            const clockString = dateMenu._clock.string_for_datetime(now, format, showWeekday, showDate, showSeconds);

            dateMenu._clockDisplay.set_text(clockString);
        } catch (e) {
            console.error(`[TimezoneOverride] Update Error: ${e}`);
        }
    }

    disable() {
        const dateMenu = Main.panel?.statusArea?.dateMenu;

        dateMenu?._clock?.disconnectObject(this);
        this._settings?.disconnectObject(this);
        this._desktopSettings?.disconnectObject(this);

        if (dateMenu?._clock && dateMenu._clockDisplay) {
            dateMenu._clockDisplay.set_text(dateMenu._clock.clock);
        }

        this._settings = null;
        this._desktopSettings = null;
    }
}
