import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Alert,
  StatusBar,
  ScrollView,
  Dimensions,
  Image
} from 'react-native';
import { router } from 'expo-router';
import { loginUser } from '../src/api/auth';
import { FontAwesome5 } from '@expo/vector-icons';

const { height, width } = Dimensions.get('window');

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Required Fields', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    const result = await loginUser(username, password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)');
    } else {
      Alert.alert('Authentication Failed', result.error);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#FFFDF5" />
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.mainContent}>
          {/* Logo & Branding */}
          <View style={styles.brandContainer}>
            <Image 
              source={require('../assets/images/logo.png')} 
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.brandTitle}>Natya Arts</Text>
            <Text style={styles.brandSubtitle}>ENTERPRISE PORTAL</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.subtext}>Access your workspace credentials</Text>

            {/* Username Input */}
            <View style={styles.inputLabelContainer}>
              <Text style={styles.inputLabel}>USERNAME</Text>
            </View>
            <View style={styles.inputWrapper}>
              <FontAwesome5 name="user" size={16} color="#A1A1AA" style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#A1A1AA"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View style={styles.inputLabelContainer}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
            </View>
            <View style={styles.inputWrapper}>
              <FontAwesome5 name="lock" size={16} color="#A1A1AA" style={styles.inputIcon} />
              <TextInput 
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#A1A1AA"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity 
                style={styles.eyeIcon} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <FontAwesome5 name={showPassword ? "eye" : "eye-slash"} size={14} color="#A1A1AA" />
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <TouchableOpacity 
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#0F172A" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Sign In Securely</Text>
                  <FontAwesome5 name="arrow-right" size={14} color="#0F172A" style={styles.buttonArrow} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer branding */}
          <Text style={styles.footerText}>© 2026 NATYA ARTS ACADEMY • PROD BUILD v1.2</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF5', // Soft Warm Ivory (Yellowish theme backdrop)
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFDF5',
  },
  mainContent: {
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
  },
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoImage: {
    width: 130,
    height: 130,
    marginBottom: 12,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1917', // Stone 900
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78716C', // Stone 500
    letterSpacing: 3,
    marginTop: 4,
  },
  card: {
    width: '100%',
    backgroundColor: '#FFFBEB', // Amber 50 (Slightly yellowish background)
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FEF3C7', // Amber 100
    padding: 24,
    shadowColor: '#D97706', // Yellowish/Amber shadow glow
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1917',
    marginBottom: 4,
  },
  subtext: {
    fontSize: 13,
    color: '#78716C',
    fontWeight: 'normal',
    marginBottom: 24,
  },
  inputLabelContainer: {
    marginBottom: 6,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#78716C',
    letterSpacing: 1.5,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Clean White input
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7', // Zinc 200
    paddingHorizontal: 16,
    marginBottom: 16,
    height: 52,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#1C1917',
    fontSize: 14,
    fontWeight: 'normal',
    height: '100%',
  },
  eyeIcon: {
    padding: 8,
  },
  loginButton: {
    flexDirection: 'row',
    backgroundColor: '#FBBF24', // Amber/Yellow 400
    borderRadius: 12,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FBBF24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  loginButtonText: {
    color: '#0F172A', // Slate 900
    fontSize: 15,
    fontWeight: 'bold',
  },
  buttonArrow: {
    marginLeft: 8,
  },
  footerText: {
    marginTop: 32,
    color: '#A8A29E', // Stone 400
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
});
