import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ZONEINFO_DIRS = [
    GLib.getenv('TZDIR'),
    '/usr/share/zoneinfo',
    '/etc/zoneinfo',
    '/run/current-system/sw/share/zoneinfo',
].filter(Boolean);

function readTextFile(name) {
    for (const dir of ZONEINFO_DIRS) {
        try {
            const [ok, bytes] = GLib.file_get_contents(`${dir}/${name}`);
            if (ok)
                return new TextDecoder().decode(bytes);
        } catch {
            continue;
        }
    }
    return null;
}

function parseTab(text) {
    if (!text)
        return [];
    return text.split('\n')
        .filter(l => l.length > 0 && !l.startsWith('#'))
        .map(l => l.split('\t'));
}

function uiLocale() {
    const name = GLib.get_language_names()[0] ?? 'en';
    if (name === 'C' || name === 'POSIX')
        return 'en';
    return name.split('.')[0].split('@')[0].replace('_', '-');
}

function makeCountryResolver() {
    const english = new Map(parseTab(readTextFile('iso3166.tab')).map(([cc, n]) => [cc, n]));
    let display = null;
    try {
        display = new Intl.DisplayNames([uiLocale(), 'en'], { type: 'region' });
    } catch {
        display = null;
    }
    return cc => {
        const local = display?.of(cc);
        const en = english.get(cc) ?? '';
        return {
            local: local && local !== cc ? local : (en || cc),
            en,
        };
    };
}

function cityFromId(id) {
    return id.split('/').pop().replace(/_/g, ' ');
}

function currentOffsetMinutes(tz) {
    return Math.round(GLib.DateTime.new_now(tz).get_utc_offset() / 6e7);
}

function formatOffset(mins) {
    if (mins === 0)
        return 'UTC';
    const abs = Math.abs(mins);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `UTC${mins < 0 ? '-' : '+'}${hh}${mm}`;
}

function makeEntry(id, city, country, countryEn) {
    const tz = GLib.TimeZone.new_identifier(id);
    if (!tz)
        return null;
    const offset = currentOffsetMinutes(tz);
    return { id, city, country, countryEn, tz, offset, offsetLabel: formatOffset(offset) };
}

function loadEntries(currentId) {
    const entries = [];
    const seen = new Set();
    const add = e => {
        if (e && !seen.has(e.id)) {
            seen.add(e.id);
            entries.push(e);
        }
    };

    const country = makeCountryResolver();
    for (const [cc, , id] of parseTab(readTextFile('zone.tab'))) {
        const c = country(cc);
        add(makeEntry(id, cityFromId(id), c.local, c.en));
    }

    add(makeEntry('UTC', 'UTC', '', ''));
    if (currentId)
        add(makeEntry(currentId, cityFromId(currentId), '', ''));

    const collator = new Intl.Collator(uiLocale(), { sensitivity: 'base' });
    entries.sort((a, b) => collator.compare(a.city, b.city) || collator.compare(a.country, b.country));
    return entries;
}

function normalize(s) {
    return s.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2212\u2013\u2014]/g, '-')
        .toLowerCase()
        .replace(/ё/g, 'е');
}

function parseOffsetToken(tok) {
    const m = /^(?:utc|gmt)?([+-])(\d*)(?::(\d*))?$/.exec(tok);
    if (!m)
        return null;

    const sign = m[1] === '-' ? -1 : 1;
    const digits = m[2];
    let hours = null;
    let minutes = null;

    if (m[3] !== undefined) {
        if (digits.length > 2 || m[3].length > 2)
            return null;
        hours = digits === '' ? null : parseInt(digits, 10);
        minutes = m[3] === '' ? null : m[3];
    } else if (digits.length <= 2) {
        hours = digits === '' ? null : parseInt(digits, 10);
    } else if (digits.length === 3) {
        hours = parseInt(digits[0], 10);
        minutes = digits.slice(1);
    } else if (digits.length === 4) {
        hours = parseInt(digits.slice(0, 2), 10);
        minutes = digits.slice(2);
    } else {
        return null;
    }

    return { sign, hours, minutes };
}

function offsetMatches(q, entry) {
    const off = entry.offset;
    if (off !== 0 && (off < 0 ? -1 : 1) !== q.sign)
        return false;
    const abs = Math.abs(off);
    if (q.hours !== null && Math.floor(abs / 60) !== q.hours)
        return false;
    if (q.minutes !== null && !String(abs % 60).padStart(2, '0').startsWith(q.minutes))
        return false;
    return true;
}

function compileQuery(text) {
    const tokens = normalize(text).split(/\s+/).filter(Boolean);
    return tokens.map(tok => {
        const offset = parseOffsetToken(tok);
        return offset ? { offset } : { text: tok };
    });
}

function entryMatches(compiled, entry) {
    if (compiled.length === 0)
        return true;
    if (!entry.haystack) {
        entry.haystack = normalize(
            `${entry.city} ${entry.country} ${entry.countryEn} ${entry.id.replace(/_/g, ' ')}`);
    }
    return compiled.every(t => t.offset
        ? offsetMatches(t.offset, entry)
        : entry.haystack.includes(t.text));
}

const TimezoneItem = GObject.registerClass(
class TimezoneItem extends GObject.Object {
    _init(entry) {
        super._init();
        this.entry = entry;
    }
});

function describe(entry) {
    return entry.country ? `${entry.city}, ${entry.country}` : entry.city;
}

function subtitleFor(entry) {
    return entry.id === entry.offsetLabel ? entry.id : `${entry.id} \u2022 ${entry.offsetLabel}`;
}

function timeFormat() {
    const s = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    const is12h = s.get_string('clock-format') === '12h';
    return is12h ? '%a %I:%M %p' : '%a %H:%M';
}

function createPickerDialog(parent, entries, currentId, onPick) {
    const fmt = timeFormat();
    const store = new Gio.ListStore({ item_type: TimezoneItem });
    entries.forEach(e => store.append(new TimezoneItem(e)));

    let compiled = [];
    const filter = new Gtk.CustomFilter();
    filter.set_filter_func(item => entryMatches(compiled, item.entry));
    const filtered = new Gtk.FilterListModel({ model: store, filter });
    const selection = new Gtk.NoSelection({ model: filtered });

    const bound = new Map();
    const formatTime = entry => GLib.DateTime.new_now(entry.tz).format(fmt);

    const factory = new Gtk.SignalListItemFactory();
    factory.connect('setup', (_f, listItem) => {
        const box = new Gtk.Box({
            spacing: 12,
            margin_top: 10,
            margin_bottom: 10,
            margin_start: 16,
            margin_end: 12,
        });
        const left = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 3,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        const title = new Gtk.Label({
            xalign: 0,
            use_markup: true,
            ellipsize: Pango.EllipsizeMode.END,
        });
        const sub = new Gtk.Label({
            xalign: 0,
            ellipsize: Pango.EllipsizeMode.END,
            css_classes: ['dim-label', 'caption'],
        });
        left.append(title);
        left.append(sub);

        const time = new Gtk.Label({
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label', 'numeric'],
        });
        const check = new Gtk.Image({
            icon_name: 'object-select-symbolic',
            valign: Gtk.Align.CENTER,
        });

        box.append(left);
        box.append(time);
        box.append(check);
        listItem.set_child(box);
        bound.set(listItem, { title, sub, time, check, entry: null });
    });
    factory.connect('bind', (_f, listItem) => {
        const w = bound.get(listItem);
        const entry = listItem.get_item().entry;
        w.entry = entry;
        const city = GLib.markup_escape_text(entry.city, -1);
        w.title.set_markup(entry.country
            ? `${city}  <b>${GLib.markup_escape_text(entry.country, -1)}</b>`
            : city);
        w.sub.set_text(subtitleFor(entry));
        w.time.set_text(formatTime(entry));
        w.check.set_opacity(entry.id === currentId ? 1 : 0);
    });
    factory.connect('unbind', (_f, listItem) => {
        const w = bound.get(listItem);
        if (w)
            w.entry = null;
    });
    factory.connect('teardown', (_f, listItem) => bound.delete(listItem));

    const listView = new Gtk.ListView({
        model: selection,
        factory,
        single_click_activate: true,
        show_separators: true,
    });

    const scrolled = new Gtk.ScrolledWindow({
        child: listView,
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
    });

    const empty = new Adw.StatusPage({
        icon_name: 'system-search-symbolic',
        title: 'No Results Found',
        description: 'Try a different search term',
        vexpand: true,
    });

    const stack = new Gtk.Stack({ vexpand: true });
    stack.add_named(scrolled, 'list');
    stack.add_named(empty, 'empty');

    const searchEntry = new Gtk.SearchEntry({
        placeholder_text: 'Search cities',
        hexpand: true,
        margin_top: 6,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
    });

    const content = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
    content.append(searchEntry);
    content.append(new Gtk.Separator());
    content.append(stack);

    const header = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({ title: 'Select Time Zone', subtitle: '' }),
    });
    const toolbar = new Adw.ToolbarView({ content });
    toolbar.add_top_bar(header);

    const hasDialog = typeof Adw.Dialog === 'function';
    let dialog;
    if (hasDialog) {
        dialog = new Adw.Dialog({
            title: 'Select Time Zone',
            content_width: 560,
            content_height: 620,
            child: toolbar,
        });
    } else {
        dialog = new Adw.Window({
            title: 'Select Time Zone',
            modal: true,
            transient_for: parent,
            default_width: 560,
            default_height: 620,
            content: toolbar,
        });
        const keys = new Gtk.EventControllerKey();
        keys.connect('key-pressed', (_c, keyval) => {
            if (keyval === Gdk.KEY_Escape) {
                dialog.close();
                return true;
            }
            return false;
        });
        dialog.add_controller(keys);
    }

    const pick = entry => {
        onPick(entry);
        dialog.close();
    };

    listView.connect('activate', (_v, position) => {
        const item = filtered.get_item(position);
        if (item)
            pick(item.entry);
    });

    const updateStack = () => {
        stack.set_visible_child_name(filtered.get_n_items() > 0 ? 'list' : 'empty');
    };
    filtered.connect('items-changed', updateStack);

    searchEntry.connect('search-changed', () => {
        compiled = compileQuery(searchEntry.get_text());
        filter.changed(Gtk.FilterChange.DIFFERENT);
        if (filtered.get_n_items() > 0)
            listView.scroll_to(0, Gtk.ListScrollFlags.NONE, null);
    });
    searchEntry.connect('activate', () => {
        const item = filtered.get_item(0);
        if (item)
            pick(item.entry);
    });
    searchEntry.connect('stop-search', () => {
        if (searchEntry.get_text() !== '')
            searchEntry.set_text('');
        else
            dialog.close();
    });
    const entryKeys = new Gtk.EventControllerKey();
    entryKeys.connect('key-pressed', (_c, keyval) => {
        if (keyval === Gdk.KEY_Down && filtered.get_n_items() > 0) {
            listView.grab_focus();
            return true;
        }
        return false;
    });
    searchEntry.add_controller(entryKeys);

    let timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 15, () => {
        if (!listView.get_root()) {
            timer = 0;
            return GLib.SOURCE_REMOVE;
        }
        for (const w of bound.values()) {
            if (w.entry)
                w.time.set_text(formatTime(w.entry));
        }
        return GLib.SOURCE_CONTINUE;
    });
    const cleanup = () => {
        if (timer) {
            GLib.source_remove(timer);
            timer = 0;
        }
    };
    if (hasDialog)
        dialog.connect('closed', cleanup);
    else
        dialog.connect('close-request', () => { cleanup(); return false; });

    return {
        present() {
            if (hasDialog)
                dialog.present(parent);
            else
                dialog.present();

            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                searchEntry.grab_focus();
                const idx = entries.findIndex(e => e.id === currentId);
                if (idx >= 0)
                    listView.scroll_to(idx, Gtk.ListScrollFlags.NONE, null);
                return GLib.SOURCE_REMOVE;
            });
        },
    };
}

export default class TimezoneOverridePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(720, 680);
        window.set_search_enabled?.(false);

        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Timezone Settings',
            description: 'Choose the timezone shown by the top panel clock',
        });
        page.add(group);

        let currentId = settings.get_string('timezone') || 'UTC';
        let entries = null;
        const getEntries = () => {
            if (!entries)
                entries = loadEntries(currentId);
            return entries;
        };

        const row = new Adw.ActionRow({ title: 'Time Zone', activatable: true });
        const valueLabel = new Gtk.Label({
            ellipsize: Pango.EllipsizeMode.END,
            css_classes: ['dim-label'],
            valign: Gtk.Align.CENTER,
        });
        row.add_suffix(valueLabel);
        row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));
        group.add(row);

        const refresh = () => {
            currentId = settings.get_string('timezone') || 'UTC';
            const entry = getEntries().find(e => e.id === currentId) ??
                makeEntry(currentId, cityFromId(currentId), '', '');
            if (entry) {
                valueLabel.set_text(describe(entry));
                row.set_subtitle(subtitleFor(entry));
            } else {
                valueLabel.set_text(currentId);
                row.set_subtitle('Unknown timezone');
            }
        };
        refresh();

        const changedId = settings.connect('changed::timezone', refresh);
        window.connect('close-request', () => {
            settings.disconnect(changedId);
            return false;
        });

        row.connect('activated', () => {
            const picker = createPickerDialog(window, getEntries(), currentId, entry => {
                if (entry.id !== currentId)
                    settings.set_string('timezone', entry.id);
            });
            picker.present();
        });
    }
}
