import sys

filepath = r'c:\Users\aditi\OneDrive\Desktop\company project\bakalaa\Frontend\src\modules\Food\pages\admin\categories\Category.jsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for line in lines:
    # Remove Zone header
    if '<th className="w-[15%] px-4 py-4 text-left text-[11px] font-bold uppercase tracking-wider text-slate-600">Zone</th>' in line:
        continue
    # Handle the messy partial removals in the td
    if 'const zoneText = zoneLabel(category?.zoneId, zones)' in line:
        continue
    if '{zoneText}' in line:
        continue
    if '</p>' in line and '{zoneText}' in lines[lines.index(line)-1]: # risky
        continue
    
    new_lines.append(line)

# Since I already made some mess, I'll just do a more robust string replacement for the modal part
content = "".join(new_lines)

# Remove the Zone div in modal
import re
pattern = r'<div>\s*<select\s*value=\{formData\.zoneId\}.*?<\/select>\s*<\/div>'
content = re.sub(pattern, '', content, flags=re.DOTALL)

# Also remove the leftover <td> markers if any
content = content.replace('<td className="px-4 py-5">\n                        <div className="max-w-[180px]">', '')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
