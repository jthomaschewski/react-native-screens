import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { Button } from '@apps/shared';

type ParamList = {
  Home: undefined;
  Churn: { iteration: number };
};

const ITERATIONS = 20;
const ITEMS = Array.from({ length: 12 }, (_, index) => index);

// Consumed by the next commit of the Churn screen, so that the commit removing
// the screen directly follows a commit that moves views inside of it.
let pendingRemoval: (() => void) | null = null;

const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function HomeScreen({
  navigation,
  route,
}: NativeStackScreenProps<ParamList, 'Home'>) {
  const [status, setStatus] = useState('idle');

  const run = async (remove: () => void) => {
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      setStatus(`iteration ${iteration + 1} of ${ITERATIONS}`);
      navigation.push('Churn', { iteration });
      await sleep(300 + Math.random() * 400);
      pendingRemoval = remove;
      await sleep(700);
    }
    setStatus('done, no crash');
  };

  return (
    <View style={styles.home}>
      <Text style={styles.text}>
        Each run pushes a screen whose views are re-parented (view flattening)
        and reordered on every frame, and removes it right after such a change.
        The app must not crash with "The specified child already has a parent",
        and the removed screen should keep its content during the exit
        animation.
      </Text>
      <Button
        title="Pop while views move"
        onPress={() => run(() => navigation.popTo('Home'))}
      />
      <Button
        title="Reset while views move"
        onPress={() =>
          run(() =>
            navigation.reset({
              index: 0,
              routes: [{ name: 'Home', key: route.key }],
            }),
          )
        }
      />
      <Text style={styles.text}>Status: {status}</Text>
    </View>
  );
}

function ChurnScreen({ route }: NativeStackScreenProps<ParamList, 'Churn'>) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let frame = requestAnimationFrame(function loop() {
      setTick(value => value + 1);
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    const remove = pendingRemoval;
    if (remove !== null) {
      pendingRemoval = null;
      Promise.resolve().then(remove);
    }
  });

  const isEvenTick = tick % 2 === 0;
  const rotatedItems = ITEMS.map(
    (_, index) => ITEMS[(index + tick) % ITEMS.length],
  );

  return (
    <ScrollView style={styles.churn}>
      <Text style={styles.title}>Iteration {route.params.iteration}</Text>
      {ITEMS.map(item => (
        <View key={`flatten-${item}`} style={styles.padded}>
          {/* Toggling the opacity flattens and unflattens this view, which moves the Text to another parent */}
          <View
            style={isEvenTick === (item % 2 === 0) ? styles.dimmed : undefined}>
            <Text>Item {item}</Text>
          </View>
        </View>
      ))}
      {rotatedItems.map(item => (
        <View
          key={`reorder-${item}`}
          style={[
            styles.row,
            { backgroundColor: `hsl(${item * 30}, 70%, 70%)` },
          ]}>
          <Text>Row {item}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const Stack = createNativeStackNavigator<ParamList>();

export default function Test4677() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Churn" component={ChurnScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  home: {
    flex: 1,
    padding: 16,
  },
  text: {
    marginVertical: 8,
  },
  churn: {
    flex: 1,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 24,
    padding: 16,
  },
  padded: {
    padding: 2,
  },
  dimmed: {
    opacity: 0.6,
  },
  row: {
    height: 20,
    margin: 2,
  },
});
