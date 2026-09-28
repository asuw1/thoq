import { Redirect } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStore } from '@/store/provider';
import { radius, space } from '@/theme/tokens';
import { usePalette } from '@/theme/use-palette';
import { Txt } from '@/ui/primitives';

const LABELS: Record<string, string> = {
  index: 'For you',
  search: 'Search',
  log: 'Log',
  feed: 'Feed',
  you: 'You',
};

/** Text-only tab bar. The active tab gets an accent rule above its label; "Log" is the one filled block. */
function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const c = usePalette();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm), backgroundColor: c.paper, borderTopColor: c.rule }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const isLog = route.name === 'log';
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
            <View style={[styles.indicator, { backgroundColor: focused && !isLog ? c.accent : 'transparent' }]} />
            {isLog ? (
              <View style={[styles.logBlock, { backgroundColor: c.ink }]}>
                <Txt v="label" tone="onInk">
                  + Log
                </Txt>
              </View>
            ) : (
              <Txt v="label" tone={focused ? 'ink' : 'ink3'} style={{ paddingVertical: 6 }}>
                {LABELS[route.name] ?? route.name}
              </Txt>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { state } = useStore();
  if (!state.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="log" />
      <Tabs.Screen name="feed" />
      <Tabs.Screen name="you" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.sm },
  item: { flex: 1, alignItems: 'center', paddingTop: 0 },
  indicator: { height: 2, alignSelf: 'stretch', marginHorizontal: space.md, marginBottom: space.sm },
  logBlock: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius },
});
