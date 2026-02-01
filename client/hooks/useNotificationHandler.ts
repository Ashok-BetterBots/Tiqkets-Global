import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation, CommonActions } from '@react-navigation/native';

export function useNotificationHandler() {
  const navigation = useNavigation();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      if (data?.category === 'queue_notification') {
        try {
          navigation.dispatch(
            CommonActions.navigate({
              name: 'QueueDetails',
            })
          );
        } catch (error) {
          console.log('Navigation error:', error);
        }
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [navigation]);
}
