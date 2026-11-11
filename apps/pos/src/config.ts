/**
 * Where the API lives. Set EXPO_PUBLIC_API_URL when you build or start the app:
 *   - Android emulator reaching the API on your computer:  http://10.0.2.2:3001/api  (the default)
 *   - A real phone on the same Wi-Fi:                      http://<your computer's IP>:3001/api
 *   - Production:                                          https://<the hosted API>/api
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3001/api';
