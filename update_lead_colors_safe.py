import re

with open('mobile/app/lead-details.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Force isDark to false
content = re.sub(r"const isDark = colorScheme === 'dark';", "const isDark = false;", content)

def fix_styles(match):
    style_block = match.group(0)
    
    # Background colors
    style_block = re.sub(r"backgroundColor:\s*'#0F172A'", "backgroundColor: '#F9FAFB'", style_block)
    style_block = re.sub(r"backgroundColor:\s*'#1E293B'", "backgroundColor: '#FFFFFF'", style_block)
    
    # Border colors
    style_block = re.sub(r"borderColor:\s*'#334155'", "borderColor: '#E5E7EB'", style_block)
    style_block = re.sub(r"borderBottomColor:\s*'#334155'", "borderBottomColor: '#E5E7EB'", style_block)
    
    # Text colors
    style_block = re.sub(r"color:\s*'#FFFFFF'", "color: '#111827'", style_block)
    style_block = re.sub(r"color:\s*'#0F172A'", "color: '#111827'", style_block)
    style_block = re.sub(r"color:\s*'#334155'", "color: '#4B5563'", style_block)
    
    # Specific colors
    style_block = style_block.replace("'#FBBF24'", "'#FFB800'")
    
    return style_block

# Apply the regex only in the StyleSheet.create block
content = re.sub(r'const styles = StyleSheet.create\(\{.*?\}\);', fix_styles, content, flags=re.DOTALL)

# Now fix the submit text and specific active texts where `#111827` looks bad, or restore specific #FFF text
content = content.replace(
    "actionBtnText: {\n    fontSize: 12,\n    color: '#111827',\n    fontWeight: '800',\n  }",
    "actionBtnText: {\n    fontSize: 12,\n    color: '#FFFFFF',\n    fontWeight: '800',\n  }"
)

# submitBtnText and typeBtnTextActive should have high contrast.
# They are on yellow / black active buttons. The yellow active buttons have '#FFB800' bg. Text should be black.
# That is already covered because '#0F172A' (slate 900 text) became '#111827'.

with open('mobile/app/lead-details.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated lead-details styles safely.")
