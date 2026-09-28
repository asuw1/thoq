import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { PLACE_BY_ID } from '@/domain/seed-places';
import { useStore } from '@/store/provider';
import { newId } from '@/store/state';
import { BackBar, Button, Field, PageHead, Screen, Txt } from '@/ui/primitives';

/** Create a list. When opened from a place (`?placeId=`), that place goes in first. */
export default function NewList() {
  const { placeId } = useLocalSearchParams<{ placeId?: string }>();
  const router = useRouter();
  const { dispatch } = useStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const seed = placeId && PLACE_BY_ID[placeId] ? [placeId] : [];

  const create = () => {
    const id = newId('l');
    dispatch({ type: 'createList', id, title: title.trim(), description: description.trim(), placeIds: seed });
    router.replace({ pathname: '/list/[id]', params: { id } });
  };

  return (
    <Screen footer={<Button label="Create list" disabled={!title.trim()} onPress={create} />}>
      <BackBar label="Cancel" />
      <PageHead title="New list" />
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Saturday brunch, ranked" autoFocus maxLength={60} />
      <Field label="What’s it for (optional)" value={description} onChangeText={setDescription} placeholder="One line on what ties these places together" maxLength={140} />
      {seed.length ? (
        <Txt v="small" tone="ink2">
          Starts with {PLACE_BY_ID[seed[0]].name}.
        </Txt>
      ) : null}
    </Screen>
  );
}
