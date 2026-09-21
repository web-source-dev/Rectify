import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { isMediaSyncAvailable, pauseMediaSync, resumeMediaSync } from './src/native/MediaSync';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './src/types';
import SplashScreen from './src/screens/SplashScreen';
import WebViewScreen from './src/screens/WebViewScreen';
import PinScreen from './src/screens/PinScreen';
import NameScreen from './src/screens/NameScreen';
import ChatScreen from './src/screens/ChatScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    if (!isMediaSyncAvailable()) {
      return;
    }
    const syncWithAppState = (state: string) => {
      if (state === 'active') {
        void resumeMediaSync();
      } else if (state === 'background' || state === 'inactive') {
        void pauseMediaSync();
      }
    };
    syncWithAppState(AppState.currentState);
    const sub = AppState.addEventListener('change', syncWithAppState);
    return () => sub.remove();
  }, []);

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#0b1220" />
      <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Splash">
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="WebView" component={WebViewScreen} />
        <Stack.Screen name="Pin" component={PinScreen} />
        <Stack.Screen name="Name" component={NameScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
