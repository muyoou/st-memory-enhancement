import re
import json
import os

html_path = r'c:\SillyTavern\SillyTavern-Launcher\SillyTavern\public\scripts\extensions\third-party\st-memory-enhancement\assets\templates\index.html'
output_path = r'c:\SillyTavern\SillyTavern-Launcher\SillyTavern\public\scripts\extensions\third-party\st-memory-enhancement\assets\locales\zh-cn.json'

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Regex to find data-i18n="key">value< or data-i18n="[attr]key">...
# And also handle cases where value might be wrapped in tags or whitespace
# Pattern: data-i18n="([^"]+)"[^>]*>(.*?)<
# But some are self-closing or use attributes like placeholder

translations = {}

# 1. Matches elements with content: <tag data-i18n="key">Content</tag>
# We use a simple regex approach which might miss complex nested cases but sufficient for this file structure
# Capture group 1: key, Capture group 2: content
matches_content = re.findall(r'data-i18n="([^"]+)"[^>]*>(.*?)</', content, re.DOTALL)

for key, text in matches_content:
    text = text.strip()
    if text:
        translations[key] = text

# 2. Matches [attr]key style, e.g. title="Chinese" data-i18n="[title]Key"
# We look for the attribute value corresponding to the bracketed part
matches_attr = re.findall(r'([a-z-]+)="([^"]+)"[^>]*data-i18n="\[\1\]([^"]+)"', content)
for attr, text, key in matches_attr:
     translations[f"[{attr}]{key}"] = text
     # Also try matching without the attribute prefix in key if that's how it's stored? 
     # Usually [title]Key matches Key in en.json? Let's check en.json format later. 
     # Assuming the key in json includes [title] prefix if that's the convention, 
     # or the key is just "Key". 
     # Standard i18n libraries usually use the key as is. 
     # Let's assume the key in data-i18n IS the key in JSON.
     translations[f"[{attr}]{key}"] = text

# 3. Also handle cases where data-i18n comes BEFORE the attribute (order)
matches_attr_reverse = re.findall(r'data-i18n="\[([a-z-]+)\]([^"]+)"[^>]*\1="([^"]+)"', content)
for attr, key, text in matches_attr_reverse:
    translations[f"[{attr}]{key}"] = text

print(f"Extracted {len(translations)} keys.")

# Save to zh-cn.json
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(translations, f, ensure_ascii=False, indent=4)
