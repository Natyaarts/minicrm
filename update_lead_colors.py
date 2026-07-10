import re

with open('mobile/app/lead-details.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the isDark check on line 36 to force false
content = re.sub(r"const isDark = colorScheme === 'dark';", "const isDark = false;", content)

# Also, there's `backgroundColor: '#0F172A'` hardcoded for `container`
content = content.replace("'#0F172A'", "'#F9FAFB'") # Slate 900 -> light gray bg
content = content.replace("'#1E293B'", "'#FFFFFF'") # Slate 800 -> white card
content = content.replace("'#334155'", "'#E5E7EB'") # Slate 700 -> light border

# Text colors
# To avoid replacing icon #FFF, we target specific lines in styles by using regex on style properties
def replace_text_colors(match):
    style_block = match.group(0)
    
    # Replace white text with dark slate text in styles
    style_block = re.sub(r"color:\s*'#FFFFFF'", "color: '#111827'", style_block)
    
    # Replace FBBF24 with FFB800 in styles
    style_block = style_block.replace("'#FBBF24'", "'#FFB800'")
    
    return style_block

# Apply text color replacement only inside StyleSheet.create
content = re.sub(r'const styles = StyleSheet.create\(\{.*?\}\);', replace_text_colors, content, flags=re.DOTALL)

# Some specific button texts need to stay white
# like the WhatsApp/Dialpad ones which are inline or in specific classes.
# The previous regex changed ALL '#FFFFFF' to '#111827' inside styles.
# Let's fix specific button texts inside styles back to '#FFFFFF' if needed,
# or we just rely on the inline <FontAwesome5 color="#FFF" /> which wasn't touched because it's not in StyleSheet!
# The only text that was changed was style text. 
# ActionBtnText was '#FFFFFF'? Wait, let's look at `actionBtnText`
content = content.replace("actionBtnText: {\n    fontSize: 12,\n    color: '#111827'", "actionBtnText: {\n    fontSize: 12,\n    color: '#FFFFFF'")

with open('mobile/app/lead-details.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated lead-details.tsx")
