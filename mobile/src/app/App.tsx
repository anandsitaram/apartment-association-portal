import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppInner from './AppInner';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppInner />
    </GestureHandlerRootView>
  );
}
