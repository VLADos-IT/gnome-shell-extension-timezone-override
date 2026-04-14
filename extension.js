import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class TimezoneOverrideExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._desktopSettings = null;
        this._clockNotifyId = null;
        this._settingsConnectId = null;
        this._desktopSettingsIds = []; // key -> id
    }

    enable() {
        this._settings = this.getSettings();
        this._desktopSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });

        const dateMenu = Main.panel?.statusArea?.dateMenu;
        if (!dateMenu?._clock || !dateMenu._clockDisplay) return;

        this._clockNotifyId = dateMenu._clock.connect('notify::clock', this._updateClock.bind(this));
        this._settingsConnectId = this._settings.connect('changed::timezone', this._updateClock.bind(this));

        ['clock-format', 'clock-show-weekday', 'clock-show-date', 'clock-show-seconds'].forEach(key => {
            const id = this._desktopSettings.connect(`changed::${key}`, this._updateClock.bind(this));
            this._desktopSettingsIds.push(id);
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

        if (this._clockNotifyId && dateMenu?._clock) {
            dateMenu._clock.disconnect(this._clockNotifyId);
            this._clockNotifyId = null;
        }

        if (this._settingsConnectId && this._settings) {
            this._settings.disconnect(this._settingsConnectId);
            this._settingsConnectId = null;
        }

        if (this._desktopSettings && this._desktopSettingsIds.length > 0) {
            this._desktopSettingsIds.forEach(id => this._desktopSettings.disconnect(id));
            this._desktopSettingsIds = [];
        }

        if (dateMenu?._clock && dateMenu._clockDisplay) {
            dateMenu._clockDisplay.set_text(dateMenu._clock.clock);
        }

        this._settings = null;
        this._desktopSettings = null;
    }
}
