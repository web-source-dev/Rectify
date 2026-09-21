export type User = {
  id: string;
  name: string | null;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  user: User;
};

export type RootStackParamList = {
  Splash: undefined;
  WebView: undefined;
  Pin: undefined;
  Name: { token: string; userId: string };
  Chat: undefined;
};
