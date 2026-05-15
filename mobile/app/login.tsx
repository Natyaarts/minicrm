import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  Image, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Alert
} from 'react-native';
import { router } from 'expo-router';
import { loginUser } from '../src/api/auth';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    const result = await loginUser(username, password);
    setLoading(false);

    if (result.success) {
      // Redirect to the main tabs dashboard
      router.replace('/(tabs)');
    } else {
      Alert.alert('Login Failed', result.error);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.brandSection}>
        <View style={styles.logoContainer}>
          <Image 
            source={{ uri: 'https://natyaarts.org/logo.png' }} 
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandTitle}>Natya Arts</Text>
        <Text style={styles.brandSubtitle}>Premium ERP System</Text>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.welcomeText}>Welcome Back</Text>
        <Text style={styles.signInText}>Sign in to your account</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>USERNAME</Text>
          <TextInput 
            style={styles.input}
            placeholder="Enter your username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>PASSWORD</Text>
          <TextInput 
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity 
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log In to System</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>© 2026 Natya Arts Academy</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  brandSection: {
    flex: 1,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
  },
  logoContainer: {
    width: 120,
    height: 120,
    backgroundColor: '#fff',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#333',
    marginTop: 20,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  formSection: {
    flex: 1.5,
    padding: 30,
    paddingTop: 40,
  },
  welcomeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1a1a1a',
  },
  signInText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    color: '#aaa',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 5,
  },
  input: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 15,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    borderWidth: 1,
    borderColor: '#eee',
  },
  button: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  footerText: {
    textAlign: 'center',
    color: '#ccc',
    fontSize: 10,
    fontWeight: 'bold',
    marginTop: 40,
    letterSpacing: 1,
  }
});
