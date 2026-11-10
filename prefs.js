import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
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
    const name = region ? `${city} — ${region}` : city;

    const tz = GLib.TimeZone.new_identifier(id);
    if (!tz)
        return name;
    const mins = Math.round(GLib.DateTime.new_now(tz).get_utc_offset() / 6e7);
    const abs = Math.abs(mins);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${name} (UTC${mins < 0 ? '-' : '+'}${hh}:${mm})`;
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
            if (!ids.includes(currentTz))
                ids.push(currentTz);

            const items = ids.map(id => ({ id, label: toLabel(id) }));
            items.sort((a, b) => a.label.localeCompare(b.label));
            const sortedIds = items.map(i => i.id);

            const model = new Gtk.StringList();
            items.forEach(i => model.append(i.label));

            const timezoneRow = new Adw.ComboRow({
                title: 'Timezone',
                subtitle: 'Search by city or offset, e.g. "Riga" or "+03"',
                model,
                expression: Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'),
                enable_search: true,
                selected: Math.max(0, sortedIds.indexOf(currentTz)),
            });
            timezoneRow.connect('notify::selected', () => {
                const idx = timezoneRow.selected;
                if (idx >= 0 && idx < sortedIds.length)
                    settings.set_string('timezone', sortedIds[idx]);
            });
            group.add(timezoneRow);
        } else {
            const timezoneRow = new Adw.EntryRow({ title: 'Timezone' });
            settings.bind('timezone', timezoneRow, 'text', Gio.SettingsBindFlags.DEFAULT);
            group.add(timezoneRow);
        }
    }
}
