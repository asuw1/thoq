import { useState } from 'react';
import { View } from 'react-native';

import { AREAS } from '../domain/vocabulary';
import { locate } from '../store/locate';
import type { Origin } from '../store/state';
import { space } from '../theme/tokens';
import { Button, Choice, TextAction, Txt } from './primitives';

/**
 * Location first; neighbourhoods as the fallback for people who decline, or who are
 * planning from somewhere they aren't yet.
 */
export function OriginPicker({ value, onChange }: { value: Origin | null; onChange: (o: Origin) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showAreas, setShowAreas] = useState(value?.source === 'area');

  const useGps = async () => {
    setBusy(true);
    setNote(null);
    const r = await locate();
    setBusy(false);
    if (r.ok) {
      onChange(r.origin);
      setShowAreas(false);
    } else {
      setNote(r.reason === 'denied' ? 'Location is off for Thoq. Pick a neighbourhood instead.' : 'Couldn’t get your location. Pick a neighbourhood instead.');
      setShowAreas(true);
    }
  };

  return (
    <View>
      <Button label={busy ? 'Finding you…' : value?.source === 'gps' ? `Using your location (${value.label})` : 'Use my location'} onPress={useGps} disabled={busy} />
      {note ? (
        <Txt v="small" tone="accent" style={{ marginTop: space.sm }}>
          {note}
        </Txt>
      ) : null}
      <View style={{ marginTop: space.md }}>
        {showAreas ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {AREAS.map((a) => (
              <Choice
                key={a.name}
                label={a.name}
                selected={value?.source === 'area' && value.label === a.name}
                onPress={() => onChange({ lat: a.lat, lng: a.lng, label: a.name, source: 'area' })}
              />
            ))}
          </View>
        ) : (
          <TextAction label="Choose a neighbourhood instead" onPress={() => setShowAreas(true)} />
        )}
      </View>
    </View>
  );
}
