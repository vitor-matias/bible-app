import { InjectionToken } from '@angular/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';

export const APP_PLUGIN = new InjectionToken<typeof App>('Capacitor App Plugin', {
  providedIn: 'root',
  factory: () => App
});

export const NETWORK_PLUGIN = new InjectionToken<typeof Network>('Capacitor Network Plugin', {
  providedIn: 'root',
  factory: () => Network
});

export const SHARE_PLUGIN = new InjectionToken<typeof Share>('Capacitor Share Plugin', {
  providedIn: 'root',
  factory: () => Share
});
