import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCv62PX9S6awmninPFVXzYEr_RM0Jl-3Xg",
  authDomain: "almendros-mall.firebaseapp.com",
  projectId: "almendros-mall",
  storageBucket: "almendros-mall.firebasestorage.app",
  messagingSenderId: "160015483102",
  appId: "1:160015483102:web:7f801fe29353ef55f7c24f"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
