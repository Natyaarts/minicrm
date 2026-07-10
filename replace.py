import re

with open('mobile/app/(tabs)/index.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all occurrences of: isDark ? '#darkColor' : '#lightColor'
# with just '#lightColor'
content = re.sub(r"isDark \? '([^']+)' : '([^']+)'", r"'\2'", content)

# Change F9FAFB (off-white) to FFFFFF (pure white) for background
content = content.replace("'#F9FAFB'", "'#FFFFFF'")

with open('mobile/app/(tabs)/index.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Replaced successfully")
