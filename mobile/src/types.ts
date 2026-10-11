export type User = {
  id: string;
  name: string | null;
};

export type MessageMedia = {
  id: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  url: string;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  media: MessageMedia | null;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  user: User;
};

export type RootStackParamList = {
  Splash: { locked?: boolean; key?: number; arm?: boolean } | undefined;
  WebView: { url?: string; title?: string } | undefined;
  Pin: { returnTo?: 'Chat' | 'WebView' } | undefined;
  Name: { token: string; userId: string };
  Chat: undefined;
};
