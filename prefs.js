import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class TimezoneOverridePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        let settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Timezone Settings',
            description: 'Enter time zone e.g., UTC, Europe/London',
        });
        page.add(group);

        const timezoneRow = new Adw.EntryRow({
            title: 'Timezone',
        });
        group.add(timezoneRow);

        settings.bind('timezone', timezoneRow, 'text', Gio.SettingsBindFlags.DEFAULT);

        window.add(page);
    }
}
