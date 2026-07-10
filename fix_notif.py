import re

with open('mobile/app/notifications.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update the render item layout
new_render_item = """  const renderItem = ({ item }: { item: NotificationItem }) => {
    const config = getNotificationIcon(item.notification_type);

    return (
      <View style={[styles.card, !item.is_read && styles.unreadCard]}>
        <TouchableOpacity
          onPress={() => handleNotificationPress(item)}
          style={styles.cardMain}
          activeOpacity={0.7}
        >
          <View style={[styles.iconContainer, { backgroundColor: config.bg }]}>
            <FontAwesome5 name={config.name} size={18} color={config.color} />
          </View>
          <View style={styles.contentContainer}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, !item.is_read && styles.unreadText]}>
                {item.title}
              </Text>
              <TouchableOpacity
                onPress={() => handleDeleteNotification(item.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <FontAwesome5 name="trash-alt" size={12} color="#EF4444" style={{ opacity: 0.7 }} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cardMessage} numberOfLines={3}>
              {item.message}
            </Text>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };"""

# Replace renderItem
content = re.sub(r'  const renderItem = \(\{ item \}: \{ item: NotificationItem \}\) => \{.*?(?=  return \()', new_render_item + '\n\n', content, flags=re.DOTALL)
content = content.replace(new_render_item + '\n\n  return (', new_render_item + '\n\n  return (') # wait, regex might have eaten `return (`. 
# Actually safer to just replace the whole function. Let's do it via regex carefully.
