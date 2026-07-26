import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function getTimezoneIds() {
    try {
        const ids = Intl.supportedValuesOf('timeZone');
        if (Array.isArray(ids) && ids.length > 0)
            return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
    } catch (e) {
        }
    return null;
}

function toLabel(id) {
    const parts = id.split('/');
    const city = parts.pop().replace(/_/g, ' ');
    const region = parts.join('/').replace(/_/g, ' ');
    return region ? `${city} — ${region}` : city;
}

export default class TimezoneOverridePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(480, 220);

        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Timezone Settings',
            description: 'Choose the timezone shown by the top panel clock',
        });
        page.add(group);

        const currentTz = settings.get_string('timezone') || 'UTC';
        const ids = getTimezoneIds();

        if (ids) {
            if (!ids.includes(currentTz)) {
                ids.push(currentTz);
                ids.sort((a, b) => a.localeCompare(b));
            }

            const model = new Gtk.StringList();
            ids.forEach(id => model.append(toLabel(id)));

            const timezoneRow = new Adw.ComboRow({
                title: 'Timezone',
                subtitle: 'Search by city, e.g. "Riga"',
                model,
                expression: Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'),
                enable_search: true,
                selected: Math.max(0, ids.indexOf(currentTz)),
            });
            timezoneRow.connect('notify::selected', () => {
                const idx = timezoneRow.selected;
                if (idx >= 0 && idx < ids.length)
                    settings.set_string('timezone', ids[idx]);
            });
            group.add(timezoneRow);
        } else {
            const timezoneRow = new Adw.EntryRow({ title: 'Timezone' });
            settings.bind('timezone', timezoneRow, 'text', Gio.SettingsBindFlags.DEFAULT);
            group.add(timezoneRow);
        }
    }
}