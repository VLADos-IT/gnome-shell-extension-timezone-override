UUID = timezone-override@VLADos-IT.github.com
ZIP  = $(UUID).shell-extension.zip

zip:
	rm -f $(ZIP) schemas/gschemas.compiled
	zip -r $(ZIP) extension.js prefs.js metadata.json LICENSE schemas/*.gschema.xml

.PHONY: zip
