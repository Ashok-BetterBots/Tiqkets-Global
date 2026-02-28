import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation, CommonActions } from '@react-navigation/native';

export function useNotificationHandler() {
  const navigation = useNavigation();
  const responseListener = useRef<Notifications.EventSubscription | null>(null);
  const receivedListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      if (data?.type === 'your_turn' || data?.type === 'queue_joined' || 
          data?.type === 'status_change' || data?.type === 'next' ||
          data?.type === 'get_ready' || data?.type === 'position_3' ||
          data?.type === 'dinein_called' || data?.type === 'checkin_confirmed' ||
          data?.category === 'queue_notification') {
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

    receivedListener.current = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data?.type === 'status_change') {
        console.log('Status change notification received:', data.newStatus);
      }
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
      if (receivedListener.current) {
        receivedListener.current.remove();
      }
    };
  }, [navigation]);
}
