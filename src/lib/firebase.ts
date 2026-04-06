/**
 * Firebase 初期化 — Firestore リアルタイム同期用
 *
 * 環境変数 (VITE_FIREBASE_*) が未設定の場合は Firebase を初期化せず、
 * 運営システムは従来どおり IndexedDB のみで動作する。
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  type Firestore,
  enableMultiTabIndexedDbPersistence,
} from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth';

// Vite 環境変数から Firebase 設定を取得
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Firebase が有効かどうか（環境変数が設定されているか） */
export const isFirebaseEnabled =
  !!firebaseConfig.apiKey && !!firebaseConfig.projectId;

let app: FirebaseApp | null = null;
let firestoreDb: Firestore | null = null;
let auth: Auth | null = null;

if (isFirebaseEnabled) {
  app = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  auth = getAuth(app);

  // オフラインキャッシュを有効化（再接続時の自動同期に対応）
  enableMultiTabIndexedDbPersistence(firestoreDb).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firebase] 複数タブでの永続化は利用できません');
    } else if (err.code === 'unimplemented') {
      console.warn('[Firebase] このブラウザは永続化に対応していません');
    }
  });
}

/** Firestore インスタンス（Firebase 無効時は null） */
export function getFirestoreDb(): Firestore | null {
  return firestoreDb;
}

/** Firebase Auth インスタンス（Firebase 無効時は null） */
export function getFirebaseAuth(): Auth | null {
  return auth;
}

export { app as firebaseApp };
